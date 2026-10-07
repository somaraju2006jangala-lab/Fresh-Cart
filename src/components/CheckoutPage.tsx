import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Banknote,
  MapPin,
  Clock,
  ShieldCheck,
  CreditCard,
  QrCode,
  Smartphone,
  Check,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Truck,
  RotateCw,
} from 'lucide-react';
import { generateOrderOtp, resendOrderOtp } from '../services/otpClientService';
import { Footer } from './Footer';
import { PaymentProofUpload } from './PaymentProofUpload';
import { PaymentProofData } from '../types';

interface CheckoutPageProps {
  items: CartItem[];
  appliedCoupon: string | null;
  onClearCart: () => void;
  onOrderPlaced?: (items: CartItem[], placedOrder?: CustomerOrder) => void;
  coupons?: Coupon[];
  onApplyCoupon?: (code: string) => void;
  onRemoveCoupon?: () => void;
  deliveryCharges?: number;
  deliveryRules?: DeliveryChargeRule[];
  onBackToCart: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToStorefront?: () => void;
  onOpenAdmin: () => void;
  onSelectCategory: (category: string) => void;
  onOpenLogin: () => void;
  onOpenDashboard: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  items,
  appliedCoupon,
  onClearCart,
  onOrderPlaced,
  coupons = [],
  deliveryCharges = 40,
  deliveryRules,
  onBackToCart,
  onNavigateToDashboard,
  onNavigateToStorefront,
  onOpenAdmin,
  onSelectCategory,
  onOpenLogin,
  onOpenDashboard,
}) => {
  const { currentUser, addOrder } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState<'details' | 'success'>('details');
  const [address, setAddress] = useState(
    currentUser?.address || '742 Evergreen Terrace, Apt 4B'
  );
  const [deliveryNote, setDeliveryNote] = useState('Leave with doorman in thermal tote');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_qr' | 'upi_app'>('upi_qr');
  const [draftOrderId] = useState(() => `#FC-${Math.floor(1000 + Math.random() * 9000)}`);
  const [submittedProof, setSubmittedProof] = useState<PaymentProofData | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showItemsList, setShowItemsList] = useState(false);

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(getStoredPaymentSettings());

  // Order Handover OTP States
  const [orderHandoverOtp, setOrderHandoverOtp] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [isOtpExpired, setIsOtpExpired] = useState<boolean>(false);
  const [isResendingOtp, setIsResendingOtp] = useState<boolean>(false);
  const [placedOrderId, setPlacedOrderId] = useState<string>('');

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



  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
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
    : (items.length > 0 ? deliveryCharges : 0);

  const total = Math.max(0, Math.round((subtotal - discount + deliveryChargesAmount) * 100) / 100);

  const checkoutTxnRef = useMemo(() => {
    return generateUniquePaymentReference();
  }, [total, items.map((i) => `${i.product.id}:${i.quantity}`).join(',')]);

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    setIsSubmitting(true);
    setTimeout(async () => {
      setIsSubmitting(false);
      const isUpi = paymentMethod === 'upi_qr' || paymentMethod === 'upi_app';
      const isCod = paymentMethod === 'cash';
      const generatedOrder = placedOrderId || draftOrderId;
      const orderNum = generatedOrder.replace('#FC-', '');
      setOrderNumber(orderNum);

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
        deliveryTimeSlot: 'Express Cold-Chain Delivery, 24–30 Minutes',
        estimatedDeliveryTime: isUpi ? 'Awaiting payment verification' : (isCod ? 'Express Cold-Chain Delivery' : 'Picking in progress'),
        items: [...items],
        subtotal,
        discount,
        total,
        couponCode: appliedCoupon || undefined,
        status: isUpi ? 'PAYMENT VERIFICATION PENDING' : (isCod ? 'CONFIRMED' : 'Picking'),
        createdAt: new Date().toISOString(),
        paymentMethod: paymentMethodLabel,
        paymentStatus: isUpi ? 'PENDING VERIFICATION' : 'PENDING',
        paymentVerificationStatus: isUpi ? (submittedProof ? 'PENDING_VERIFICATION' : 'NOT_UPLOADED') : undefined,
        paymentProof: submittedProof || undefined,
      };
      addOrder(newCustomerOrder);

      // Trigger backend Order Handover OTP generation ONLY for online orders (completely bypassed for Cash on Delivery)
      if (!isCod) {
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
      } else {
        setOrderHandoverOtp(null);
      }

      setPlacedOrderId(generatedOrder);
      onOrderPlaced?.(items, newCustomerOrder);
      setStep('success');
      onClearCart();
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

  return (
    <div id="checkout-page-container" className="w-full flex flex-col min-h-screen">
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4 sm:space-y-4.5">

        {/* Step: Order Confirmed Screen (Semi-Solid Opaque) */}
        {step === 'success' ? (
          <div className="checkout-panel rounded-3xl p-6 sm:p-10 max-w-2xl mx-auto my-6 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle className="w-9 h-9" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-white font-display">
                Order Confirmed!
              </h2>
              <p className="text-sm text-slate-300">
                Your order <span className="font-bold text-white">#FC-{orderNumber}</span> has been placed successfully.
              </p>
            </div>

            {/* Handover OTP Verification Box (Only for online orders with active OTP; completely bypassed for Cash on Delivery) */}
            {paymentMethod !== 'cash' && orderHandoverOtp && (
              <div className="checkout-subpanel rounded-2xl p-5 sm:p-6 text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Delivery Handover OTP</span>
                </div>

                <div className="space-y-1">
                  <span className="text-3xl sm:text-4xl font-extrabold tracking-widest text-emerald-400 font-mono">
                    {orderHandoverOtp || '----'}
                  </span>
                  <p className="text-xs text-slate-300 max-w-sm mx-auto pt-1">
                    Share this 4-digit code with your delivery runner at your doorstep to receive your items.
                  </p>
                </div>

                {isOtpExpired ? (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-amber-400 font-medium">OTP has expired</p>
                    <button
                      type="button"
                      onClick={handleCustomerResendOtp}
                      disabled={isResendingOtp}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-white/10 transition-colors cursor-pointer"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isResendingOtp ? 'animate-spin' : ''}`} />
                      <span>Resend OTP</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Valid for 10 minutes</span>
                  </p>
                )}
              </div>
            )}

            {/* Delivery Details Recap */}
            <div className="checkout-subpanel rounded-2xl p-4 text-left text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 text-white font-semibold">
                <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Delivery Address</span>
              </div>
              <p className="pl-6 text-slate-400">{address}</p>
              <div className="flex items-center gap-2 text-white font-semibold pt-1">
                <Truck className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Estimated Delivery</span>
              </div>
              <p className="pl-6 text-slate-400">Express Cold-Chain Delivery, 24–30 Minutes</p>
              <div className="flex items-center gap-2 text-white font-semibold pt-1">
                <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Payment Details</span>
              </div>
              <p className="pl-6 text-slate-400">
                {paymentMethod === 'cash' ? 'Cash on Delivery (Pending Doorstep Collection)' : 'UPI / QR Payment (Pending Merchant Verification)'}
              </p>
            </div>

            {/* Payment Screenshot Verification for UPI Orders */}
            {paymentMethod !== 'cash' && (
              <div className="pt-2">
                <PaymentProofUpload
                  orderId={placedOrderId || draftOrderId}
                  customerId={currentUser?.id || 'guest_user'}
                  customerToken={currentUser?.token}
                  initialProof={submittedProof}
                  currentVerificationStatus={submittedProof ? 'PENDING_VERIFICATION' : 'NOT_UPLOADED'}
                  onProofSubmitted={(proof) => {
                    setSubmittedProof(proof);
                  }}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigateToDashboard?.()}
                className="flex-1 py-3 px-4 rounded-xl checkout-neon-btn text-white text-sm font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>View Order in Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigateToStorefront?.()}
                className="py-3 px-5 rounded-xl checkout-subpanel hover:bg-slate-800 text-white text-sm font-semibold transition-all cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        ) : (
          /* Step: Details - Full-width dedicated checkout vertical sequence matching reference design */
          <>
            {/* 1. CHECKOUT HEADER */}
            <div className="checkout-panel rounded-2xl p-4 sm:p-5 flex items-center gap-4">
              <button
                type="button"
                id="checkout-back-to-cart-btn"
                onClick={onBackToCart}
                className="w-10 h-10 rounded-full bg-[#051c33] border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-[#072440] text-cyan-400 transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-sm active:scale-95"
                title="Return to Cart"
              >
                <ArrowLeft className="w-5 h-5 text-cyan-400" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display">
                  Checkout
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Complete your delivery and payment information
                </p>
              </div>
            </div>

            {/* 2. DELIVERY ADDRESS & TIME SLOT */}
            <div className="checkout-panel rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight font-display">
                  Delivery Address & Time Slot
                </h2>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-normal">
                    Delivery Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter delivery street address"
                    className="checkout-input w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-normal">
                    Delivery Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    placeholder="e.g. Leave with doorman in thermal tote"
                    className="checkout-input w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none"
                  />
                </div>

                <div className="checkout-subpanel w-full px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm text-slate-300">
                  <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Express Cold-Chain Delivery, 24–30 Minutes</span>
                </div>
              </div>
            </div>

            {/* 3. SELECT PAYMENT METHOD & PAYMENT DETAILS */}
            <div className="checkout-panel rounded-2xl p-5 sm:p-6 space-y-4 sm:space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight font-display">
                    Select Payment Method
                  </h2>
                </div>
                <span className="text-xs sm:text-sm text-cyan-400 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Verified</span>
                </span>
              </div>

              {/* Payment Methods Selection: 3 Separate Options */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
                {/* Option 1: Cash on Delivery */}
                <button
                  type="button"
                  id="checkout-payment-cash-opt"
                  data-testid="checkout-payment-cash-opt"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-4 sm:p-4.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between min-h-[96px] ${
                    paymentMethod === 'cash'
                      ? 'checkout-card-selected'
                      : 'checkout-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          paymentMethod === 'cash'
                            ? 'bg-[#00d2aa] text-[#030d1a]'
                            : 'border-2 border-slate-500 bg-transparent'
                        }`}
                      >
                        {paymentMethod === 'cash' ? (
                          <div className="w-2 h-2 rounded-full bg-[#030d1a]" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-transparent" />
                        )}
                      </div>
                      <span className="text-sm sm:text-base font-bold text-white">Cash on Delivery</span>
                    </div>
                    <Banknote className="w-5 h-5 text-cyan-400 shrink-0" />
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-slate-400">Pay cash or runner UPI QR upon doorstep delivery</p>
                  </div>
                </button>

                {/* Option 2: UPI / QR Payment */}
                <button
                  type="button"
                  id="checkout-payment-upi-qr-opt"
                  data-testid="checkout-payment-upi-qr-opt"
                  onClick={() => setPaymentMethod('upi_qr')}
                  className={`p-4 sm:p-4.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between min-h-[96px] ${
                    paymentMethod === 'upi_qr'
                      ? 'checkout-card-selected'
                      : 'checkout-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          paymentMethod === 'upi_qr'
                            ? 'bg-[#00d2aa] text-[#030d1a]'
                            : 'border-2 border-slate-500 bg-transparent'
                        }`}
                      >
                        {paymentMethod === 'upi_qr' ? (
                          <div className="w-2 h-2 rounded-full bg-[#030d1a]" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-transparent" />
                        )}
                      </div>
                      <span className="text-sm sm:text-base font-bold text-white">UPI / QR Payment</span>
                    </div>
                    <QrCode className="w-5 h-5 text-cyan-400 shrink-0" />
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-slate-400">Scan QR code using any UPI banking app</p>
                  </div>
                </button>

                {/* Option 3: 📱 Pay Directly via UPI App */}
                <button
                  type="button"
                  id="checkout-payment-upi-app-opt"
                  data-testid="checkout-payment-upi-app-opt"
                  onClick={() => setPaymentMethod('upi_app')}
                  className={`p-4 sm:p-4.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between min-h-[96px] ${
                    paymentMethod === 'upi_app'
                      ? 'checkout-card-selected'
                      : 'checkout-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          paymentMethod === 'upi_app'
                            ? 'bg-[#00d2aa] text-[#030d1a]'
                            : 'border-2 border-slate-500 bg-transparent'
                        }`}
                      >
                        {paymentMethod === 'upi_app' ? (
                          <div className="w-2 h-2 rounded-full bg-[#030d1a]" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-transparent" />
                        )}
                      </div>
                      <span className="text-sm sm:text-base font-bold text-white">📱 Pay Directly via UPI App</span>
                    </div>
                    <Smartphone className="w-5 h-5 text-cyan-400 shrink-0" />
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-slate-400">Pay directly with installed UPI apps (GPay, PhonePe, Paytm)</p>
                  </div>
                </button>
              </div>

              {/* Cash on Delivery Details */}
              {paymentMethod === 'cash' && (
                <div
                  id="checkout-cash-details-panel"
                  className="checkout-subpanel rounded-xl sm:rounded-2xl p-5 mt-4 sm:mt-5 text-xs text-slate-300 space-y-1 text-center"
                >
                  <p className="font-semibold text-white">Doorstep Payment Selected</p>
                  <p className="text-slate-400">
                    You can pay via Cash or ask the delivery runner for their on-the-spot UPI QR code upon handover.
                  </p>
                </div>
              )}

              {/* UPI / QR Details Area - Single Working QR Code inside Payment Methods */}
              {paymentMethod === 'upi_qr' && (() => {
                const formattedTotal = Number(total).toFixed(2);
                const checkoutUpiUri = buildCustomerPaymentUpiUri(
                  paymentSettings.upiId || 'freshcart@upi',
                  paymentSettings.payeeName || 'FreshCart Grocery Store',
                  total,
                  checkoutTxnRef
                );
                const upiValidation = decodeUpiPayload(checkoutUpiUri);
                const qrScan = verifyQrPayloadDecodable(checkoutUpiUri);
                const checkoutQrUrl = upiValidation.isValid ? generateQrDataUrl(checkoutUpiUri, { size: 180 }) : '';

                return (
                  <div
                    id="checkout-upi-qr-details-panel"
                    className="checkout-subpanel rounded-xl sm:rounded-2xl p-6 mt-4 sm:mt-5 flex flex-col items-center text-center space-y-4"
                  >
                    {/* Amount to Pay */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Amount to Pay
                      </p>
                      <p id="checkout-qr-amount-display" data-testid="checkout-qr-amount-display" className="text-xl sm:text-2xl font-extrabold text-[#00e699] font-display tabular-nums">
                        {formatINR(total)}
                      </p>
                    </div>

                    {/* Customer Cart Amount-Specific QR Code - Only QR Code in Customer Flow */}
                    {upiValidation.isValid ? (
                      <div className="flex flex-col items-center space-y-3">
                        {/* Interactive Clickable QR Code Container */}
                        <div
                          id="checkout-payment-qr-container"
                          data-testid="checkout-payment-qr-container"
                          role="button"
                          tabIndex={0}
                          aria-label={`UPI Payment QR Code. Double-tap, double-click, or long-press to open UPI app, or scan to pay ${formatINR(total)}`}
                          data-upi-uri={checkoutUpiUri}
                          onPointerDown={(e) => handleQrPointerDown(e, checkoutUpiUri)}
                          onPointerMove={handleQrPointerMove}
                          onPointerUp={(e) => handleQrPointerUp(e, checkoutUpiUri)}
                          onPointerCancel={handleQrPointerCancel}
                          onDoubleClick={(e) => handleQrDoubleClick(e, checkoutUpiUri)}
                          onClick={() => {}}
                          onContextMenu={(e) => e.preventDefault()}
                          style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none', userSelect: 'none' }}
                          className="bg-white p-2.5 rounded-xl shrink-0 shadow-md border-2 border-white/90 hover:border-emerald-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-400 transition-all cursor-pointer active:scale-98 select-none group relative"
                          title="Double-click, double-tap, or long-press to open UPI app (or scan with camera)"
                        >
                          <img
                            id="checkout-payment-qr-img"
                            data-testid="checkout-payment-qr-img"
                            src={checkoutQrUrl}
                            data-upi-uri={checkoutUpiUri}
                            data-upi-amount={formattedTotal}
                            data-upi-id={paymentSettings.upiId || 'freshcart@upi'}
                            data-upi-pa={upiValidation.decoded?.pa}
                            data-upi-pn={upiValidation.decoded?.pn}
                            data-upi-am={upiValidation.decoded?.am}
                            data-upi-cu={upiValidation.decoded?.cu}
                            data-upi-tr={upiValidation.decoded?.tr}
                            data-qr-decodable={qrScan?.decodable ? "true" : "false"}
                            alt={`UPI Payment QR Code for ${formatINR(total)}`}
                            className="w-36 h-36 sm:w-40 sm:h-40 object-contain pointer-events-none select-none"
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                          />
                        </div>

                        <p id="checkout-qr-scan-instruction" data-testid="checkout-qr-scan-instruction" className="text-xs sm:text-sm font-semibold text-white">
                          Scan this QR to pay {formatINR(total)}
                        </p>

                        {/* Fallback Notice for desktop or unsupported environments */}
                        {showQrUpiFallback && (
                          <div
                            id="qr-upi-fallback-notice"
                            data-testid="qr-upi-fallback-notice"
                            className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs text-center max-w-sm animate-in fade-in"
                          >
                            <p className="font-medium">
                              Open your UPI app and complete the payment, then upload your payment screenshot.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
                        <p className="font-bold">Cannot generate payment QR:</p>
                        <p className="mt-0.5">{upiValidation.error || 'Invalid payment parameters'}</p>
                      </div>
                    )}

                    {/* Clear option: Upload Payment Screenshot after completing payment */}
                    <div className="w-full pt-2">
                      <PaymentProofUpload
                        orderId={draftOrderId}
                        customerId={currentUser?.id || 'guest_user'}
                        customerToken={currentUser?.token}
                        initialProof={submittedProof}
                        currentVerificationStatus={submittedProof ? 'PENDING_VERIFICATION' : 'NOT_UPLOADED'}
                        onProofSubmitted={(proof) => {
                          setSubmittedProof(proof);
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* 📱 Pay Directly via UPI App Details Area */}
              {paymentMethod === 'upi_app' && (() => {
                const checkoutUpiUri = buildCustomerPaymentUpiUri(
                  paymentSettings.upiId || 'freshcart@upi',
                  paymentSettings.payeeName || 'FreshCart Grocery Store',
                  total,
                  checkoutTxnRef
                );

                return (
                  <div
                    id="checkout-upi-app-details-panel"
                    className="checkout-subpanel rounded-xl sm:rounded-2xl p-6 mt-4 sm:mt-5 flex flex-col items-center text-center space-y-4"
                  >
                    {/* Amount to Pay */}
                    <div className="space-y-0.5">
                      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Amount to Pay
                      </p>
                      <p id="checkout-upi-app-amount-display" className="text-xl sm:text-2xl font-extrabold text-[#00e699] font-display tabular-nums">
                        {formatINR(total)}
                      </p>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                      Tap the button below to launch your installed UPI payment app (Google Pay, PhonePe, Paytm, BHIM) and complete the payment directly.
                    </p>

                    <div className="pt-1">
                      <a
                        id="checkout-direct-upi-app-link"
                        data-testid="checkout-direct-upi-app-link"
                        href={checkoutUpiUri}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white text-sm font-bold shadow-lg shadow-cyan-900/30 transition-all active:scale-95 cursor-pointer"
                      >
                        <Smartphone className="w-4 h-4" />
                        <span>Pay {formatINR(total)} via UPI App</span>
                      </a>
                    </div>

                    {/* Clear option: Upload Payment Screenshot after completing payment */}
                    <div className="w-full pt-2">
                      <PaymentProofUpload
                        orderId={draftOrderId}
                        customerId={currentUser?.id || 'guest_user'}
                        customerToken={currentUser?.token}
                        initialProof={submittedProof}
                        currentVerificationStatus={submittedProof ? 'PENDING_VERIFICATION' : 'NOT_UPLOADED'}
                        onProofSubmitted={(proof) => {
                          setSubmittedProof(proof);
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 4. ORDER SUMMARY & PLACE ORDER (Full-Width Section BELOW Payment - Centered Alignment) */}
            <div className="checkout-panel rounded-2xl p-6 sm:p-8">
              <div className="w-full max-w-md mx-auto space-y-5 text-center">

                {/* Centered Heading */}
                <div className="flex items-center justify-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-cyan-400 shrink-0" />
                  <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight font-display">
                    Order Summary
                  </h2>
                </div>

                {/* Optional Cart Items Peek (Centered trigger, left-aligned item rows) */}
                {items.length > 0 && (
                  <div className="text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => setShowItemsList(!showItemsList)}
                      className="hover:text-cyan-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer text-slate-400"
                    >
                      <span>{totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} in cart</span>
                      <span className="text-[10px] text-cyan-400 underline">{showItemsList ? 'Hide items' : 'View items'}</span>
                    </button>

                    {showItemsList && (
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1 text-left">
                        {items.map((item) => (
                          <div
                            key={item.product.id}
                            className="flex items-center gap-2.5 checkout-subpanel p-2 rounded-lg text-xs"
                          >
                            <img
                              src={item.product.image}
                              alt={item.product.title}
                              className="w-8 h-8 rounded object-cover bg-slate-800 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate">{item.product.title}</p>
                              <span className="text-slate-400">
                                Qty: {item.quantity} × {formatINR(item.product.price)}
                              </span>
                            </div>
                            <span className="font-semibold text-white tabular-nums shrink-0">
                              {formatINR(item.product.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Financial Breakdown (Centered container, visually aligned rows) */}
                <div className="space-y-3 pt-1">
                  {/* Subtotal */}
                  <div className="flex justify-between items-center text-sm text-slate-300">
                    <span>Subtotal</span>
                    <span className="font-semibold text-white tabular-nums">
                      {formatINR(subtotal)}
                    </span>
                  </div>

                  {/* Delivery Charges */}
                  <div className="flex justify-between items-center text-sm text-slate-300">
                    <span>Delivery Charges</span>
                    <span className={`tabular-nums ${deliveryChargesAmount > 0 ? 'font-semibold text-white' : 'text-emerald-400 font-semibold'}`}>
                      {items.length === 0 ? '₹0' : (deliveryChargesAmount > 0 ? formatINR(deliveryChargesAmount) : 'FREE')}
                    </span>
                  </div>

                  {/* Coupon Discount (if applicable) */}
                  {discount > 0 && activeCoupon && (
                    <div className="flex justify-between items-center text-sm text-emerald-400 font-medium">
                      <span>Discount ({activeCoupon.discountPercentage}% OFF)</span>
                      <span className="tabular-nums font-semibold">-{formatINR(discount)}</span>
                    </div>
                  )}

                  {/* Final Total (Centered & visually emphasized) */}
                  <div className="flex justify-between items-baseline pt-3 border-t border-[#0c2b4a]">
                    <span className="text-base sm:text-lg font-bold text-white">
                      Final Total
                    </span>
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#00e699] tabular-nums font-display">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* Place Order Button (Centered with reasonable width) */}
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    id="checkout-place-order-btn"
                    disabled={items.length === 0 || isSubmitting}
                    onClick={handlePlaceOrder}
                    className={`w-full max-w-sm py-3.5 px-6 rounded-xl text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                      items.length === 0 || isSubmitting
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                        : 'checkout-neon-btn text-white active:scale-[0.99]'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Processing Order...</span>
                      </>
                    ) : (
                      <>
                        <span>Place Order ({formatINR(total)}) →</span>
                      </>
                    )}
                  </button>
                </div>

              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <Footer
        onOpenAdmin={onOpenAdmin}
        onSelectCategory={onSelectCategory}
        onOpenLogin={onOpenLogin}
        onOpenDashboard={onOpenDashboard}
      />
    </div>
  );
};
