import React, { useState, useEffect } from 'react';
import { CartItem, CustomerOrder, Coupon, DeliveryChargeRule } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/currency';
import { useLanguage } from '../context/LanguageContext';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../services/settingsService';
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
  const [paymentMethod] = useState<'cash'>('cash');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showItemsList, setShowItemsList] = useState(false);

  useEffect(() => {
    if (currentUser?.address) {
      setAddress(currentUser.address);
    }
  }, [currentUser]);

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

      // Save order to customer account history
      const newCustomerOrder: CustomerOrder = {
        id: generatedOrder,
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
        paymentMethod: 'Cash on Delivery',
        paymentStatus: 'PENDING',
      };
      addOrder(newCustomerOrder);

      // Save to MySQL backend
      fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {}),
        },
        body: JSON.stringify(newCustomerOrder),
      }).catch(() => {});

      onOrderPlaced?.(items, newCustomerOrder);
      setStep('success');
      onClearCart();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 800);
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
              <p className="pl-6 text-slate-400">Cash on Delivery (Pending Doorstep Collection)</p>
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

            {/* 3. SELECT PAYMENT METHOD */}
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

              {/* Cash on Delivery Option */}
              <div className="max-w-md">
                <div
                  id="checkout-payment-cash-opt"
                  data-testid="checkout-payment-cash-opt"
                  className="p-4 sm:p-4.5 rounded-xl text-left transition-all checkout-card-selected flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#00d2aa] text-[#030d1a]">
                        <div className="w-2 h-2 rounded-full bg-[#030d1a]" />
                      </div>
                      <span className="text-sm sm:text-base font-bold text-white">Cash on Delivery</span>
                    </div>
                    <Banknote className="w-5 h-5 text-cyan-400 shrink-0" />
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-slate-400">Pay cash upon doorstep delivery</p>
                  </div>
                </div>
              </div>

              {/* Cash on Delivery Details */}
              <div
                id="checkout-cash-details-panel"
                className="checkout-subpanel rounded-xl sm:rounded-2xl p-4 sm:p-5 text-xs text-slate-300 space-y-1 text-center max-w-md"
              >
                <p className="font-semibold text-white">Doorstep Payment Selected</p>
                <p className="text-slate-400">
                  Please keep exact cash ready upon delivery handover.
                </p>
              </div>
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

                  {/* Final Total */}
                  <div className="flex justify-between items-baseline pt-3 border-t border-[#0c2b4a]">
                    <span className="text-base sm:text-lg font-bold text-white">
                      Final Total
                    </span>
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#00e699] tabular-nums font-display">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* Place Order Button */}
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
