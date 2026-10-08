import React, { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { CartItem, CustomerOrder, Coupon, DeliveryChargeRule, UpiPaymentSettings } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/currency';
import { useLanguage } from '../context/LanguageContext';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../services/settingsService';
import {
  fetchUpiSettings,
  initiateUpiPayment,
  verifyPaymentStatus,
  getStoredUpiSettings,
} from '../services/paymentService';
import {
  CheckCircle,
  Banknote,
  MapPin,
  Clock,
  ShieldCheck,
  CreditCard,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Truck,
  QrCode,
  Smartphone,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { Footer } from './Footer';

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

  // Top-level Payment Method: 'cash' | 'upi'
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash' | 'upi'>('cash');

  // Sub-option inside UPI Payment: 'qr' | 'direct'
  const [upiSubOption, setUpiSubOption] = useState<'qr' | 'direct'>('qr');

  // Authoritative Admin UPI configuration
  const [upiSettings, setUpiSettings] = useState<UpiPaymentSettings | null>(() =>
    getStoredUpiSettings()
  );

  // Stable Order & Transaction Reference for this payment attempt
  // Generated ONCE on component mount so it never regenerates on React re-renders!
  const [paymentAttempt] = useState<{
    orderNumber: string;
    orderId: string;
    transactionRef: string;
  }>(() => {
    const num = Math.floor(1000 + Math.random() * 9000);
    const orderNum = String(num);
    const orderId = `#FC-${orderNum}`;
    const cleanId = orderNum;
    const transactionRef = `FC-TXN-${cleanId}-${Date.now().toString(36).toUpperCase()}`;
    return { orderNumber: orderNum, orderId, transactionRef };
  });

  const [orderNumber, setOrderNumber] = useState(paymentAttempt.orderNumber);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showItemsList, setShowItemsList] = useState(false);

  // QR and Verification State
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<
    'IDLE' | 'PENDING' | 'PENDING_VERIFICATION' | 'PAID' | 'FAILED' | 'CANCELLED'
  >('IDLE');
  const [verificationMessage, setVerificationMessage] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [directUpiOpened, setDirectUpiOpened] = useState(false);
  const [confirmedPaymentDetails, setConfirmedPaymentDetails] = useState<{
    method: string;
    status: string;
    ref?: string;
  }>({ method: 'Cash on Delivery', status: 'PENDING' });

  // Sync address from authenticated user
  useEffect(() => {
    if (currentUser?.address) {
      setAddress(currentUser.address);
    }
  }, [currentUser]);

  // Fetch authoritative latest UPI settings on mount and when entering checkout
  useEffect(() => {
    fetchUpiSettings().then((s) => {
      if (s) setUpiSettings(s);
    });
  }, []);

  // Recalculate financial breakdown
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
  const effectiveRules =
    deliveryRules && deliveryRules.length > 0 ? deliveryRules : DEFAULT_DELIVERY_RULES;

  const applicableDeliveryRule =
    items.length > 0 && subtotal > 0
      ? getApplicableDeliveryChargeRule(effectiveRules, subtotal)
      : null;

  const deliveryChargesAmount =
    items.length > 0 && subtotal > 0 && applicableDeliveryRule
      ? applicableDeliveryRule.deliveryCharge
      : items.length > 0
      ? deliveryCharges
      : 0;

  // Exact Final Order Total: Subtotal - Discount + Delivery
  const total = Math.max(
    0,
    Math.round((subtotal - discount + deliveryChargesAmount) * 100) / 100
  );

  // Dynamic app-agnostic UPI URI construction:
  // upi://pay?pa={Admin UPI ID}&pn={Admin Merchant Name}&am={Exact Final Total}&cu=INR&tr={Stable Reference}
  const isUpiConfigured = Boolean(upiSettings?.upiId && upiSettings.enabled);
  const upiId = upiSettings?.upiId || '';
  const merchantName = upiSettings?.merchantName || '';
  const upiUri = isUpiConfigured
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${total.toFixed(2)}&cu=INR&tr=${encodeURIComponent(paymentAttempt.transactionRef)}`
    : '';

  // Generate dynamic QR Code (EXACTLY ONE QR CODE)
  useEffect(() => {
    if (isUpiConfigured && total > 0 && upiUri) {
      QRCode.toDataURL(upiUri, {
        width: 256,
        margin: 2,
        color: { dark: '#030d1a', light: '#ffffff' },
      })
        .then(setQrDataUrl)
        .catch((err) => {
          console.warn('QR Code generation failed:', err);
        });
    } else {
      setQrDataUrl('');
    }
  }, [isUpiConfigured, upiUri, total]);

  /**
   * Finalizes an order upon verified payment or Cash on Delivery.
   */
  const finalizeOrder = useCallback(
    async (method: 'Cash on Delivery' | 'UPI Payment', status: 'PENDING' | 'PAID') => {
      const customerPhone = currentUser?.phone?.trim() || '';

      const newCustomerOrder: CustomerOrder = {
        id: paymentAttempt.orderId,
        customerId: currentUser?.id || 'guest_user',
        customerName: currentUser?.name || 'Guest Customer',
        customerEmail: currentUser?.email,
        customerPhone: customerPhone || undefined,
        deliveryAddress: address,
        deliveryTimeSlot: 'Express Cold-Chain Delivery, 24–30 Minutes',
        estimatedDeliveryTime: 'Express Cold-Chain Delivery',
        items: [...items],
        subtotal,
        discount,
        total,
        couponCode: appliedCoupon || undefined,
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
        paymentMethod: method,
        paymentStatus: status,
      };

      addOrder(newCustomerOrder);

      // Save order to MySQL backend
      try {
        await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {}),
          },
          body: JSON.stringify({
            ...newCustomerOrder,
            transactionRef: paymentAttempt.transactionRef,
            upiId: method === 'UPI Payment' ? upiId : undefined,
            merchantName: method === 'UPI Payment' ? merchantName : undefined,
          }),
        });
      } catch {
        // Continue even if network error
      }

      setConfirmedPaymentDetails({
        method,
        status,
        ref: method === 'UPI Payment' ? paymentAttempt.transactionRef : undefined,
      });

      // Deduct inventory idempotently and clear customer cart
      onOrderPlaced?.(items, newCustomerOrder);
      setStep('success');
      onClearCart();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [
      paymentAttempt,
      currentUser,
      address,
      items,
      subtotal,
      discount,
      total,
      appliedCoupon,
      addOrder,
      upiId,
      merchantName,
      onOrderPlaced,
      onClearCart,
    ]
  );

  /**
   * Handles payment verification with backend provider layer.
   * Enforces that returning to website or opening app does NOT mark success.
   */
  const handleVerifyPayment = async (
    actionMode: 'check' | 'confirm_payment' = 'confirm_payment'
  ) => {
    setIsVerifying(true);
    setVerificationMessage('');

    try {
      const res = await verifyPaymentStatus({
        orderId: paymentAttempt.orderId,
        transactionRef: paymentAttempt.transactionRef,
        amount: total,
        action: actionMode,
      });

      if (res.verified && res.paymentStatus === 'PAID') {
        setPaymentStatus('PAID');
        setVerificationMessage('Payment verified successfully!');
        await finalizeOrder('UPI Payment', 'PAID');
      } else if (res.paymentStatus === 'FAILED') {
        setPaymentStatus('FAILED');
        setVerificationMessage(
          res.error || 'Payment was declined by the bank. Please try again or choose Cash on Delivery.'
        );
      } else if (res.paymentStatus === 'CANCELLED') {
        setPaymentStatus('CANCELLED');
        setVerificationMessage(
          res.error || 'Payment was cancelled. You can retry or choose Cash on Delivery.'
        );
      } else {
        // Pending verification
        setPaymentStatus('PENDING_VERIFICATION');
        setVerificationMessage(
          res.message || 'Payment verification in progress. Awaiting confirmation from your bank.'
        );
      }
    } catch {
      setPaymentStatus('PENDING_VERIFICATION');
      setVerificationMessage(
        'Unable to reach payment provider. Please check your connection and tap Verify Payment.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  /**
   * Safe Return-To-Website listener:
   * When returning from a UPI app to FreshCart (via window focus or visibility change),
   * FreshCart NEVER treats navigation as success! It asks the backend for status.
   */
  useEffect(() => {
    const handleReturn = () => {
      if (
        document.visibilityState === 'visible' &&
        directUpiOpened &&
        paymentStatus !== 'PAID'
      ) {
        // Safe query: asks backend for current payment verification status
        handleVerifyPayment('check');
      }
    };

    document.addEventListener('visibilitychange', handleReturn);
    window.addEventListener('focus', handleReturn);

    return () => {
      document.removeEventListener('visibilitychange', handleReturn);
      window.removeEventListener('focus', handleReturn);
    };
  }, [directUpiOpened, paymentStatus]);

  /**
   * Launch Direct UPI app:
   * Records payment attempt and triggers standard app-agnostic UPI URI.
   */
  const handleLaunchDirectUpi = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isUpiConfigured || !upiUri) return;

    // Record attempt in backend
    try {
      await initiateUpiPayment({
        orderId: paymentAttempt.orderId,
        customerId: currentUser?.id || 'guest_user',
        subtotal,
        discount,
        deliveryCharges: deliveryChargesAmount,
        total,
        transactionRef: paymentAttempt.transactionRef,
        items,
      });
    } catch {
      // ignore
    }

    setDirectUpiOpened(true);
    setPaymentStatus('PENDING_VERIFICATION');
    setVerificationMessage(
      'UPI application opened. Complete payment in your UPI app, then return here to verify.'
    );

    // Launch standard app-agnostic UPI protocol
    window.location.href = upiUri;
  };

  /**
   * Handles checkout submit button at the bottom.
   */
  const handleSubmitCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    if (selectedPaymentMethod === 'cash') {
      setIsSubmitting(true);
      setTimeout(() => {
        setIsSubmitting(false);
        finalizeOrder('Cash on Delivery', 'PENDING');
      }, 700);
      return;
    }

    // UPI Payment
    if (!isUpiConfigured) {
      alert('UPI payment is currently unavailable. Please configure a UPI ID in Admin Payment Settings.');
      return;
    }

    if (paymentStatus === 'PAID') {
      setStep('success');
      return;
    }

    // Customer initiates verification check
    handleVerifyPayment('confirm_payment');
  };

  return (
    <div id="checkout-page-container" className="w-full flex flex-col min-h-screen">
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4 sm:space-y-4.5">

        {/* Step: Order Confirmed Screen */}
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

            {/* Delivery & Payment Details Recap */}
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
                {confirmedPaymentDetails.method === 'UPI Payment' ? (
                  <span className="text-emerald-400 font-semibold">
                    UPI Payment (Verified &amp; Paid) · Ref: {confirmedPaymentDetails.ref || paymentAttempt.transactionRef}
                  </span>
                ) : (
                  <span>Cash on Delivery (Pending Doorstep Collection)</span>
                )}
              </p>
            </div>

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
          /* Step: Details */
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
                  Delivery Address &amp; Time Slot
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
                    className="checkout-input w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-hidden"
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
                    className="checkout-input w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-hidden"
                  />
                </div>

                <div className="checkout-subpanel w-full px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm text-slate-300">
                  <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Express Cold-Chain Delivery, 24–30 Minutes</span>
                </div>
              </div>
            </div>

            {/* 3. SELECT PAYMENT METHOD */}
            <div className="checkout-panel rounded-2xl p-5 sm:p-6 space-y-4 sm:space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight font-display">
                    Payment Methods
                  </h2>
                </div>
                <span className="text-xs sm:text-sm text-cyan-400 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Secure Checkout</span>
                </span>
              </div>

              {/* Top-Level Payment Method Selector: Exactly 1. Cash on Delivery and 2. UPI Payment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                {/* 1. Cash on Delivery */}
                <div
                  id="checkout-payment-cash-opt"
                  data-testid="checkout-payment-cash-opt"
                  onClick={() => setSelectedPaymentMethod('cash')}
                  className={`p-4 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedPaymentMethod === 'cash'
                      ? 'checkout-card-selected'
                      : 'checkout-card hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          selectedPaymentMethod === 'cash'
                            ? 'bg-[#00d2aa] text-[#030d1a]'
                            : 'border-2 border-slate-500'
                        }`}
                      >
                        {selectedPaymentMethod === 'cash' && (
                          <div className="w-2 h-2 rounded-full bg-[#030d1a]" />
                        )}
                      </div>
                      <span className="text-sm font-bold text-white">Cash on Delivery</span>
                    </div>
                    <Banknote className="w-5 h-5 text-cyan-400 shrink-0" />
                  </div>
                  <div className="mt-2.5">
                    <p className="text-xs text-slate-400">Pay cash upon doorstep delivery</p>
                  </div>
                </div>

                {/* 2. UPI Payment (ONE top-level payment method) */}
                <div
                  id="checkout-payment-upi-opt"
                  data-testid="checkout-payment-upi-opt"
                  onClick={() => setSelectedPaymentMethod('upi')}
                  className={`p-4 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedPaymentMethod === 'upi'
                      ? 'checkout-card-selected'
                      : 'checkout-card hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          selectedPaymentMethod === 'upi'
                            ? 'bg-[#00d2aa] text-[#030d1a]'
                            : 'border-2 border-slate-500'
                        }`}
                      >
                        {selectedPaymentMethod === 'upi' && (
                          <div className="w-2 h-2 rounded-full bg-[#030d1a]" />
                        )}
                      </div>
                      <span className="text-sm font-bold text-white">UPI Payment</span>
                    </div>
                    <QrCode className="w-5 h-5 text-cyan-400 shrink-0" />
                  </div>
                  <div className="mt-2.5">
                    <p className="text-xs text-slate-400">Pay via QR code or directly via UPI App</p>
                  </div>
                </div>
              </div>

              {/* Cash on Delivery Details */}
              {selectedPaymentMethod === 'cash' && (
                <div
                  id="checkout-cash-details-panel"
                  className="checkout-subpanel rounded-xl sm:rounded-2xl p-4 text-xs text-slate-300 space-y-1 text-center max-w-md animate-fadeIn"
                >
                  <p className="font-semibold text-white">Doorstep Payment Selected</p>
                  <p className="text-slate-400">
                    Please keep exact cash ready upon delivery handover.
                  </p>
                </div>
              )}

              {/* UPI Payment Container: Shown when UPI Payment is selected */}
              {selectedPaymentMethod === 'upi' && (
                <div id="checkout-upi-container" className="space-y-4 max-w-xl animate-fadeIn">
                  {!isUpiConfigured ? (
                    /* Notice when no UPI ID is configured in Admin */
                    <div
                      id="checkout-upi-unavailable-notice"
                      data-testid="checkout-upi-unavailable-notice"
                      className="checkout-subpanel rounded-xl p-4 text-xs text-amber-300 border border-amber-500/30 flex items-center gap-3"
                    >
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                      <span>
                        UPI payment is currently unavailable. Please configure a UPI ID in Admin Payment Settings.
                      </span>
                    </div>
                  ) : (
                    /* Configured UPI Payment Experience */
                    <div className="space-y-4">
                      {/* Sub-Option Selector: A. Pay with QR Code | B. Pay Directly via UPI App */}
                      <div className="flex rounded-xl bg-black/40 p-1 border border-white/10 w-fit">
                        <button
                          type="button"
                          id="checkout-upi-sub-qr"
                          data-testid="checkout-upi-sub-qr"
                          onClick={() => setUpiSubOption('qr')}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                            upiSubOption === 'qr'
                              ? 'bg-[#00d2aa] text-[#030d1a] shadow-sm'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          <QrCode className="w-4 h-4" />
                          <span>Pay with QR Code</span>
                        </button>
                        <button
                          type="button"
                          id="checkout-upi-sub-direct"
                          data-testid="checkout-upi-sub-direct"
                          onClick={() => setUpiSubOption('direct')}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                            upiSubOption === 'direct'
                              ? 'bg-[#00d2aa] text-[#030d1a] shadow-sm'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          <Smartphone className="w-4 h-4" />
                          <span>Pay Directly via UPI App</span>
                        </button>
                      </div>

                      {/* Sub-Option A: Pay with QR Code (ONE QR CODE ONLY) */}
                      {upiSubOption === 'qr' && (
                        <div
                          id="checkout-upi-qr-panel"
                          className="checkout-subpanel rounded-2xl p-5 text-center space-y-4 max-w-md animate-fadeIn"
                        >
                          {/* EXACTLY ONE QR CODE CONTAINER */}
                          <div className="flex flex-col items-center justify-center">
                            <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-cyan-400/30 inline-block">
                              {qrDataUrl ? (
                                <img
                                  id="checkout-upi-qr-image"
                                  data-testid="checkout-upi-qr-image"
                                  src={qrDataUrl}
                                  alt="Unified UPI Payment QR Code"
                                  className="w-56 h-56 max-w-full rounded-lg select-none pointer-events-none"
                                />
                              ) : (
                                <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-xs">
                                  Generating QR Code...
                                </div>
                              )}
                            </div>
                            <p className="mt-3 text-sm font-semibold text-white">
                              Scan using any UPI app
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Scan with PhonePe, Google Pay, Paytm, BHIM, or any compatible UPI application.
                            </p>
                          </div>

                          {/* Payment Verification Area */}
                          <div className="pt-2 border-t border-white/10 space-y-2">
                            {paymentStatus === 'PENDING_VERIFICATION' && (
                              <div
                                id="checkout-upi-pending-banner"
                                className="text-xs text-amber-300 bg-amber-950/40 p-2.5 rounded-lg border border-amber-500/30 flex items-center justify-center gap-2 animate-fadeIn"
                              >
                                <Clock className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
                                <span>{verificationMessage || 'Awaiting payment confirmation with bank...'}</span>
                              </div>
                            )}

                            {paymentStatus === 'FAILED' && (
                              <div
                                id="checkout-upi-failed-banner"
                                className="text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-lg border border-rose-500/30 flex items-center justify-center gap-2 animate-fadeIn"
                              >
                                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                                <span>{verificationMessage || 'Payment failed or declined. Please retry or choose Cash on Delivery.'}</span>
                              </div>
                            )}

                            {paymentStatus === 'CANCELLED' && (
                              <div
                                id="checkout-upi-cancelled-banner"
                                className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700 flex items-center justify-center gap-2 animate-fadeIn"
                              >
                                <span>{verificationMessage || 'Payment was cancelled. You can retry anytime.'}</span>
                              </div>
                            )}

                            <button
                              type="button"
                              id="checkout-verify-qr-btn"
                              data-testid="checkout-verify-qr-btn"
                              disabled={isVerifying}
                              onClick={() => handleVerifyPayment('confirm_payment')}
                              className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {isVerifying ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Verifying Payment with Bank...</span>
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="w-4 h-4 text-cyan-200" />
                                  <span>Verify Payment</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Sub-Option B: Pay Directly via UPI App */}
                      {upiSubOption === 'direct' && (
                        <div
                          id="checkout-upi-direct-panel"
                          className="checkout-subpanel rounded-2xl p-5 text-center space-y-4 max-w-md animate-fadeIn"
                        >
                          <div className="space-y-2">
                            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mx-auto flex items-center justify-center">
                              <Smartphone className="w-6 h-6" />
                            </div>
                            <h3 className="text-sm font-bold text-white">
                              Pay Directly via UPI App
                            </h3>
                            <p className="text-xs text-slate-400 max-w-xs mx-auto">
                              Opens your compatible UPI application (PhonePe, Google Pay, Paytm, BHIM, etc.) with the exact final order total.
                            </p>
                          </div>

                          <div className="pt-2">
                            <a
                              id="checkout-direct-upi-launch-btn"
                              data-testid="checkout-direct-upi-launch-btn"
                              href={upiUri}
                              onClick={handleLaunchDirectUpi}
                              className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-[#00d2aa] hover:bg-[#00baa0] text-[#030d1a] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                            >
                              <ExternalLink className="w-4 h-4" />
                              <span>Open UPI Apps</span>
                            </a>
                          </div>

                          {/* Direct Return Feedback & Verification */}
                          <div className="pt-2 border-t border-white/10 space-y-2">
                            {directUpiOpened && (
                              <p className="text-[11px] text-cyan-300">
                                UPI app opened. After completing payment in your UPI app, return to FreshCart and verify.
                              </p>
                            )}

                            {paymentStatus === 'PENDING_VERIFICATION' && (
                              <div
                                id="checkout-upi-direct-pending-banner"
                                className="text-xs text-amber-300 bg-amber-950/40 p-2.5 rounded-lg border border-amber-500/30 flex items-center justify-center gap-2 animate-fadeIn"
                              >
                                <Clock className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
                                <span>{verificationMessage || 'Awaiting confirmation from bank...'}</span>
                              </div>
                            )}

                            {paymentStatus === 'FAILED' && (
                              <div
                                id="checkout-upi-direct-failed-banner"
                                className="text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-lg border border-rose-500/30 flex items-center justify-center gap-2 animate-fadeIn"
                              >
                                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                                <span>{verificationMessage || 'Payment failed or declined. Please retry or choose Cash on Delivery.'}</span>
                              </div>
                            )}

                            {paymentStatus === 'CANCELLED' && (
                              <div
                                id="checkout-upi-direct-cancelled-banner"
                                className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700 flex items-center justify-center gap-2 animate-fadeIn"
                              >
                                <span>{verificationMessage || 'Payment was cancelled. You can retry.'}</span>
                              </div>
                            )}

                            <button
                              type="button"
                              id="checkout-verify-direct-btn"
                              data-testid="checkout-verify-direct-btn"
                              disabled={isVerifying}
                              onClick={() => handleVerifyPayment('confirm_payment')}
                              className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {isVerifying ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Verifying Payment with Bank...</span>
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="w-4 h-4 text-cyan-200" />
                                  <span>Verify Payment</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 4. ORDER SUMMARY & PLACE ORDER */}
            <div className="checkout-panel rounded-2xl p-6 sm:p-8">
              <div className="w-full max-w-md mx-auto space-y-5 text-center">

                {/* Centered Heading */}
                <div className="flex items-center justify-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-cyan-400 shrink-0" />
                  <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight font-display">
                    Order Summary
                  </h2>
                </div>

                {/* Optional Cart Items Peek */}
                {items.length > 0 && (
                  <div className="text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => setShowItemsList(!showItemsList)}
                      className="hover:text-cyan-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer text-slate-400"
                    >
                      <span>
                        {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} in cart
                      </span>
                      <span className="text-[10px] text-cyan-400 underline">
                        {showItemsList ? 'Hide items' : 'View items'}
                      </span>
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

                {/* Financial Breakdown */}
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
                    <span
                      className={`tabular-nums ${
                        deliveryChargesAmount > 0
                          ? 'font-semibold text-white'
                          : 'text-emerald-400 font-semibold'
                      }`}
                    >
                      {items.length === 0
                        ? '₹0'
                        : deliveryChargesAmount > 0
                        ? formatINR(deliveryChargesAmount)
                        : 'FREE'}
                    </span>
                  </div>

                  {/* Coupon Discount (if applicable) */}
                  {discount > 0 && activeCoupon && (
                    <div className="flex justify-between items-center text-sm text-emerald-400 font-medium">
                      <span>Discount ({activeCoupon.discountPercentage}% OFF)</span>
                      <span className="tabular-nums font-semibold">-{formatINR(discount)}</span>
                    </div>
                  )}

                  {/* Final Total */}
                  <div className="flex justify-between items-baseline pt-3 border-t border-[#0c2b4a]">
                    <span className="text-base sm:text-lg font-bold text-white">
                      Final Total
                    </span>
                    <span
                      id="checkout-final-total-amount"
                      className="text-2xl sm:text-3xl font-extrabold text-[#00e699] tabular-nums font-display"
                    >
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* Submit / Place Order Button */}
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    id="checkout-place-order-btn"
                    data-testid="checkout-place-order-btn"
                    disabled={items.length === 0 || isSubmitting}
                    onClick={handleSubmitCheckout}
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
                    ) : selectedPaymentMethod === 'cash' ? (
                      <>
                        <span>Place Order ({formatINR(total)}) →</span>
                      </>
                    ) : paymentStatus === 'PAID' ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-white" />
                        <span>View Confirmed Order →</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-white" />
                        <span>Verify &amp; Confirm UPI Order ({formatINR(total)}) →</span>
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
