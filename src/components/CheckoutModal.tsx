import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  initialPaymentMethod?: 'cash' | 'upi_qr' | 'upi_app';
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
  initialPaymentMethod = 'cash',
}) => {
  const { currentUser, addOrder } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState<'details' | 'success' | 'pending_verification'>('details');
  const [address, setAddress] = useState(
    currentUser?.address || '742 Evergreen Terrace, Apt 4B'
  );
  const [deliveryNote, setDeliveryNote] = useState('Leave with doorman in thermal tote');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_qr' | 'upi_app'>(initialPaymentMethod);
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

  // Generate dynamic standard UPI payment string using customer's actual order amount
  const upiPayee = (paymentSettings.payeeName || 'FreshCart Grocery Store').trim();
  const upiId = (paymentSettings.upiId || 'freshcart@upi').trim();
  // Format amount with actual order total (supports whole numbers and decimal amounts)
  const formattedAmount = total % 1 === 0 ? total.toString() : total.toFixed(2);
  const upiPaymentUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiPayee)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('FreshCart Grocery')}`;

  // Customer Checkout QR is dynamically generated using actual order total
  const dynamicQrCodeUrl = useMemo(() => {
    return generateQrDataUrl(upiPaymentUri, { size: 300 });
  }, [upiPaymentUri]);

  // Dynamic QR code for the customer's order total, with fallback if needed
  const activeQrCodeUrl = dynamicQrCodeUrl || paymentSettings.qrCodeUrl;

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
      className="mt-3 pt-3 border-t border-white/10 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-bold text-white flex items-center gap-1.5">
          <UploadCloud className="w-4 h-4 text-[#4ade80]" />
          <span>PAYMENT PROOF *</span>
        </label>
        <span className="text-[10px] text-slate-300 font-medium bg-white/10 px-2 py-0.5 rounded border border-white/15">
          Required for verification
        </span>
      </div>

      <p className="text-[11px] text-slate-400">
        Upload a clear screenshot or receipt of your payment confirmation showing transaction details.
      </p>

      <div className="text-[10px] text-slate-400 flex items-center justify-between bg-black/40 p-2 rounded-lg border border-white/10">
        <span>Accepted formats: <strong className="text-slate-200">JPG, PNG, PDF</strong></span>
        <span>Maximum size: <strong className="text-slate-200">10 MB</strong></span>
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
            className="w-full py-2.5 px-3 border-2 border-dashed border-[#00a843]/50 hover:border-[#22c55e] rounded-xl bg-emerald-950/20 hover:bg-emerald-950/40 text-[12px] font-semibold text-[#4ade80] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-[#4ade80]" />
            <span>Upload Payment Proof</span>
          </button>
        </div>
      ) : (
        <div
          id="checkout-proof-file-card"
          className="bg-black/50 backdrop-blur-md rounded-xl p-3 border border-white/15 space-y-2 text-[12px]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#006b2c]/30 text-[#4ade80] flex items-center justify-center shrink-0 border border-[#006b2c]/40">
                {proofFileType.includes('pdf') ? (
                  <FileText className="w-4 h-4 text-[#f87171]" />
                ) : (
                  <FileCheck className="w-4 h-4 text-[#4ade80]" />
                )}
              </div>
              <div className="min-w-0">
                <p id="checkout-proof-filename" className="font-semibold text-white truncate max-w-[200px] sm:max-w-[260px]">
                  {proofFileName}
                </p>
                <p className="text-[10px] text-slate-400">
                  {proofFileType || 'Document'} · {formatBytes(proofFileSize)}
                </p>
              </div>
            </div>

            <span
              id="checkout-proof-upload-status"
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-[#4ade80] border border-emerald-500/40 shrink-0"
            >
              Ready to Submit
            </span>
          </div>

          {proofPreview && proofFileType.startsWith('image/') && (
            <div className="pt-1">
              <img
                src={proofPreview}
                alt="Proof preview"
                className="max-h-32 rounded-lg border border-white/20 mx-auto object-contain shadow-2xs"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10">
            <button
              type="button"
              id="checkout-replace-proof-btn"
              onClick={handleReplaceProof}
              className="px-2.5 py-1 text-[11px] font-semibold text-[#4ade80] hover:bg-[#006b2c]/20 rounded-lg transition-colors cursor-pointer"
            >
              Replace
            </button>
            <button
              type="button"
              id="checkout-remove-proof-btn"
              onClick={handleRemoveProof}
              className="px-2.5 py-1 text-[11px] font-semibold text-[#f87171] hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
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
          className="p-2 rounded-lg bg-red-950/50 border border-red-500/40 text-[11px] font-semibold text-red-200 flex items-center gap-1.5"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span>{proofError}</span>
        </div>
      )}
    </div>
  );

  const proofPreview = proofDataUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0b131e]/82 backdrop-blur-xl rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_40px_rgba(0,107,44,0.12)] max-w-lg w-full overflow-hidden border border-white/15 flex flex-col text-[#f1f5f9] animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-white/[0.04] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#006b2c] text-white flex items-center justify-center shadow-2xs">
              <Zap className="w-4 h-4 text-[#7ffc97]" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-white font-display">
                {step === 'details'
                  ? t('expressCheckout')
                  : step === 'pending_verification'
                  ? 'Payment Pending Verification'
                  : t('orderConfirmed')}
              </h2>
              <p className="text-[11px] text-slate-400">
                {step === 'details'
                  ? t('thirtyMinDelivery')
                  : `${t('orderNumber')}: #${orderNumber}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={step === 'details' ? onClose : handleDone}
            className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {step === 'details' ? (
          <form onSubmit={handlePlaceOrder} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Speed delivery banner */}
            <div className="bg-emerald-950/30 backdrop-blur-xs border border-emerald-500/25 p-3 rounded-xl flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 text-[#4ade80] font-semibold">
                <Clock className="w-4 h-4 text-[#4ade80]" />
                <span>{t('estimatedArrival')}: {t('minsArrival')}</span>
              </div>
            </div>

            {/* Delivery Destination */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-slate-200 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#4ade80]" />
                {t('deliveryAddress')}
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 text-[13px] border border-white/15 rounded-xl bg-black/40 backdrop-blur-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:bg-black/60 focus:border-[#22c55e] focus:ring-2 focus:ring-[#006b2c]/40 transition-all"
                placeholder={t('deliveryAddressPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-slate-200">
                {t('fulfillmentNotes')}
              </label>
              <input
                type="text"
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                className="w-full px-3.5 py-2.5 text-[13px] border border-white/15 rounded-xl bg-black/40 backdrop-blur-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:bg-black/60 focus:border-[#22c55e] focus:ring-2 focus:ring-[#006b2c]/40 transition-all"
                placeholder={t('fulfillmentNotesPlaceholder')}
              />
            </div>

            {/* Payment Method Selector with 3 independent options */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-slate-200 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-[#4ade80]" />
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
                      ? 'border-[#22c55e] bg-[#006b2c]/30 text-[#4ade80] ring-2 ring-[#006b2c]/40 shadow-xs'
                      : 'border-white/15 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <Banknote className="w-4 h-4 mx-auto mb-1 text-[#4ade80]" />
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
                        ? 'border-[#22c55e] bg-[#006b2c]/30 text-[#4ade80] ring-2 ring-[#006b2c]/40 shadow-xs'
                        : 'border-white/15 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <QrCode className="w-4 h-4 mx-auto mb-1 text-[#4ade80]" />
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
                        ? 'border-[#22c55e] bg-[#006b2c]/30 text-[#4ade80] ring-2 ring-[#006b2c]/40 shadow-xs'
                        : 'border-white/15 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 mx-auto mb-1 text-[#4ade80]" />
                    <span>{t('payDirectUpi')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Option 2 Details: UPI / QR Payment Container */}
            {paymentMethod === 'upi_qr' && (
              <div
                id="checkout-upi-qr-section"
                className="bg-black/35 backdrop-blur-md rounded-2xl border border-white/15 p-4 space-y-3.5 shadow-xs animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#006b2c]/30 text-[#4ade80] flex items-center justify-center border border-[#006b2c]/40">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-bold text-white">PAYMENT DETAILS</h4>
                      <p className="text-[11px] text-slate-400">Scan with any UPI app to pay</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Order Amount</span>
                    <span id="checkout-upi-order-amount" className="text-[15px] font-bold text-[#4ade80] font-display tabular-nums">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px] bg-white/[0.03] p-3 rounded-xl border border-white/10">
                  <div>
                    <span className="text-[11px] text-slate-400 font-medium block">Payee / Merchant Name</span>
                    <span id="checkout-merchant-name" className="font-semibold text-white block mt-0.5">
                      {upiPayee}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 font-medium block">UPI ID</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code id="checkout-upi-id" className="font-mono text-[12px] font-bold text-[#4ade80] bg-black/50 px-2 py-0.5 rounded border border-white/15 select-all">
                        {upiId}
                      </code>
                      <button
                        type="button"
                        id="checkout-copy-upi-btn"
                        onClick={handleCopyUpi}
                        className="px-2 py-0.5 text-[11px] font-semibold rounded bg-[#006b2c]/30 text-[#4ade80] hover:bg-[#006b2c]/50 transition-colors cursor-pointer flex items-center gap-1 border border-[#006b2c]/40"
                      >
                        {copiedUpi ? (
                          <>
                            <Check className="w-3 h-3 text-[#4ade80]" />
                            <span className="text-[#4ade80]">Copied!</span>
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
                  <div>
                    <span className="text-[11px] text-slate-400 font-medium block">Amount</span>
                    <span id="checkout-upi-amount-display" className="font-bold text-[14px] text-[#4ade80] block mt-0.5 tabular-nums">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* QR Code display */}
                <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-black/40 border border-white/15 shadow-2xs space-y-2">
                  <div className="p-2.5 bg-white rounded-xl border border-white/30 shadow-md">
                    <img
                      id="checkout-qr-code-img"
                      src={activeQrCodeUrl}
                      alt="UPI Payment QR Code"
                      className="w-44 h-44 sm:w-48 sm:h-48 object-contain rounded-lg"
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-[12px] font-bold text-white tracking-wide uppercase">
                      SCAN QR CODE TO PAY
                    </p>
                    <p className="text-[11px] text-slate-400">
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
                className="bg-black/35 backdrop-blur-md rounded-2xl border border-white/15 p-4 space-y-3.5 shadow-xs animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#006b2c]/30 text-[#4ade80] flex items-center justify-center border border-[#006b2c]/40">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-bold text-white">DIRECT UPI APP PAYMENT</h4>
                      <p className="text-[11px] text-slate-400">Pay directly using your installed UPI app</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Amount to Pay</span>
                    <span id="checkout-direct-upi-amount" className="text-[15px] font-bold text-[#4ade80] font-display tabular-nums">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* App badges */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/10 text-[11px] text-slate-300 font-semibold">
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
                    className="w-full py-3 rounded-xl bg-[#006b2c] text-white font-bold text-[14px] hover:bg-[#00873a] hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>PAY NOW ({formatINR(total)})</span>
                  </button>
                </div>

                {directUpiLaunched && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-[12px] text-emerald-200 space-y-1 animate-in fade-in">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Check className="w-4 h-4 text-[#4ade80]" />
                      <span>Payment flow initiated in UPI app</span>
                    </div>
                    <p className="text-[11px] text-emerald-300/90">
                      Complete your transaction in Google Pay, PhonePe, Paytm, or BHIM, then upload your transaction receipt/screenshot below.
                    </p>
                  </div>
                )}

                {/* Payment Proof Section */}
                {renderPaymentProofSection()}
              </div>
            )}

            {/* Order Items Review */}
            <div className="bg-black/35 backdrop-blur-xs p-3.5 rounded-xl border border-white/15 space-y-2">
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block">
                {t('orderSummary', { count: items.length })}
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 text-[12px]">
                {items.map((it) => (
                  <div key={it.product.id} className="flex justify-between text-slate-200">
                    <span className="truncate max-w-[260px]">
                      {it.quantity} × {it.product.title} <span className="text-slate-400 text-[11px]">({it.product.unit})</span>
                    </span>
                    <span className="font-semibold tabular-nums text-white">
                      {formatINR(it.product.price * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              {/* Promo Code input in Checkout */}
              <div className="pt-2 border-t border-white/10">
                {appliedCoupon && activeCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-950/60 border border-emerald-500/40 p-2 rounded-lg text-[12px] text-emerald-300">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Tag className="w-3.5 h-3.5 text-[#4ade80]" />
                      <span>{activeCoupon.code} ({activeCoupon.discountPercentage}% OFF)</span>
                    </div>
                    {onRemoveCoupon && (
                      <button
                        type="button"
                        id="checkout-remove-coupon-btn"
                        onClick={onRemoveCoupon}
                        className="text-[11px] underline hover:text-white font-semibold cursor-pointer text-red-400"
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
                        className="flex-1 px-2.5 py-1 text-[12px] uppercase font-mono bg-black/40 border border-white/15 rounded-lg text-white placeholder:text-slate-500 focus:outline-hidden focus:bg-black/60 focus:border-[#22c55e] focus:ring-1 focus:ring-[#006b2c]"
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
                      <p id="checkout-coupon-error" className="text-[11px] text-red-400 font-medium">{checkoutCouponError}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Subtotal, Discount & Total */}
              <div className="pt-2 border-t border-white/10 space-y-1 text-[12px]">
                <div className="flex justify-between text-slate-300">
                  <span>{t('subtotal')}</span>
                  <span className="font-semibold text-white tabular-nums">{formatINR(subtotal)}</span>
                </div>
                {discount > 0 && activeCoupon && (
                  <div className="flex justify-between text-[#4ade80] font-semibold">
                    <span>{t('discountCoupon')} ({activeCoupon.discountPercentage}% OFF)</span>
                    <span id="checkout-discount-amount" className="tabular-nums">-{formatINR(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-300">
                  <span>{t('deliveryCharges') || 'Delivery Charges'}</span>
                  <span id="checkout-tax-packing-amount" data-testid="checkout-delivery-charges" className={`tabular-nums ${deliveryChargesAmount > 0 ? 'font-semibold text-white' : 'text-[#4ade80] font-medium'}`}>
                    {items.length === 0 ? '₹0' : (deliveryChargesAmount > 0 ? formatINR(deliveryChargesAmount) : 'FREE')}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-[14px] text-white pt-1.5 border-t border-white/10">
                  <span>{t('total')}</span>
                  <span id="checkout-final-total" className="text-[#4ade80] font-display tabular-nums text-[16px]">{formatINR(total)}</span>
                </div>
              </div>
            </div>

            {/* Place Order CTA */}
            <button
              type="submit"
              disabled={isSubmitting}
              id="checkout-submit-order-btn"
              className="w-full py-3.5 rounded-xl bg-[#006b2c] text-white font-bold text-[14px] hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-950/60 hover:brightness-105 active:translate-y-0 active:scale-98 shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
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
            <div className="w-16 h-16 rounded-full bg-amber-950/60 text-amber-400 flex items-center justify-center mx-auto shadow-inner border border-amber-500/40">
              <Clock className="w-8 h-8 text-amber-400" />
            </div>

            <div>
              <h3 className="text-[20px] font-bold text-white font-display">
                Order Submitted
              </h3>
              <p className="text-[13px] text-amber-300 font-semibold mt-1">
                Payment Status: Pending Verification
              </p>
              <p className="text-[12px] text-slate-300 mt-1">
                Order ID: <strong className="text-white">#{orderNumber}</strong>
              </p>
            </div>

            {/* Notice Alert */}
            <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl text-left text-[12px] text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Verification in Progress</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Uploading payment proof does <strong>NOT</strong> automatically confirm your payment. Our store administrators will verify your transaction against our merchant account ({paymentSettings.upiId}) before dispatching your order.
              </p>
            </div>

            {/* Payment Summary */}
            <div className="bg-black/40 p-3.5 rounded-xl border border-white/15 text-left space-y-2 text-[12px]">
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block">
                Payment Record
              </span>
              <div className="space-y-1.5 text-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment Method:</span>
                  <span className="font-semibold text-white">{paymentMethod === 'upi_qr' ? 'UPI / QR Payment' : 'Direct UPI App'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount:</span>
                  <span className="font-bold text-[#4ade80] tabular-nums">{formatINR(total)}</span>
                </div>
                {proofFileName && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Proof Attached:</span>
                    <span className="font-semibold text-slate-200 truncate max-w-[200px]">{proofFileName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Delivery To:</span>
                  <span className="font-medium text-slate-200 truncate max-w-[200px]">{address}</span>
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
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-[#4ade80] border border-white/20 text-[13px] font-semibold hover:bg-white/15 transition-all cursor-pointer"
                >
                  Track in Dashboard
                </button>
              )}
              <button
                type="button"
                id="checkout-continue-shopping-btn"
                onClick={handleDone}
                className="flex-1 py-2.5 rounded-xl bg-[#006b2c] text-white text-[13px] font-semibold hover:bg-[#00873a] transition-all cursor-pointer shadow-xs"
              >
                Back to Storefront
              </button>
            </div>
          </div>
        ) : (
          /* Step: Cash On Delivery Success Screen with Handover OTP */
          <div className="p-5 sm:p-6 text-center space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="w-16 h-16 rounded-full bg-emerald-950/70 text-[#4ade80] flex items-center justify-center mx-auto shadow-inner border border-emerald-500/40">
              <CheckCircle className="w-8 h-8 text-[#4ade80]" />
            </div>

            <div>
              <h3 className="text-[20px] font-bold text-white font-display">
                {t('orderConfirmed')}
              </h3>
              <p className="text-[13px] text-slate-300 mt-1">
                {t('orderPlacedSuccess')}
              </p>
            </div>

            {/* Order Summary with Unit */}
            <div className="bg-black/40 p-3.5 rounded-xl border border-white/15 text-left space-y-2">
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block">
                Order Summary ({items.length} items)
              </span>
              <div className="space-y-1 text-[12px] max-h-24 overflow-y-auto">
                {items.map((it) => (
                  <div key={it.product.id} className="flex justify-between text-slate-200">
                    <span className="truncate max-w-[260px]">
                      {it.quantity} × {it.product.title} <span className="text-slate-400">({it.product.unit})</span>
                    </span>
                    <span className="font-semibold text-white tabular-nums">
                      {formatINR(it.product.price * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-[13px] text-white">
                <span>Payment Mode</span>
                <span className="text-[#4ade80]">Cash on Delivery</span>
              </div>
              <div className="flex justify-between font-bold text-[13px] text-white">
                <span>Total Due</span>
                <span className="text-[#4ade80] font-display tabular-nums">
                  {formatINR(total)}
                </span>
              </div>
            </div>

            {/* Order Handover OTP Card */}
            {orderHandoverOtp && (
              <div
                id="order-handover-otp-section"
                className="p-4 rounded-2xl bg-emerald-950/60 border-2 border-emerald-500/50 text-center space-y-2 shadow-xs animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-emerald-300 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-[#4ade80]" />
                  <span>Order Handover OTP</span>
                </div>

                {!isOtpExpired ? (
                  <div className="space-y-1">
                    <div
                      id="customer-order-handover-otp"
                      className="font-mono text-[32px] sm:text-[36px] font-extrabold tracking-widest text-[#4ade80] select-all leading-tight py-0.5"
                    >
                      {orderHandoverOtp}
                    </div>
                    <p className="text-[12px] text-emerald-200/90 font-medium">
                      Please provide this OTP when receiving your order.
                    </p>
                    <div className="pt-1">
                      <button
                        type="button"
                        id="customer-resend-otp-btn"
                        onClick={handleCustomerResendOtp}
                        disabled={isResendingOtp}
                        className="text-[11px] font-semibold text-emerald-300 hover:text-[#4ade80] underline cursor-pointer disabled:opacity-50"
                      >
                        {isResendingOtp ? 'Generating New OTP...' : 'Resend OTP'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 py-1">
                    <div className="text-[13px] font-semibold text-red-400 flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>OTP expired. Please request a new OTP.</span>
                    </div>
                    <button
                      type="button"
                      id="customer-request-new-otp-btn"
                      onClick={handleCustomerResendOtp}
                      disabled={isResendingOtp}
                      className="px-4 py-1.5 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isResendingOtp ? 'Generating New OTP...' : 'Request New OTP'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Live Tracking Visual */}
            <div className="bg-black/40 p-4 rounded-xl border border-white/15 space-y-3 text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#006b2c] text-white flex items-center justify-center text-[12px] font-bold shadow-xs">
                  1
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-white">
                    Picking &amp; Quality Inspection
                  </div>
                  <div className="text-[11px] text-[#4ade80] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-ping" />
                    In progress by Runner #4 · 3.8°C monitored
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 opacity-60">
                <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-[12px] font-bold">
                  2
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-slate-300">
                    Eco Insulated Cold Pack
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Departs via zero-emission electric bike
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 opacity-60">
                <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-[12px] font-bold">
                  3
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-slate-300">
                    Arrival at {address}
                  </div>
                  <div className="text-[11px] text-slate-400">
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
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-[#4ade80] border border-white/20 text-[13px] font-semibold hover:bg-white/15 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-200 cursor-pointer"
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
