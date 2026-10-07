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
} from '../services/paymentSettingsService';
import {
  generateQrDataUrl,
  buildCustomerPaymentUpiUri,
  decodeUpiPayload,
  verifyQrPayloadDecodable,
  generateUniquePaymentReference,
  openUPIPayment,
} from '../utils/qrCodeGenerator';
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
  const [step, setStep] = useState<'details' | 'success'>('details');
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
    }
  }, [isOpen]);

  const handleCopyUpi = () => {
    const upi = paymentSettings.upiId || 'freshcart@upi';
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(upi);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  // Order Handover OTP States for successful order placement screen
  const [orderHandoverOtp, setOrderHandoverOtp] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);

  // QR Code UPI Deep Link & Multi-Gesture (Double-Tap, Double-Click, Long-Press) State
  const [isQrLaunchingUpi, setIsQrLaunchingUpi] = useState(false);
  const [showQrUpiFallback, setShowQrUpiFallback] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  const pointerStartTimeRef = useRef<number>(0);
  const pointerStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedSignificantlyRef = useRef<boolean>(false);

  const lastTapTimeRef = useRef<number>(0);
  const lastMouseClickTimeRef = useRef<number>(0);
  const lastLaunchTimeRef = useRef<number>(0);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const isMobileClient = () => {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
  };

  const handleLaunchUpiDeepLink = (upiUri: string) => {
    if (!upiUri) return;
    const now = Date.now();
    // Guard against duplicate launches within 1500ms
    if (now - lastLaunchTimeRef.current < 1500) {
      return;
    }
    lastLaunchTimeRef.current = now;

    setIsQrLaunchingUpi(true);
    setTimeout(() => setIsQrLaunchingUpi(false), 2500);

    // Synchronously launch the UPI deep link directly in the user gesture
    openUPIPayment(upiUri);
    setShowQrUpiFallback(true);
  };

  // 1. Long-press on mobile/touch devices: ~700ms (within 600–800ms)
  const handleQrPointerDown = (e: React.PointerEvent, upiUri: string) => {
    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    pointerStartTimeRef.current = Date.now();
    hasMovedSignificantlyRef.current = false;
    longPressTriggeredRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const isTouch = e.pointerType === 'touch';
    if (isTouch) {
      longPressTimerRef.current = setTimeout(() => {
        if (!hasMovedSignificantlyRef.current) {
          longPressTriggeredRef.current = true;
          handleLaunchUpiDeepLink(upiUri);
        }
      }, 700);
    }
  };

  // If user moves finger > 25px (page scroll), cancel long-press
  const handleQrPointerMove = (e: React.PointerEvent) => {
    if (!pointerStartPosRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartPosRef.current.y);
    if (dx > 25 || dy > 25) {
      hasMovedSignificantlyRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  // 2. Double-tap on mobile/touch, double-click on desktop, & long-press release handler
  const handleQrPointerUp = (e: React.PointerEvent, upiUri: string) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const holdDuration = Date.now() - pointerStartTimeRef.current;
    const isTouch = e.pointerType === 'touch';

    // Touch device long-press release handling
    if (isTouch) {
      if (longPressTriggeredRef.current) {
        // Already launched by timer
        longPressTriggeredRef.current = false;
        lastTapTimeRef.current = 0;
        pointerStartPosRef.current = null;
        return;
      }

      // If held for >= 680ms without significant movement, launch synchronously in user gesture
      if (!hasMovedSignificantlyRef.current && holdDuration >= 680) {
        longPressTriggeredRef.current = true;
        lastTapTimeRef.current = 0;
        pointerStartPosRef.current = null;
        handleLaunchUpiDeepLink(upiUri);
        return;
      }
    }

    // If finger dragged significantly (scrolling), cancel tap/click gesture
    if (hasMovedSignificantlyRef.current) {
      pointerStartPosRef.current = null;
      return;
    }

    const now = Date.now();

    if (isTouch) {
      // Mobile / Touch double-tap detection
      const timeSinceLastTap = now - lastTapTimeRef.current;
      if (timeSinceLastTap > 0 && timeSinceLastTap < 380) {
        // Double-tap detected!
        lastTapTimeRef.current = 0;
        handleLaunchUpiDeepLink(upiUri);
      } else {
        // Single tap -> record timestamp, do nothing
        lastTapTimeRef.current = now;
      }
    } else {
      // Desktop mouse pointer double-click detection
      const timeSinceLastClick = now - lastMouseClickTimeRef.current;
      if (timeSinceLastClick > 0 && timeSinceLastClick < 400) {
        // Double-click detected!
        lastMouseClickTimeRef.current = 0;
        handleLaunchUpiDeepLink(upiUri);
      } else {
        // Single click -> record timestamp, do nothing
        lastMouseClickTimeRef.current = now;
      }
    }

    pointerStartPosRef.current = null;
  };

  const handleQrPointerCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTriggeredRef.current = false;
    pointerStartPosRef.current = null;
    hasMovedSignificantlyRef.current = false;
  };

  // Native DOM Double-click on desktop
  const handleQrDoubleClick = (e: React.MouseEvent, upiUri: string) => {
    e.preventDefault();
    handleLaunchUpiDeepLink(upiUri);
  };
  const [isOtpExpired, setIsOtpExpired] = useState<boolean>(false);
  const [isResendingOtp, setIsResendingOtp] = useState<boolean>(false);
  const [placedOrderId, setPlacedOrderId] = useState<string>('');

  useEffect(() => {
    if (currentUser?.address) {
      setAddress(currentUser.address);
    }
  }, [currentUser]);

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
    setIsSubmitting(true);
    setTimeout(async () => {
      setIsSubmitting(false);
      const orderNum = Math.floor(1000 + Math.random() * 9000);
      const generatedOrder = `#FC-${orderNum}`;
      setOrderNumber(String(orderNum));

      const customerPhone = currentUser?.phone?.trim() || '';

      const paymentMethodLabel =
        paymentMethod === 'upi_qr'
          ? 'UPI / QR Payment'
          : paymentMethod === 'upi_app'
          ? 'Direct UPI App Payment'
          : 'Cash on Delivery';

      // Save order to customer account history
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
        paymentMethod: paymentMethodLabel,
        paymentStatus: paymentMethod === 'cash' ? 'Pending' : 'Pending Verification',
      };
      addOrder(newCustomerOrder);

      // Trigger backend Order Handover OTP generation for the new order
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
    onClose();
  };

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
                {step === 'details' ? t('expressCheckout') : t('orderConfirmed')}
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
            onClick={step === 'success' ? handleDone : onClose}
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

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-[#006b2c]" />
                {t('paymentMethod')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  id="checkout-payment-cod-btn"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'border-[#006b2c] bg-white/45 text-[#006b2c] ring-2 ring-[#006b2c]/20'
                      : 'border-white/50 bg-white/25 text-[#565e74] hover:bg-white/40'
                  }`}
                >
                  {t('payCod')}
                </button>

                {paymentSettings.upiPaymentEnabled !== false && (
                  <button
                    type="button"
                    id="checkout-payment-upi-qr-btn"
                    onClick={() => setPaymentMethod('upi_qr')}
                    className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                      paymentMethod === 'upi_qr'
                        ? 'border-[#006b2c] bg-white/45 text-[#006b2c] ring-2 ring-[#006b2c]/20'
                        : 'border-white/50 bg-white/25 text-[#565e74] hover:bg-white/40'
                    }`}
                  >
                    UPI / QR Payment
                  </button>
                )}

                {paymentSettings.directUpiAppEnabled && (
                  <button
                    type="button"
                    id="checkout-payment-upi-app-btn"
                    onClick={() => setPaymentMethod('upi_app')}
                    className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                      paymentMethod === 'upi_app'
                        ? 'border-[#006b2c] bg-white/45 text-[#006b2c] ring-2 ring-[#006b2c]/20'
                        : 'border-white/50 bg-white/25 text-[#565e74] hover:bg-white/40'
                    }`}
                  >
                    {t('payDirectUpi') || 'Direct UPI App'}
                  </button>
                )}
              </div>
            </div>

            {/* Static UPI / QR Payment Display */}
            {paymentMethod === 'upi_qr' && (
              <div
                id="checkout-upi-qr-section"
                className="p-4 rounded-2xl bg-white/35 backdrop-blur-md border border-white/50 space-y-3 text-center"
              >
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-[#565e74] uppercase tracking-wider block">
                    PAYMENT DETAILS
                  </span>
                  <div className="text-[13px] text-[#0b1c30]">
                    <span className="text-[#565e74]">Payee: </span>
                    <span className="font-semibold">{paymentSettings.payeeName || 'FreshCart Grocery Store'}</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-[12px]">
                    <span className="text-[#565e74]">UPI ID: </span>
                    <span className="font-mono font-bold text-[#006b2c]">{paymentSettings.upiId || 'freshcart@upi'}</span>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="px-2 py-0.5 rounded-md bg-white border border-[#cbd5e1] text-[11px] font-semibold text-[#006b2c] hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                    >
                      {copiedUpi ? <Check className="w-3 h-3 text-[#16a34a]" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Amount-Based Payment QR Code */}
                {(() => {
                  const modalTxnRef = generateUniquePaymentReference();
                  const modalUpiUri = buildCustomerPaymentUpiUri(
                    paymentSettings.upiId || 'freshcart@upi',
                    paymentSettings.payeeName || 'FreshCart Grocery Store',
                    total,
                    modalTxnRef
                  );
                  const upiValidation = decodeUpiPayload(modalUpiUri);
                  const qrScan = verifyQrPayloadDecodable(modalUpiUri);
                  const modalQrUrl = upiValidation.isValid ? generateQrDataUrl(modalUpiUri, { size: 180 }) : '';
                  const formattedTotal = Number(total).toFixed(2);
                  return (
                    <div className="flex flex-col items-center space-y-3">
                      <div
                        id="checkout-qr-interaction-container"
                        data-testid="checkout-qr-interaction-container"
                        role="button"
                        tabIndex={0}
                        aria-label={`UPI Payment QR Code. Double-tap, double-click, or long-press to open UPI app, or scan to pay ${formatINR(total)}`}
                        data-upi-uri={modalUpiUri}
                        onPointerDown={(e) => handleQrPointerDown(e, modalUpiUri)}
                        onPointerMove={handleQrPointerMove}
                        onPointerUp={(e) => handleQrPointerUp(e, modalUpiUri)}
                        onPointerCancel={handleQrPointerCancel}
                        onDoubleClick={(e) => handleQrDoubleClick(e, modalUpiUri)}
                        onClick={() => {}}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none', userSelect: 'none' }}
                        className="w-44 h-44 mx-auto p-2 bg-white rounded-xl shadow-md border-2 border-[#e2e8f0] hover:border-[#006b2c] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c] flex items-center justify-center cursor-pointer active:scale-98 transition-all select-none"
                        title="Double-click, double-tap, or long-press to open UPI app (or scan with camera)"
                      >
                        <img
                          id="checkout-qr-code-img"
                          data-testid="checkout-qr-code-img"
                          src={modalQrUrl}
                          data-upi-uri={modalUpiUri}
                          data-upi-id={paymentSettings.upiId || 'freshcart@upi'}
                          data-upi-amount={formattedTotal}
                          data-upi-pa={upiValidation.decoded?.pa}
                          data-upi-pn={upiValidation.decoded?.pn}
                          data-upi-am={upiValidation.decoded?.am}
                          data-upi-cu={upiValidation.decoded?.cu}
                          data-upi-tr={upiValidation.decoded?.tr}
                          data-qr-decodable={qrScan?.decodable ? "true" : "false"}
                          alt={`Merchant UPI Payment QR Code for ${formatINR(total)}`}
                          className="w-full h-full object-contain pointer-events-none select-none"
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-[12px] font-bold text-[#006b2c] flex items-center justify-center gap-1.5">
                          <QrCode className="w-4 h-4" />
                          <span>SCAN QR CODE TO PAY {formatINR(total)}</span>
                        </p>
                        <p className="text-[11px] text-[#565e74]">
                          Scan using Google Pay, PhonePe, Paytm, or BHIM.
                        </p>
                      </div>

                      {/* Fallback Notice for desktop or unsupported environments */}
                      {showQrUpiFallback && (
                        <div
                          id="modal-qr-upi-fallback-notice"
                          data-testid="modal-qr-upi-fallback-notice"
                          className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs text-center max-w-sm animate-in fade-in"
                        >
                          <p className="font-medium">
                            Open your UPI app and complete the payment, then upload your payment screenshot.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Direct UPI App Payment Display */}
            {paymentMethod === 'upi_app' && (
              <div
                id="checkout-direct-upi-section"
                className="p-4 rounded-2xl bg-white/35 backdrop-blur-md border border-white/50 space-y-3 text-center"
              >
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-[#565e74] uppercase tracking-wider block">
                    {t('payDirectUpi') || 'DIRECT UPI APP PAYMENT'}
                  </span>
                  <p className="text-[12px] text-[#565e74]">
                    Launch Google Pay, PhonePe, Paytm, or BHIM to pay directly.
                  </p>
                </div>

                <a
                  href={`upi://pay?pa=${encodeURIComponent(paymentSettings.upiId || 'freshcart@upi')}&pn=${encodeURIComponent(paymentSettings.payeeName || 'FreshCart Grocery Store')}&cu=INR`}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#006b2c] text-white text-[13px] font-bold hover:bg-[#00873a] transition-all shadow-md cursor-pointer"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>{t('payNow') || 'PAY NOW'}</span>
                </a>
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
              className="w-full py-3 rounded-xl bg-[#006b2c] text-white font-semibold text-[14px] hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 active:translate-y-0 active:scale-98 shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('processingOrder')}
                </span>
              ) : (
                <span>{t('placeOrder', { total: formatINR(total) })}</span>
              )}
            </button>
          </form>
        ) : (
          /* Step: Success Screen */
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
                <span>Total Paid</span>
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
