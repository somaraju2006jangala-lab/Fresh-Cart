import React, { useState, useEffect } from 'react';
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
import { generateQrDataUrl } from '../utils/qrCodeGenerator';
import {
  CheckCircle,
  Banknote,
  MapPin,
  Clock,
  ShieldCheck,
  Tag,
  Zap,
  QrCode,
  Smartphone,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Truck,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { generateOrderOtp, resendOrderOtp } from '../services/otpClientService';
import { TrustBanner } from './TrustBanner';
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi_qr' | 'upi_app'>('upi_qr');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment Settings state
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(getStoredPaymentSettings());
  const [copiedUpi, setCopiedUpi] = useState(false);

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

  const handleCopyUpi = () => {
    const upi = paymentSettings.upiId || 'freshcart@upi';
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(upi);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
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
    : 0;

  const total = Math.max(0, Math.round((subtotal - discount + deliveryChargesAmount) * 100) / 100);

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

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
        paymentStatus: paymentMethod === 'cash' ? 'Pending' : 'Paid',
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
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* Top Header Banner (Semi-Solid Opaque) */}
        <div className="cart-semi-opaque-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="checkout-back-to-cart-btn"
              onClick={onBackToCart}
              className="p-2 sm:p-2.5 rounded-xl cart-semi-opaque-control hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Return to Cart"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Zap className="w-4 h-4" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white font-display">
                  {step === 'details' ? 'Payment' : t('orderConfirmed')}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {step === 'details' ? 'Final Step' : `#FC-${orderNumber}`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 pl-10 hidden sm:block">
                {step === 'details'
                  ? 'Choose your payment method and complete your FreshCart grocery order'
                  : 'Your fresh farm groceries have been scheduled for direct pod dispatch'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>100% Secure Checkout</span>
            </span>
          </div>
        </div>

        {/* Step: Order Confirmed Screen (Semi-Solid Opaque) */}
        {step === 'success' ? (
          <div className="cart-semi-opaque-panel rounded-3xl p-6 sm:p-10 max-w-2xl mx-auto my-6 text-center space-y-6">
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

            {/* Handover OTP Verification Box (Semi-Solid Opaque) */}
            <div className="cart-semi-opaque-card rounded-2xl p-5 sm:p-6 text-center space-y-3">
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

            {/* Delivery Details Recap */}
            <div className="cart-semi-opaque-card rounded-2xl p-4 text-left text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 text-white font-semibold">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Delivery Address</span>
              </div>
              <p className="pl-6 text-slate-400">{address}</p>
              <div className="flex items-center gap-2 text-white font-semibold pt-1">
                <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Estimated Delivery</span>
              </div>
              <p className="pl-6 text-slate-400">24–30 Minutes (Direct Express Pod)</p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigateToDashboard?.()}
                className="flex-1 py-3 px-4 rounded-xl bg-[#00873a] hover:bg-[#00a347] text-white text-sm font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>View Order in Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigateToStorefront?.()}
                className="py-3 px-5 rounded-xl cart-semi-opaque-control hover:bg-slate-700/80 text-white text-sm font-semibold transition-all cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        ) : (
          /* Step: Details - 2-Column Responsive Layout */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT SIDE: Delivery & Payment Methods (lg:col-span-7) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Delivery Address Card (Semi-Solid Opaque) */}
              <div className="cart-semi-opaque-panel rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-base sm:text-lg font-bold text-white font-display">
                    Delivery Address & Time Slot
                  </h2>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Delivery Address
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Enter delivery street address"
                      className="cart-semi-opaque-control w-full px-3.5 py-2.5 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Delivery Note (Optional)
                    </label>
                    <input
                      type="text"
                      value={deliveryNote}
                      onChange={(e) => setDeliveryNote(e.target.value)}
                      placeholder="e.g. Leave at front door, ring bell"
                      className="cart-semi-opaque-control w-full px-3.5 py-2.5 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl cart-semi-opaque-card text-xs text-slate-300">
                    <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Express Cold-Chain Delivery: <strong className="text-white">24–30 Minutes</strong></span>
                  </div>
                </div>
              </div>

              {/* Payment Method Selection Card (Semi-Solid Opaque) */}
              <div className="cart-semi-opaque-panel rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-base sm:text-lg font-bold text-white font-display">
                      Select Payment Method
                    </h2>
                  </div>
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified</span>
                  </span>
                </div>

                {/* Payment Option Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Option 1: UPI / QR Payment */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi_qr')}
                    className={`p-3.5 rounded-2xl text-left transition-all border cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'upi_qr'
                        ? 'cart-semi-opaque-card border-emerald-500/80 ring-1 ring-emerald-500/40'
                        : 'cart-semi-opaque-card border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <QrCode className="w-5 h-5 text-emerald-400" />
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        paymentMethod === 'upi_qr' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-500'
                      }`}>
                        {paymentMethod === 'upi_qr' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs sm:text-sm font-bold text-white">UPI / QR Code</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Scan & Pay via any app</p>
                    </div>
                  </button>

                  {/* Option 2: Direct UPI App */}
                  {paymentSettings.directUpiAppEnabled !== false && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('upi_app')}
                      className={`p-3.5 rounded-2xl text-left transition-all border cursor-pointer flex flex-col justify-between ${
                        paymentMethod === 'upi_app'
                          ? 'cart-semi-opaque-card border-emerald-500/80 ring-1 ring-emerald-500/40'
                          : 'cart-semi-opaque-card border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Smartphone className="w-5 h-5 text-emerald-400" />
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          paymentMethod === 'upi_app' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-500'
                        }`}>
                          {paymentMethod === 'upi_app' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-xs sm:text-sm font-bold text-white">Direct UPI App</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Paytm, GPay, PhonePe</p>
                      </div>
                    </button>
                  )}

                  {/* Option 3: Cash on Delivery */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-3.5 rounded-2xl text-left transition-all border cursor-pointer flex flex-col justify-between ${
                      paymentMethod === 'cash'
                        ? 'cart-semi-opaque-card border-emerald-500/80 ring-1 ring-emerald-500/40'
                        : 'cart-semi-opaque-card border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Banknote className="w-5 h-5 text-emerald-400" />
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        paymentMethod === 'cash' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-500'
                      }`}>
                        {paymentMethod === 'cash' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs sm:text-sm font-bold text-white">Cash on Delivery</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Pay at doorstep</p>
                    </div>
                  </button>
                </div>

                {/* Sub-Section 1: UPI / QR Details (Semi-Solid Opaque) */}
                {paymentMethod === 'upi_qr' && (
                  <div className="cart-semi-opaque-card rounded-2xl p-5 space-y-4 border border-emerald-500/30">
                    <div className="flex flex-col sm:flex-row items-center gap-5">
                      {/* QR Code Container */}
                      <div className="bg-white p-3 rounded-2xl shadow-md shrink-0 border border-white/80">
                        <img
                          src={
                            paymentSettings.qrCodeUrl ||
                            generateQrDataUrl(
                              `upi://pay?pa=${paymentSettings.upiId || 'freshcart@upi'}&pn=${encodeURIComponent(paymentSettings.payeeName || 'FreshCart')}&cu=INR`,
                              { size: 160 }
                            )
                          }
                          alt="Merchant UPI QR Code"
                          className="w-36 h-36 object-contain"
                        />
                      </div>

                      {/* Merchant Details */}
                      <div className="space-y-3 flex-1 text-center sm:text-left">
                        <div>
                          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                            Merchant Name
                          </p>
                          <p className="text-sm font-bold text-white">
                            {paymentSettings.payeeName || 'FreshCart Grocery Store'}
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                            Merchant UPI ID
                          </p>
                          <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                            <span className="font-mono text-xs sm:text-sm text-emerald-400 font-bold bg-slate-900/80 px-2.5 py-1 rounded-lg border border-white/10">
                              {paymentSettings.upiId || 'freshcart@upi'}
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyUpi}
                              className="p-1.5 rounded-lg cart-semi-opaque-control hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                              title="Copy UPI ID"
                            >
                              {copiedUpi ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Scan using Google Pay, PhonePe, Paytm, BHIM, or any UPI banking app.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-Section 2: Direct UPI App Details */}
                {paymentMethod === 'upi_app' && (
                  <div className="cart-semi-opaque-card rounded-2xl p-5 space-y-3 border border-emerald-500/30">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Tap the button below to launch your installed UPI payment application (Google Pay, PhonePe, Paytm) directly on your device:
                    </p>
                    <a
                      href={`upi://pay?pa=${paymentSettings.upiId || 'freshcart@upi'}&pn=${encodeURIComponent(paymentSettings.payeeName || 'FreshCart')}&cu=INR`}
                      className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>Open UPI App to Pay</span>
                    </a>
                  </div>
                )}

                {/* Sub-Section 3: Cash on Delivery Details */}
                {paymentMethod === 'cash' && (
                  <div className="cart-semi-opaque-card rounded-2xl p-4 text-xs text-slate-300 space-y-1 border border-white/10">
                    <p className="font-semibold text-white">Doorstep Payment Selected</p>
                    <p className="text-slate-400">
                      You can pay via Cash or ask the delivery runner for their on-the-spot UPI QR code upon handover.
                    </p>
                  </div>
                )}

              </div>
            </div>

            {/* RIGHT SIDE: Order Summary & Place Order (lg:col-span-5) */}
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-28">
              
              {/* Order Summary Card (Semi-Solid Opaque) */}
              <div className="cart-semi-opaque-panel rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-base sm:text-lg font-bold text-white font-display">
                      Order Summary
                    </h2>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {/* Product Items List inside Order Summary */}
                {items.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 cart-semi-opaque-card rounded-xl">
                    Your cart is empty.{' '}
                    <button
                      type="button"
                      onClick={onBackToCart}
                      className="text-emerald-400 underline font-semibold hover:text-emerald-300"
                    >
                      Return to Cart
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {items.map((item) => (
                      <div
                        key={item.product.id}
                        className="flex items-center gap-3 p-2.5 rounded-xl cart-semi-opaque-card"
                      >
                        <img
                          src={item.product.image}
                          alt={item.product.title}
                          className="w-12 h-12 rounded-lg object-cover bg-slate-800/80 shrink-0 border border-white/10"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-white truncate leading-snug">
                            {item.product.title}
                          </p>
                          <div className="flex items-center justify-between text-xs mt-1">
                            <span className="text-slate-400">
                              Qty: {item.quantity} × {formatINR(item.product.price)}
                            </span>
                            <span className="font-bold text-white tabular-nums">
                              {formatINR(item.product.price * item.quantity)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Financial Breakdown */}
                <div className="space-y-2.5 text-xs sm:text-sm pt-2 border-t border-white/10">
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal</span>
                    <span className="font-semibold text-white tabular-nums">
                      {formatINR(subtotal)}
                    </span>
                  </div>

                  {discount > 0 && activeCoupon && (
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>Discount ({activeCoupon.discountPercentage}% OFF)</span>
                      <span className="tabular-nums">-{formatINR(discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-300">
                    <span>Delivery Charges</span>
                    <span className={`tabular-nums ${deliveryChargesAmount > 0 ? 'font-semibold text-white' : 'text-emerald-400 font-semibold'}`}>
                      {items.length === 0 ? '₹0' : (deliveryChargesAmount > 0 ? formatINR(deliveryChargesAmount) : 'FREE')}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline pt-3 border-t border-white/10">
                    <span className="text-sm sm:text-base font-bold text-white">
                      Final Total
                    </span>
                    <span className="text-xl sm:text-2xl font-bold text-emerald-400 tabular-nums font-display">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* Place Order Button */}
                <div className="pt-2 space-y-3">
                  <button
                    type="button"
                    id="checkout-place-order-btn"
                    disabled={items.length === 0 || isSubmitting}
                    onClick={handlePlaceOrder}
                    className={`w-full py-3.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                      items.length === 0 || isSubmitting
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                        : 'bg-[#00873a] hover:bg-[#00a347] text-white hover:brightness-105 active:scale-98 cursor-pointer'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Processing Order...</span>
                      </>
                    ) : (
                      <>
                        <span>Place Order ({formatINR(total)})</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 pt-1">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>SSL Encrypted</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>7-Min Pod Dispatch</span>
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Trust & Guarantee Banner */}
      <TrustBanner />

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
