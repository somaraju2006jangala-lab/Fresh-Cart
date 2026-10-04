import React, { useState, useEffect, useRef } from 'react';
import { CartItem, CustomerOrder, Coupon, DeliveryChargeRule, PaymentSettings } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/currency';
import { useLanguage } from '../context/LanguageContext';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../services/settingsService';
import {
  getStoredPaymentSettings,
  fetchServerPaymentSettings,
  onPaymentSettingsChange,
  DEFAULT_PAYMENT_SETTINGS,
} from '../services/paymentSettingsService';
import { generateQrDataUrl } from '../utils/qrCodeGenerator';
import {
  CheckCircle,
  X,
  Banknote,
  MapPin,
  Clock,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Tag,
  Zap,
  AlertTriangle,
  QrCode,
  Smartphone,
  Copy,
  Check,
  UploadCloud,
  FileText,
  FileCheck,
  AlertCircle,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { generateOrderOtp, resendOrderOtp } from '../services/otpClientService';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  appliedCoupon: string | null;
  onClearCart: () => void;
  onNavigateToDashboard?: () => void;
  onOrderPlaced?: (items: CartItem[], placedOrder?: CustomerOrder) => void;
  coupons?: Coupon[];
  onApplyCoupon?: (code: string) => void;
  onRemoveCoupon?: () => void;
  deliveryCharges?: number;
  deliveryRules?: DeliveryChargeRule[];
  taxAndPackingPercentage?: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  appliedCoupon,
  onClearCart,
  onNavigateToDashboard,
  onOrderPlaced,
  coupons = [],
  onApplyCoupon,
  onRemoveCoupon,
  deliveryCharges = 40,
  deliveryRules,
  taxAndPackingPercentage,
}) => {
  const { currentUser, addOrder } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState<'details' | 'success' | 'pending_verification'>('details');
  const [address, setAddress] = useState(
    currentUser?.address || '742 Evergreen Terrace, Apt 4B'
  );
  const [deliveryNote, setDeliveryNote] = useState('Leave with doorman in thermal tote');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_qr' | 'upi_app'>('cash');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutCouponInput, setCheckoutCouponInput] = useState('');
  const [checkoutCouponError, setCheckoutCouponError] = useState('');

  // Payment Settings state
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(getStoredPaymentSettings());
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [directUpiLaunched, setDirectUpiLaunched] = useState(false);

  // Payment Proof upload states
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string>('');
  const [proofFileType, setProofFileType] = useState<string>('');
  const [proofFileSize, setProofFileSize] = useState<number>(0);
  const [proofError, setProofError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Order Handover OTP States for successful order placement screen
  const [orderHandoverOtp, setOrderHandoverOtp] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [isOtpExpired, setIsOtpExpired] = useState<boolean>(false);
  const [isResendingOtp, setIsResendingOtp] = useState<boolean>(false);
  const [placedOrderId, setPlacedOrderId] = useState<string>('');

  useEffect(() => {
    if (currentUser?.address) {
      setAddress(currentUser.address);
    }
  }, [currentUser]);

  // Synchronize payment settings
  useEffect(() => {
    fetchServerPaymentSettings().then((s) => {
      if (s) setPaymentSettings(s);
    });
    return onPaymentSettingsChange((s) => {
      setPaymentSettings(s);
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchServerPaymentSettings().then((s) => {
        if (s) setPaymentSettings(s);
      });
      setProofError('');
      setDirectUpiLaunched(false);
    }
  }, [isOpen]);

  // Check OTP 10-minute expiry
  useEffect(() => {
    if (!otpExpiresAt || !orderHandoverOtp) return;

    const checkExpiry = () => {
      if (Date.now() > otpExpiresAt) {
        setIsOtpExpired(true);
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [otpExpiresAt, orderHandoverOtp]);

  if (!isOpen) return null;

  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const activeCoupon = appliedCoupon
    ? coupons.find(
        (c) => c.code.toUpperCase() === appliedCoupon.toUpperCase() && c.isActive
      )
    : null;
  const discountPercent = activeCoupon ? activeCoupon.discountPercentage : 0;
  const discount = Math.round((subtotal * discountPercent) / 100);

  // Delivery Charges calculation based on custom admin-controlled rules
  const effectiveRules = deliveryRules && deliveryRules.length > 0
    ? deliveryRules
    : DEFAULT_DELIVERY_RULES;

  const applicableDeliveryRule = items.length > 0 && subtotal > 0
    ? getApplicableDeliveryChargeRule(effectiveRules, subtotal)
    : null;

  const deliveryChargesAmount = items.length > 0 && subtotal > 0 && applicableDeliveryRule
    ? applicableDeliveryRule.deliveryCharge
    : 0;

  const total = Math.max(0, Math.round((subtotal - discount + deliveryChargesAmount) * 100) / 100);

  // Generate dynamic standard UPI payment string
  const upiPayee = paymentSettings.payeeName || 'FreshCart Grocery Store';
  const upiId = paymentSettings.upiId || 'freshcart@upi';
  const upiPaymentUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayee)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent('FreshCart Grocery')}`;

  // Active QR code: admin-uploaded image URL/data URL or dynamically rendered SVG QR
  const activeQrCodeUrl =
    paymentSettings.qrCodeUrl && paymentSettings.qrCodeUrl.trim().length > 0
      ? paymentSettings.qrCodeUrl
      : generateQrDataUrl(upiPaymentUri);

  const handleCopyUpi = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(upiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  const handleOpenUpiDeepLink = () => {
    window.location.href = upiPaymentUri;
  };

  const handleDirectUpiPayNow = () => {
    setDirectUpiLaunched(true);
    window.location.href = upiPaymentUri;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProofError('');

    // Format validation: JPG, PNG, PDF
    const allowedExts = ['jpg', 'jpeg', 'png', 'pdf'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const isAllowedExt = allowedExts.includes(extension);
    const isAllowedMime = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/pdf',
    ].includes(file.type.toLowerCase());

    if (!isAllowedExt && !isAllowedMime) {
      setProofError('Unsupported file format. Please upload JPG, PNG, or PDF.');
      setProofFile(null);
      setProofDataUrl(null);
      return;
    }

    // Size validation: max 10 MB = 10,485,760 bytes
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setProofError('File exceeds maximum size of 10 MB. Please upload a smaller file.');
      setProofFile(null);
      setProofDataUrl(null);
      return;
    }

    setProofFile(file);
    setProofFileName(file.name);
    setProofFileType(file.type || (extension === 'pdf' ? 'application/pdf' : 'image/png'));
    setProofFileSize(file.size);

    const reader = new FileReader();
    reader.onload = () => {
      setProofDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleReplaceProof = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveProof = () => {
    setProofFile(null);
    setProofDataUrl(null);
    setProofFileName('');
    setProofFileType('');
    setProofFileSize(0);
    setProofError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleApplyCheckoutCoupon = () => {
    const code = checkoutCouponInput.trim().toUpperCase();
    if (!code) return;

    const matched = coupons.find((c) => c.code.toUpperCase() === code);
    if (!matched) {
      setCheckoutCouponError(t('invalidCouponError') || 'Invalid coupon code.');
      return;
    }

    if (!matched.isActive) {
      setCheckoutCouponError(t('disabledCouponError') || 'This coupon code is currently disabled.');
      return;
    }

    onApplyCoupon?.(matched.code);
    setCheckoutCouponInput('');
    setCheckoutCouponError('');
  };

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();

    // Online payment validation: Payment proof upload is required
    if (paymentMethod !== 'cash' && !proofDataUrl) {
      setProofError('Please upload your payment confirmation screenshot or receipt before submitting.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(async () => {
      setIsSubmitting(false);
      const orderNum = Math.floor(1000 + Math.random() * 9000);
      const generatedOrder = `#FC-${orderNum}`;
      setOrderNumber(String(orderNum));

      const customerPhone = currentUser?.phone?.trim() || '';

      if (paymentMethod === 'cash') {
        // Cash on Delivery flow: immediate order placement, inventory reduction, cart clearing, OTP generation
        const newCustomerOrder: CustomerOrder = {
          id: generatedOrder,
          customerId: currentUser?.id || 'guest_user',
          customerName: currentUser?.name || 'Guest Customer',
          customerEmail: currentUser?.email,
          customerPhone: customerPhone || undefined,
          deliveryAddress: address,
          deliveryTimeSlot: '24–30 Minutes (Direct Express Pod)',
          estimatedDeliveryTime: 'Picking in progress',
          items: [...items],
          subtotal,
          discount,
          total,
          couponCode: appliedCoupon || undefined,
          status: 'Picking',
          createdAt: new Date().toISOString(),
          paymentMethod: 'Cash on Delivery',
          paymentStatus: 'Pending',
          paymentProofStatus: 'Not Uploaded',
        };

        addOrder(newCustomerOrder);

        try {
          const otpRes = await generateOrderOtp(
            generatedOrder,
            newCustomerOrder.customerId || 'guest_user',
            customerPhone || ''
          );

          if (otpRes.success && otpRes.otp) {
            setOrderHandoverOtp(otpRes.otp);
            setOtpExpiresAt(otpRes.expiresAt || (Date.now() + 10 * 60 * 1000));
            setIsOtpExpired(false);
          }
        } catch {
          // ignore
        }

        setPlacedOrderId(generatedOrder);
        onOrderPlaced?.(items, newCustomerOrder);
        setStep('success');
        onClearCart();
      } else {
        // Online Payment Flow (UPI / QR or Direct UPI App):
        // Requirement 13: Do NOT deduct inventory before verification. Do NOT clear cart before completion.
        const paymentLabel = paymentMethod === 'upi_qr' ? 'UPI / QR Payment' : 'Direct UPI App Payment';
        const newCustomerOrder: CustomerOrder = {
          id: generatedOrder,
          customerId: currentUser?.id || 'guest_user',
          customerName: currentUser?.name || 'Guest Customer',
          customerEmail: currentUser?.email,
          customerPhone: customerPhone || undefined,
          deliveryAddress: address,
          deliveryTimeSlot: '24–30 Minutes (Direct Express Pod)',
          estimatedDeliveryTime: 'Awaiting Payment Verification',
          items: [...items],
          subtotal,
          discount,
          total,
          couponCode: appliedCoupon || undefined,
          status: 'Pending',
          createdAt: new Date().toISOString(),
          paymentMethod: paymentLabel,
          paymentStatus: 'Pending Verification',
          paymentProofStatus: 'Under Verification',
          paymentProofUrl: proofDataUrl || undefined,
          paymentProofName: proofFileName || undefined,
          paymentProofSize: proofFileSize || undefined,
          paymentProofType: proofFileType || undefined,
          paymentProofUploadedAt: new Date().toISOString(),
        };

        addOrder(newCustomerOrder);

        // Upload proof to backend server
        if (proofDataUrl) {
          fetch(`/api/orders/${encodeURIComponent(generatedOrder)}/payment-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              proofDataUrl,
              fileName: proofFileName,
              fileType: proofFileType,
              fileSize: proofFileSize,
            }),
          }).catch(() => {});
        }

        setPlacedOrderId(generatedOrder);
        onOrderPlaced?.([], newCustomerOrder);
        setStep('pending_verification');
      }
    }, 800);
  };

  const handleCustomerResendOtp = async () => {
    if (!placedOrderId || isResendingOtp) return;
    setIsResendingOtp(true);
    try {
      const customerPhone = currentUser?.phone?.trim() || '';
      const res = await resendOrderOtp(
        placedOrderId,
        currentUser?.id || 'guest_user',
        customerPhone
      );
      if (res.success && res.otp) {
        setOrderHandoverOtp(res.otp);
        setOtpExpiresAt(res.expiresAt || (Date.now() + 10 * 60 * 1000));
        setIsOtpExpired(false);
      }
    } catch {
      // ignore
    } finally {
      setIsResendingOtp(false);
    }
  };

  const handleDone = () => {
    setStep('details');
    setOrderHandoverOtp(null);
    setOtpExpiresAt(null);
    setIsOtpExpired(false);
    setPlacedOrderId('');
    handleRemoveProof();
    setDirectUpiLaunched(false);
    onClose();
  };

  // Reusable Payment Proof Section
  const renderPaymentProofSection = () => (
    <div
      id="checkout-payment-proof-section"
      className="mt-3 pt-3 border-t border-white/50 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-bold text-[#0b1c30] flex items-center gap-1.5">
          <UploadCloud className="w-4 h-4 text-[#006b2c]" />
          <span>PAYMENT PROOF *</span>
        </label>
        <span className="text-[10px] text-[#565e74] font-medium bg-white/40 px-2 py-0.5 rounded border border-white/50">
          Required for verification
        </span>
      </div>

      <p className="text-[11px] text-[#565e74]">
        Upload a clear screenshot or receipt of your payment confirmation showing transaction details.
      </p>

      <div className="text-[10px] text-[#565e74] flex items-center justify-between bg-white/20 p-1.5 rounded-lg border border-white/30">
        <span>Accepted formats: <strong>JPG, PNG, PDF</strong></span>
        <span>Maximum size: <strong>10 MB</strong></span>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        id="checkout-payment-proof-input"
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!proofFile ? (
        <div>
          <button
            type="button"
            id="checkout-upload-proof-btn"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 px-3 border-2 border-dashed border-[#006b2c]/40 hover:border-[#006b2c] rounded-xl bg-white/30 hover:bg-white/50 text-[12px] font-semibold text-[#006b2c] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-[#006b2c]" />
            <span>Upload Payment Proof</span>
          </button>
        </div>
      ) : (
        <div
          id="checkout-proof-file-card"
          className="bg-white/60 backdrop-blur-md rounded-xl p-3 border border-white/80 space-y-2 text-[12px]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#006b2c]/10 text-[#006b2c] flex items-center justify-center shrink-0">
                {proofFileType.includes('pdf') ? (
                  <FileText className="w-4 h-4 text-[#dc2626]" />
                ) : (
                  <FileCheck className="w-4 h-4 text-[#006b2c]" />
                )}
              </div>
              <div className="min-w-0">
                <p id="checkout-proof-filename" className="font-semibold text-[#0b1c30] truncate max-w-[200px] sm:max-w-[260px]">
                  {proofFileName}
                </p>
                <p className="text-[10px] text-[#565e74]">
                  {proofFileType || 'Document'} · {formatBytes(proofFileSize)}
                </p>
              </div>
            </div>

            <span
              id="checkout-proof-upload-status"
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#dcfce7] text-[#15803d] border border-[#86efac] shrink-0"
            >
              Ready to Submit
            </span>
          </div>

          {proofPreview && proofFileType.startsWith('image/') && (
            <div className="pt-1">
              <img
                src={proofPreview}
                alt="Proof preview"
                className="max-h-32 rounded-lg border border-white/80 mx-auto object-contain shadow-2xs"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/40">
            <button
              type="button"
              id="checkout-replace-proof-btn"
              onClick={handleReplaceProof}
              className="px-2.5 py-1 text-[11px] font-semibold text-[#006b2c] hover:bg-[#006b2c]/10 rounded-lg transition-colors cursor-pointer"
            >
              Replace
            </button>
            <button
              type="button"
              id="checkout-remove-proof-btn"
              onClick={handleRemoveProof}
              className="px-2.5 py-1 text-[11px] font-semibold text-[#ba1a1a] hover:bg-[#ba1a1a]/10 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}

      {proofError && (
        <div
          id="checkout-proof-error-msg"
          className="p-2 rounded-lg bg-[#fee2e2] border border-[#fecaca] text-[11px] font-semibold text-[#b91c1c] flex items-center gap-1.5"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{proofError}</span>
        </div>
      )}
    </div>
  );

  const proofPreview = proofDataUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/40 backdrop-blur-xs">
      <div className="bg-white/45 backdrop-blur-xl rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-white/60 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/50 bg-white/30 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#006b2c] text-white flex items-center justify-center shadow-2xs">
              <Zap className="w-4 h-4 text-[#7ffc97]" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[#0b1c30] font-display">
                {step === 'details'
                  ? t('expressCheckout')
                  : step === 'pending_verification'
                  ? 'Payment Pending Verification'
                  : t('orderConfirmed')}
              </h2>
              <p className="text-[11px] text-[#565e74]">
                {step === 'details'
                  ? t('thirtyMinDelivery')
                  : `${t('orderNumber')}: #${orderNumber}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={step === 'details' ? onClose : handleDone}
            className="w-8 h-8 rounded-lg text-[#565e74] hover:bg-white/60 hover:text-[#0b1c30] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {step === 'details' ? (
          <form onSubmit={handlePlaceOrder} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Speed delivery banner */}
            <div className="bg-white/25 backdrop-blur-xs border border-white/45 p-3 rounded-xl flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 text-[#006b2c] font-semibold">
                <Clock className="w-4 h-4 text-[#006b2c]" />
                <span>{t('estimatedArrival')}: {t('minsArrival')}</span>
              </div>
            </div>

            {/* Delivery Destination */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#006b2c]" />
                {t('deliveryAddress')}
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-white/55 rounded-lg bg-white/35 backdrop-blur-xs text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c]"
                placeholder={t('deliveryAddressPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30]">
                {t('fulfillmentNotes')}
              </label>
              <input
                type="text"
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-white/55 rounded-lg bg-white/35 backdrop-blur-xs text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c]"
                placeholder={t('fulfillmentNotesPlaceholder')}
              />
            </div>

            {/* Payment Method Selector with 3 independent options */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-[#006b2c]" />
                {t('paymentMethod')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 1. Cash on Delivery */}
                <button
                  type="button"
                  id="checkout-pay-cod-btn"
                  onClick={() => {
                    setPaymentMethod('cash');
                    setProofError('');
                  }}
                  className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'border-[#006b2c] bg-white/45 text-[#006b2c] ring-2 ring-[#006b2c]/20 shadow-xs'
                      : 'border-white/50 bg-white/25 text-[#565e74] hover:bg-white/40'
                  }`}
                >
                  <Banknote className="w-4 h-4 mx-auto mb-1 text-[#006b2c]" />
                  <span>{t('payCod')}</span>
                </button>

                {/* 2. UPI / QR Payment */}
                {paymentSettings.upiPaymentEnabled !== false && (
                  <button
                    type="button"
                    id="checkout-pay-upi-qr-btn"
                    onClick={() => {
                      setPaymentMethod('upi_qr');
                      setProofError('');
                    }}
                    className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                      paymentMethod === 'upi_qr'
                        ? 'border-[#006b2c] bg-white/45 text-[#006b2c] ring-2 ring-[#006b2c]/20 shadow-xs'
                        : 'border-white/50 bg-white/25 text-[#565e74] hover:bg-white/40'
                    }`}
                  >
                    <QrCode className="w-4 h-4 mx-auto mb-1 text-[#006b2c]" />
                    <span>{t('payUpiQr')}</span>
                  </button>
                )}

                {/* 3. Direct UPI App Payment */}
                {paymentSettings.directUpiAppEnabled !== false && (
                  <button
                    type="button"
                    id="checkout-pay-direct-upi-btn"
                    onClick={() => {
                      setPaymentMethod('upi_app');
                      setProofError('');
                    }}
                    className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                      paymentMethod === 'upi_app'
                        ? 'border-[#006b2c] bg-white/45 text-[#006b2c] ring-2 ring-[#006b2c]/20 shadow-xs'
                        : 'border-white/50 bg-white/25 text-[#565e74] hover:bg-white/40'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 mx-auto mb-1 text-[#006b2c]" />
                    <span>{t('payDirectUpi')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Option 2 Details: UPI / QR Payment Container */}
            {paymentMethod === 'upi_qr' && (
              <div
                id="checkout-upi-qr-section"
                className="bg-white/35 backdrop-blur-md rounded-2xl border border-white/60 p-4 space-y-3.5 shadow-xs animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/40">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#006b2c]/10 text-[#006b2c] flex items-center justify-center">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-bold text-[#0b1c30]">PAYMENT DETAILS</h4>
                      <p className="text-[11px] text-[#565e74]">Scan with any UPI app to pay</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-[#565e74] block">Order Amount</span>
                    <span id="checkout-upi-order-amount" className="text-[15px] font-bold text-[#006b2c] font-display tabular-nums">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <span className="text-[11px] text-[#565e74] font-medium block">Payee / Merchant Name</span>
                    <span id="checkout-merchant-name" className="font-semibold text-[#0b1c30] block">
                      {paymentSettings.payeeName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#565e74] font-medium block">UPI ID</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code id="checkout-upi-id" className="font-mono text-[12px] font-bold text-[#006b2c] bg-white/60 px-2 py-0.5 rounded border border-white/80 select-all">
                        {paymentSettings.upiId}
                      </code>
                      <button
                        type="button"
                        id="checkout-copy-upi-btn"
                        onClick={handleCopyUpi}
                        className="px-2 py-0.5 text-[11px] font-semibold rounded bg-[#006b2c]/10 text-[#006b2c] hover:bg-[#006b2c]/20 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {copiedUpi ? (
                          <>
                            <Check className="w-3 h-3 text-[#16a34a]" />
                            <span className="text-[#16a34a]">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy UPI ID</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* QR Code display */}
                <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-[#e2e8f0] shadow-2xs space-y-2">
                  <div className="p-2 bg-white rounded-lg border border-[#e2e8f0] shadow-inner">
                    <img
                      id="checkout-qr-code-img"
                      src={activeQrCodeUrl}
                      alt="UPI Payment QR Code"
                      className="w-44 h-44 sm:w-48 sm:h-48 object-contain rounded"
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-[12px] font-bold text-[#0b1c30] tracking-wide uppercase">
                      SCAN QR CODE TO PAY
                    </p>
                    <p className="text-[11px] text-[#565e74]">
                      Pay {formatINR(total)} via Google Pay, PhonePe, Paytm, or BHIM
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 w-full">
                    <button
                      type="button"
                      id="checkout-pay-with-upi-app-btn"
                      onClick={handleOpenUpiDeepLink}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Pay with UPI App →</span>
                    </button>
                  </div>
                </div>

                {/* Payment Proof Section */}
                {renderPaymentProofSection()}
              </div>
            )}

            {/* Option 3 Details: Direct UPI App Payment Container */}
            {paymentMethod === 'upi_app' && (
              <div
                id="checkout-direct-upi-section"
                className="bg-white/35 backdrop-blur-md rounded-2xl border border-white/60 p-4 space-y-3.5 shadow-xs animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/40">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#006b2c]/10 text-[#006b2c] flex items-center justify-center">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-bold text-[#0b1c30]">DIRECT UPI APP PAYMENT</h4>
                      <p className="text-[11px] text-[#565e74]">Pay directly using your installed UPI app</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-[#565e74] block">Amount to Pay</span>
                    <span id="checkout-direct-upi-amount" className="text-[15px] font-bold text-[#006b2c] font-display tabular-nums">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* App badges */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/40 border border-white/60 text-[11px] text-[#565e74] font-semibold">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#4285f4]" /> Google Pay
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#5f259f]" /> PhonePe
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#00baf2]" /> Paytm
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#ff7300]" /> BHIM UPI
                  </span>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    id="checkout-direct-pay-now-btn"
                    onClick={handleDirectUpiPayNow}
                    className="w-full py-3 rounded-xl bg-[#006b2c] text-white font-bold text-[14px] hover:bg-[#00873a] hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>PAY NOW ({formatINR(total)})</span>
                  </button>
                </div>

                {directUpiLaunched && (
                  <div className="p-3 bg-[#f0fdf4] border border-[#86efac] rounded-xl text-[12px] text-[#166534] space-y-1 animate-in fade-in">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Check className="w-4 h-4 text-[#16a34a]" />
                      <span>Payment flow initiated in UPI app</span>
                    </div>
                    <p className="text-[11px] text-[#166534]/90">
                      Complete your transaction in Google Pay, PhonePe, Paytm, or BHIM, then upload your transaction receipt/screenshot below.
                    </p>
                  </div>
                )}

                {/* Payment Proof Section */}
                {renderPaymentProofSection()}
              </div>
            )}

            {/* Order Items Review */}
            <div className="bg-white/25 backdrop-blur-xs p-3 rounded-xl border border-white/45 space-y-1.5">
              <span className="text-[11px] font-bold uppercase text-[#565e74] tracking-wider">
                {t('orderSummary', { count: items.length })}
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-[12px]">
                {items.map((it) => (
                  <div key={it.product.id} className="flex justify-between text-[#0b1c30]">
                    <span className="truncate max-w-[260px]">
                      {it.quantity} × {it.product.title} <span className="text-[#565e74] text-[11px]">({it.product.unit})</span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(it.product.price * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              {/* Promo Code input in Checkout */}
              <div className="pt-2 border-t border-white/45">
                {appliedCoupon && activeCoupon ? (
                  <div className="flex items-center justify-between bg-[#dcfce7]/90 backdrop-blur-xs p-2 rounded-lg text-[12px] text-[#15803d]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{activeCoupon.code} ({activeCoupon.discountPercentage}% OFF)</span>
                    </div>
                    {onRemoveCoupon && (
                      <button
                        type="button"
                        id="checkout-remove-coupon-btn"
                        onClick={onRemoveCoupon}
                        className="text-[11px] underline hover:text-[#0b1c30] font-semibold cursor-pointer"
                      >
                        {t('remove')}
                      </button>
                    )}
                  </div>
                ) : onApplyCoupon ? (
                  <div className="space-y-1">
                    <div className="flex gap-1.5">
                      <input
                        id="checkout-coupon-input"
                        type="text"
                        value={checkoutCouponInput}
                        onChange={(e) => {
                          setCheckoutCouponInput(e.target.value.toUpperCase());
                          if (checkoutCouponError) setCheckoutCouponError('');
                        }}
                        placeholder={t('couponPlaceholder')}
                        className="flex-1 px-2.5 py-1 text-[12px] uppercase font-mono bg-white/35 border border-white/55 rounded-lg focus:outline-hidden focus:bg-white/60 focus:ring-1 focus:ring-[#006b2c]"
                      />
                      <button
                        type="button"
                        id="checkout-apply-coupon-btn"
                        onClick={handleApplyCheckoutCoupon}
                        className="px-3 py-1 bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        {t('apply')}
                      </button>
                    </div>
                    {checkoutCouponError && (
                      <p id="checkout-coupon-error" className="text-[11px] text-[#ba1a1a] font-medium">{checkoutCouponError}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Subtotal, Discount & Total */}
              <div className="pt-2 border-t border-white/45 space-y-1 text-[12px]">
                <div className="flex justify-between text-[#565e74]">
                  <span>{t('subtotal')}</span>
                  <span className="font-semibold text-[#0b1c30] tabular-nums">{formatINR(subtotal)}</span>
                </div>
                {discount > 0 && activeCoupon && (
                  <div className="flex justify-between text-[#006b2c] font-semibold">
                    <span>{t('discountCoupon')} ({activeCoupon.discountPercentage}% OFF)</span>
                    <span id="checkout-discount-amount" className="tabular-nums">-{formatINR(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#565e74]">
                  <span>{t('deliveryCharges') || 'Delivery Charges'}</span>
                  <span id="checkout-tax-packing-amount" data-testid="checkout-delivery-charges" className={`tabular-nums ${deliveryChargesAmount > 0 ? 'font-semibold text-[#0b1c30]' : 'text-[#006b2c] font-medium'}`}>
                    {items.length === 0 ? '₹0' : (deliveryChargesAmount > 0 ? formatINR(deliveryChargesAmount) : 'FREE')}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-[14px] text-[#0b1c30] pt-1 border-t border-white/45">
                  <span>{t('total')}</span>
                  <span id="checkout-final-total" className="text-[#006b2c] font-display tabular-nums">{formatINR(total)}</span>
                </div>
              </div>
            </div>

            {/* Place Order CTA */}
            <button
              type="submit"
              disabled={isSubmitting}
              id="checkout-submit-order-btn"
              className="w-full py-3 rounded-xl bg-[#006b2c] text-white font-semibold text-[14px] hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 active:translate-y-0 active:scale-98 shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {paymentMethod === 'cash' ? t('processingOrder') : 'Submitting Order & Proof...'}
                </span>
              ) : paymentMethod === 'cash' ? (
                <span>{t('placeOrder', { total: formatINR(total) })}</span>
              ) : (
                <span>Submit Order &amp; Payment Proof ({formatINR(total)})</span>
              )}
            </button>
          </form>
        ) : step === 'pending_verification' ? (
          /* Step: Online Payment Pending Verification Screen */
          <div className="p-5 sm:p-6 text-center space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="w-16 h-16 rounded-full bg-[#fef3c7] text-[#b45309] flex items-center justify-center mx-auto shadow-inner border border-[#fde68a]">
              <Clock className="w-8 h-8 text-[#b45309]" />
            </div>

            <div>
              <h3 className="text-[20px] font-bold text-[#0b1c30] font-display">
                Order Submitted
              </h3>
              <p className="text-[13px] text-[#b45309] font-semibold mt-1">
                Payment Status: Pending Verification
              </p>
              <p className="text-[12px] text-[#565e74] mt-1">
                Order ID: <strong className="text-[#0b1c30]">#{orderNumber}</strong>
              </p>
            </div>

            {/* Notice Alert */}
            <div className="p-3.5 bg-[#fef3c7]/60 border border-[#fde68a] rounded-xl text-left text-[12px] text-[#92400e] space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldCheck className="w-4 h-4 text-[#b45309] shrink-0" />
                <span>Verification in Progress</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Uploading payment proof does <strong>NOT</strong> automatically confirm your payment. Our store administrators will verify your transaction against our merchant account ({paymentSettings.upiId}) before dispatching your order.
              </p>
            </div>

            {/* Payment Summary */}
            <div className="bg-[#f8fafc] p-3.5 rounded-xl border border-[#e2e8f0] text-left space-y-2 text-[12px]">
              <span className="text-[11px] font-bold uppercase text-[#565e74] tracking-wider block">
                Payment Record
              </span>
              <div className="space-y-1.5 text-[#0b1c30]">
                <div className="flex justify-between">
                  <span className="text-[#565e74]">Payment Method:</span>
                  <span className="font-semibold">{paymentMethod === 'upi_qr' ? 'UPI / QR Payment' : 'Direct UPI App'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#565e74]">Amount:</span>
                  <span className="font-bold text-[#006b2c] tabular-nums">{formatINR(total)}</span>
                </div>
                {proofFileName && (
                  <div className="flex justify-between">
                    <span className="text-[#565e74]">Proof Attached:</span>
                    <span className="font-semibold text-slate-800 truncate max-w-[200px]">{proofFileName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#565e74]">Delivery To:</span>
                  <span className="font-medium truncate max-w-[200px]">{address}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {onNavigateToDashboard && (
                <button
                  type="button"
                  id="checkout-goto-dashboard-btn"
                  onClick={() => {
                    handleDone();
                    onNavigateToDashboard();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#eff4ff] text-[#006b2c] border border-[#d3e4fe] text-[13px] font-semibold hover:bg-[#dce9ff] transition-all cursor-pointer"
                >
                  Track in Dashboard
                </button>
              )}
              <button
                type="button"
                id="checkout-continue-shopping-btn"
                onClick={handleDone}
                className="flex-1 py-2.5 rounded-xl bg-[#006b2c] text-white text-[13px] font-semibold hover:bg-[#00873a] transition-all cursor-pointer"
              >
                Back to Storefront
              </button>
            </div>
          </div>
        ) : (
          /* Step: Cash On Delivery Success Screen with Handover OTP */
          <div className="p-5 sm:p-6 text-center space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="w-16 h-16 rounded-full bg-[#dcfce7] text-[#15803d] flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle className="w-8 h-8 text-[#006b2c]" />
            </div>

            <div>
              <h3 className="text-[20px] font-bold text-[#0b1c30] font-display">
                {t('orderConfirmed')}
              </h3>
              <p className="text-[13px] text-[#565e74] mt-1">
                {t('orderPlacedSuccess')}
              </p>
            </div>

            {/* Order Summary with Unit */}
            <div className="bg-[#f8fafc] p-3.5 rounded-xl border border-[#e2e8f0] text-left space-y-2">
              <span className="text-[11px] font-bold uppercase text-[#565e74] tracking-wider block">
                Order Summary ({items.length} items)
              </span>
              <div className="space-y-1 text-[12px] max-h-24 overflow-y-auto">
                {items.map((it) => (
                  <div key={it.product.id} className="flex justify-between text-[#0b1c30]">
                    <span className="truncate max-w-[260px]">
                      {it.quantity} × {it.product.title} <span className="text-[#565e74]">({it.product.unit})</span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(it.product.price * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-[#e2e8f0] flex justify-between font-bold text-[13px]">
                <span>Payment Mode</span>
                <span className="text-[#006b2c]">Cash on Delivery</span>
              </div>
              <div className="flex justify-between font-bold text-[13px]">
                <span>Total Due</span>
                <span className="text-[#006b2c] font-display tabular-nums">
                  {formatINR(total)}
                </span>
              </div>
            </div>

            {/* Order Handover OTP Card */}
            {orderHandoverOtp && (
              <div
                id="order-handover-otp-section"
                className="p-4 rounded-2xl bg-[#f0fdf4] border-2 border-[#86efac] text-center space-y-2 shadow-xs animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-[#15803d] uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-[#16a34a]" />
                  <span>Order Handover OTP</span>
                </div>

                {!isOtpExpired ? (
                  <div className="space-y-1">
                    <div
                      id="customer-order-handover-otp"
                      className="font-mono text-[32px] sm:text-[36px] font-extrabold tracking-widest text-[#006b2c] select-all leading-tight py-0.5"
                    >
                      {orderHandoverOtp}
                    </div>
                    <p className="text-[12px] text-[#166534] font-medium">
                      Please provide this OTP when receiving your order.
                    </p>
                    <div className="pt-1">
                      <button
                        type="button"
                        id="customer-resend-otp-btn"
                        onClick={handleCustomerResendOtp}
                        disabled={isResendingOtp}
                        className="text-[11px] font-semibold text-[#15803d] hover:text-[#006b2c] underline cursor-pointer disabled:opacity-50"
                      >
                        {isResendingOtp ? 'Generating New OTP...' : 'Resend OTP'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 py-1">
                    <div className="text-[13px] font-semibold text-[#dc2626] flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-[#dc2626]" />
                      <span>OTP expired. Please request a new OTP.</span>
                    </div>
                    <button
                      type="button"
                      id="customer-request-new-otp-btn"
                      onClick={handleCustomerResendOtp}
                      disabled={isResendingOtp}
                      className="px-4 py-1.5 rounded-lg bg-[#006b2c] hover:bg-[#005221] text-white text-[12px] font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isResendingOtp ? 'Generating New OTP...' : 'Request New OTP'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Live Tracking Visual */}
            <div className="bg-[#eff4ff] p-4 rounded-xl border border-[#d3e4fe] space-y-3 text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#006b2c] text-white flex items-center justify-center text-[12px] font-bold">
                  1
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#0b1c30]">
                    Picking &amp; Quality Inspection
                  </div>
                  <div className="text-[11px] text-[#006b2c] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#006b2c] animate-ping" />
                    In progress by Runner #4 · 3.8°C monitored
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 opacity-60">
                <div className="w-8 h-8 rounded-full bg-[#cbd5e1] text-[#0b1c30] flex items-center justify-center text-[12px] font-bold">
                  2
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#0b1c30]">
                    Eco Insulated Cold Pack
                  </div>
                  <div className="text-[11px] text-[#565e74]">
                    Departs via zero-emission electric bike
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 opacity-60">
                <div className="w-8 h-8 rounded-full bg-[#cbd5e1] text-[#0b1c30] flex items-center justify-center text-[12px] font-bold">
                  3
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#0b1c30]">
                    Arrival at {address}
                  </div>
                  <div className="text-[11px] text-[#565e74]">
                    Estimated in 24 minutes
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {onNavigateToDashboard && (
                <button
                  type="button"
                  id="checkout-goto-dashboard-btn"
                  onClick={() => {
                    handleDone();
                    onNavigateToDashboard();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#eff4ff] text-[#006b2c] border border-[#d3e4fe] text-[13px] font-semibold hover:bg-[#dce9ff] hover:-translate-y-0.5 hover:shadow-xs transition-all duration-200 cursor-pointer"
                >
                  {t('trackInDashboard')}
                </button>
              )}
              <button
                type="button"
                id="checkout-continue-shopping-btn"
                onClick={handleDone}
                className="flex-1 py-2.5 rounded-xl bg-[#006b2c] text-white text-[13px] font-semibold hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-md hover:brightness-105 active:translate-y-0 active:scale-98 transition-all duration-200 cursor-pointer"
              >
                {t('continueShopping')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
