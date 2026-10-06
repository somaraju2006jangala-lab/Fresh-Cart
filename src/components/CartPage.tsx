import React, { useState, useEffect } from 'react';
import { CartItem, Coupon, DeliveryChargeRule } from '../types';
import { formatINR } from '../utils/currency';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../services/settingsService';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Truck,
  ArrowRight,
  ArrowLeft,
  Tag,
  Check,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { TrustBanner } from './TrustBanner';
import { Footer } from './Footer';

interface CartPageProps {
  items: CartItem[];
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onOpenCheckout: () => void;
  appliedCoupon: string | null;
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  coupons?: Coupon[];
  deliveryCharges?: number;
  deliveryRules?: DeliveryChargeRule[];
  onBackToStorefront: () => void;
  onOpenAdmin: () => void;
  onSelectCategory: (category: string) => void;
  onOpenLogin: () => void;
  onOpenDashboard: () => void;
}

export const CartPage: React.FC<CartPageProps> = ({
  items,
  onUpdateQty,
  onRemoveItem,
  onOpenCheckout,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  coupons = [],
  deliveryCharges = 40,
  deliveryRules,
  onBackToStorefront,
  onOpenAdmin,
  onSelectCategory,
  onOpenLogin,
  onOpenDashboard,
}) => {
  const { t } = useLanguage();
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponFeedback, setCouponFeedback] = useState('');

  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const isCouponValidNow = (c: Coupon): boolean => {
    if (!c.isActive) return false;
    const now = new Date();
    if (c.startDate) {
      const s = new Date(c.startDate);
      s.setHours(0, 0, 0, 0);
      if (now < s) return false;
    }
    if (c.expiryDate) {
      const e = new Date(c.expiryDate);
      e.setHours(23, 59, 59, 999);
      if (now > e) return false;
    }
    if (c.maxUses !== undefined && c.usedCount !== undefined && c.usedCount >= c.maxUses) {
      return false;
    }
    return true;
  };

  const activeRules = coupons.filter(isCouponValidNow);

  const activeCoupon = appliedCoupon
    ? activeRules.find((c) => c.code.toUpperCase() === appliedCoupon.toUpperCase())
    : null;

  const isQualified = Boolean(activeCoupon && subtotal >= (activeCoupon.minOrderAmount || 0));
  const discountPercent = isQualified && activeCoupon ? activeCoupon.discountPercentage : 0;
  const discount = Math.round((subtotal * discountPercent) / 100);

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

  // Dynamic cart total revalidation when subtotal changes
  const prevSubtotalRef = React.useRef(subtotal);
  useEffect(() => {
    if (!appliedCoupon) {
      prevSubtotalRef.current = subtotal;
      return;
    }

    if (subtotal <= 0) {
      onRemoveCoupon();
      setCouponFeedback('');
      prevSubtotalRef.current = subtotal;
      return;
    }

    if (prevSubtotalRef.current !== subtotal) {
      prevSubtotalRef.current = subtotal;

      const qualifyingRules = activeRules.filter(
        (c) => subtotal >= (c.minOrderAmount || 0)
      );

      if (qualifyingRules.length === 0) {
        const minReq = activeRules.length > 0
          ? Math.min(...activeRules.map((c) => c.minOrderAmount || 0))
          : 1000;
        onRemoveCoupon();
        setCouponError(
          `Coupon removed: Cart total (${formatINR(subtotal)}) no longer qualifies for minimum order (${formatINR(minReq)}).`
        );
        setCouponFeedback('');
      } else {
        const highestRule = [...qualifyingRules].sort(
          (a, b) => b.discountPercentage - a.discountPercentage || (b.minOrderAmount || 0) - (a.minOrderAmount || 0)
        )[0];

        if (highestRule && highestRule.code.toUpperCase() !== appliedCoupon.toUpperCase()) {
          onApplyCoupon(highestRule.code);
          setCouponFeedback(
            `Discount updated: ${highestRule.discountPercentage}% OFF tier applied for cart total of ${formatINR(subtotal)}.`
          );
          setCouponError('');
        }
      }
    }
  }, [subtotal, appliedCoupon, coupons, activeRules, onApplyCoupon, onRemoveCoupon]);

  // Dynamic delivery goal meter based on lowest FREE delivery rule
  const freeRule = [...effectiveRules]
    .sort((a, b) => a.minOrderAmount - b.minOrderAmount)
    .find((r) => r.deliveryCharge === 0);
  const freeDeliveryThreshold = freeRule ? freeRule.minOrderAmount : 3000;
  const deliveryDiff = freeDeliveryThreshold - subtotal;
  const deliveryProgressPct = freeDeliveryThreshold > 0
    ? Math.min(100, Math.round((subtotal / freeDeliveryThreshold) * 100))
    : 100;

  const handleApplyCouponSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCouponError('');
    setCouponFeedback('');

    if (items.length === 0 || subtotal <= 0) {
      setCouponError('Please add items to your cart before applying a coupon.');
      return;
    }

    const code = couponInput.trim().toUpperCase();

    if (code) {
      const matchedCoupon = coupons.find((c) => c.code.toUpperCase() === code);
      if (!matchedCoupon) {
        setCouponError(t('invalidCouponError') || 'Invalid coupon code. Please enter a valid coupon.');
        return;
      }

      if (!matchedCoupon.isActive) {
        setCouponError(t('disabledCouponError') || 'This coupon code is currently disabled.');
        return;
      }

      if (!isCouponValidNow(matchedCoupon)) {
        setCouponError('This coupon is currently expired or has reached its usage limit.');
        return;
      }

      const requiredMin = matchedCoupon.minOrderAmount || 0;
      if (subtotal < requiredMin) {
        setCouponError(
          `Coupon "${matchedCoupon.code}" requires a minimum order of ${formatINR(requiredMin)}. Current cart total is ${formatINR(subtotal)}.`
        );
        return;
      }

      onApplyCoupon(matchedCoupon.code);
      setCouponInput('');
      setCouponError('');
      setCouponFeedback(`Coupon "${matchedCoupon.code}" applied successfully! (${matchedCoupon.discountPercentage}% OFF)`);
    } else {
      const qualifying = activeRules.filter(
        (c) => subtotal >= (c.minOrderAmount || 0)
      );

      if (qualifying.length === 0) {
        const lowestMin = activeRules.length > 0
          ? Math.min(...activeRules.map((c) => c.minOrderAmount || 0))
          : 1000;
        setCouponError(
          `Minimum order of ${formatINR(lowestMin)} required to apply coupon discount. Current cart is ${formatINR(subtotal)}.`
        );
        return;
      }

      const bestRule = [...qualifying].sort(
        (a, b) => b.discountPercentage - a.discountPercentage || (b.minOrderAmount || 0) - (a.minOrderAmount || 0)
      )[0];

      onApplyCoupon(bestRule.code);
      setCouponInput('');
      setCouponError('');
      setCouponFeedback(
        `Applied highest discount tier: ${bestRule.discountPercentage}% OFF for orders over ${formatINR(bestRule.minOrderAmount || 0)}!`
      );
    }
  };

  return (
    <div id="cart-page-container" className="w-full flex flex-col min-h-screen">
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        
        {/* Semi-Solid Opaque Header Banner */}
        <div className="cart-semi-opaque-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="return-to-storefront-btn"
              onClick={onBackToStorefront}
              className="p-2 sm:p-2.5 rounded-xl cart-semi-opaque-control hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Return to Storefront"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white font-display">
                  {t('yourLiveCart')}
                </h1>
                <span
                  id="cart-count-title"
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                >
                  {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 pl-10 hidden sm:block">
                Review your items, apply discount coupons, and complete your order
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={onBackToStorefront}
              className="px-4 py-2 rounded-xl cart-semi-opaque-control hover:bg-slate-700/80 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add More Items</span>
            </button>
          </div>
        </div>

        {/* Empty Cart State (Semi-Solid Opaque) */}
        {items.length === 0 ? (
          <div
            id="empty-cart-state"
            className="cart-semi-opaque-panel rounded-3xl p-8 sm:p-14 text-center max-w-2xl mx-auto my-8 space-y-4"
          >
            <div className="w-20 h-20 mx-auto rounded-3xl cart-semi-opaque-card flex items-center justify-center text-slate-400 mb-2">
              <ShoppingCart className="w-10 h-10" />
            </div>
            <h2 id="empty-cart-title" className="text-2xl font-bold text-white font-display">
              {t('emptyCartTitle')}
            </h2>
            <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
              {t('emptyCartDesc')}
            </p>
            <div className="pt-4">
              <button
                type="button"
                id="return-to-storefront-empty-btn"
                onClick={onBackToStorefront}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#00873a] hover:bg-[#00a347] text-white font-bold text-sm shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Explore Storefront & Daily Harvest</span>
              </button>
            </div>
          </div>
        ) : (
          /* Main Cart Content: 2-Column Responsive Grid */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Items and Delivery Progress (lg:col-span-8) */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Delivery Goal Progress Card (Semi-Solid Opaque) */}
              <div className="cart-semi-opaque-card rounded-2xl p-4 sm:p-5 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-300">
                    {t('deliveryProgress', { percent: deliveryProgressPct })}
                  </span>
                  <span
                    id="progress-text"
                    className={deliveryDiff <= 0 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}
                  >
                    {deliveryDiff <= 0
                      ? t('freeDeliveryMeterUnlocked')
                      : t('freeDeliveryMeterNeed', { amount: formatINR(deliveryDiff) })}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-800/90 rounded-full overflow-hidden border border-white/5">
                  <div
                    id="cart-delivery-progress"
                    className="h-full bg-gradient-to-r from-[#00873a] to-[#22c55e] rounded-full transition-all duration-500"
                    style={{ width: `${deliveryProgressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Truck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Dedicated runner dispatched in under 7 mins</span>
                  </span>
                  <span className="font-medium text-slate-400">
                    Free on orders over {formatINR(freeDeliveryThreshold)}
                  </span>
                </div>
              </div>

              {/* Cart Items List Container (Semi-Solid Opaque) */}
              <div className="cart-semi-opaque-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-base sm:text-lg font-bold text-white font-display">
                    Selected Produce & Groceries
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div id="cart-items-container" className="space-y-3">
                  {items.map((item) => {
                    const isAtMaxStock = item.quantity >= item.product.stock;

                    return (
                      <div
                        key={item.product.id}
                        id={`cart-item-${item.product.id}`}
                        className="cart-semi-opaque-card rounded-xl sm:rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                      >
                        {/* Product Info Section */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <img
                            src={item.product.image}
                            alt={item.product.title}
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover bg-slate-800/80 shrink-0 border border-white/10"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm sm:text-base font-semibold text-white truncate">
                              {item.product.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-xs text-slate-300 font-medium">
                                {formatINR(item.product.price)} / {item.product.unit}
                              </span>
                              {item.product.badge && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                                  {item.product.badge}
                                </span>
                              )}
                            </div>
                            {isAtMaxStock && (
                              <p className="text-[11px] text-amber-400 font-medium mt-1">
                                Max available stock reached ({item.product.stock} {item.product.unit})
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Quantity Controls & Price Section */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-2 sm:pt-0 border-t border-white/5 sm:border-0">
                          {/* Quantity Controls Stepper (Semi-Solid Opaque) */}
                          <div className="cart-semi-opaque-control flex items-center rounded-xl overflow-hidden shadow-xs">
                            <button
                              type="button"
                              title="Decrease quantity"
                              onClick={() => onUpdateQty(item.product.id, -1)}
                              className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700/80 transition-colors cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center text-xs font-bold text-white tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              title="Increase quantity"
                              disabled={isAtMaxStock}
                              onClick={() => onUpdateQty(item.product.id, 1)}
                              className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Line Item Total */}
                          <div className="text-right min-w-[70px]">
                            <span className="text-sm sm:text-base font-bold text-emerald-400 tabular-nums">
                              {formatINR(item.product.price * item.quantity)}
                            </span>
                          </div>

                          {/* Remove Item Button */}
                          <button
                            type="button"
                            title="Remove item"
                            onClick={() => onRemoveItem(item.product.id)}
                            className="w-8 h-8 rounded-xl hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add More Items Link (Semi-Solid Opaque) */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onBackToStorefront}
                    className="w-full py-3 rounded-xl cart-semi-opaque-card hover:bg-slate-800/90 text-emerald-400 hover:text-emerald-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add More Items From Fresh Produce Catalog</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Coupon & Order Summary Sticky Panel (lg:col-span-4) */}
            <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-28">
              
              {/* Coupon Section (Semi-Solid Opaque) */}
              <div className="cart-semi-opaque-panel rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-3.5">
                <div className="flex items-center gap-2 text-white font-bold text-sm font-display">
                  <Tag className="w-4 h-4 text-emerald-400" />
                  <span>Coupons & Special Discounts</span>
                </div>

                {appliedCoupon && isQualified && activeCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-950/70 border border-emerald-500/40 p-3 rounded-xl text-xs text-emerald-300">
                    <div className="flex items-center gap-2 font-bold">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{activeCoupon.code} ({activeCoupon.discountPercentage}% OFF)</span>
                    </div>
                    <button
                      type="button"
                      id="remove-coupon-btn"
                      onClick={() => {
                        onRemoveCoupon();
                        setCouponFeedback('Coupon removed. Original cart total restored.');
                        setCouponError('');
                        setTimeout(() => setCouponFeedback(''), 3000);
                      }}
                      className="text-xs underline hover:text-red-300 font-bold ml-2 cursor-pointer text-red-400 shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCouponSubmit} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        placeholder="Enter coupon code (e.g. SAVE10)"
                        className="cart-semi-opaque-control flex-1 px-3.5 py-2.5 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <button
                        id="apply-coupon-btn"
                        type="submit"
                        className="px-4 py-2.5 bg-[#00873a] hover:bg-[#00a347] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Apply</span>
                      </button>
                    </div>
                  </form>
                )}

                {couponError && (
                  <div
                    id="cart-coupon-error"
                    className="text-xs text-red-300 bg-red-950/60 p-2.5 rounded-xl border border-red-500/30 font-medium"
                  >
                    {couponError}
                  </div>
                )}
                {couponFeedback && (
                  <div
                    id="cart-coupon-feedback"
                    className="text-xs text-emerald-300 bg-emerald-950/60 p-2.5 rounded-xl border border-emerald-500/30 font-medium"
                  >
                    {couponFeedback}
                  </div>
                )}
              </div>

              {/* Order Financials & Summary (Semi-Solid Opaque) */}
              <div className="cart-semi-opaque-panel rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-4">
                <h3 className="text-base sm:text-lg font-bold text-white font-display border-b border-white/10 pb-3">
                  Order Summary
                </h3>

                <div className="space-y-2.5 text-xs sm:text-sm">
                  {/* Subtotal */}
                  <div className="flex justify-between text-slate-300">
                    <span>{t('subtotal')}</span>
                    <span id="cart-drawer-subtotal" className="font-semibold text-white tabular-nums">
                      {formatINR(subtotal)}
                    </span>
                  </div>

                  {/* Discount */}
                  {discount > 0 && isQualified && activeCoupon && (
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>{t('discountCoupon')} ({activeCoupon.discountPercentage}% OFF)</span>
                      <span id="cart-drawer-discount" className="tabular-nums">
                        -{formatINR(discount)}
                      </span>
                    </div>
                  )}

                  {/* Delivery Charges */}
                  <div className="flex justify-between text-slate-300">
                    <span>{t('deliveryCharges') || 'Delivery Charges'}</span>
                    <span
                      id="cart-drawer-taxes"
                      data-testid="cart-drawer-delivery-charges"
                      className={`tabular-nums ${deliveryChargesAmount > 0 ? 'font-semibold text-white' : 'text-emerald-400 font-semibold'}`}
                    >
                      {items.length === 0 ? '₹0' : (deliveryChargesAmount > 0 ? formatINR(deliveryChargesAmount) : 'FREE')}
                    </span>
                  </div>

                  {/* Total Amount Section */}
                  <div className="flex justify-between items-baseline pt-3 border-t border-white/10">
                    <span className="text-sm sm:text-base font-bold text-white">
                      {t('total')}
                    </span>
                    <span
                      id="cart-drawer-total"
                      className="text-xl sm:text-2xl font-bold text-emerald-400 tabular-nums font-display"
                    >
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* Checkout Button Area (Semi-Solid Opaque) */}
                <div className="pt-2 space-y-3">
                  <button
                    id="proceed-checkout-btn"
                    type="button"
                    disabled={items.length === 0}
                    onClick={onOpenCheckout}
                    className={`w-full py-3.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                      items.length === 0
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                        : 'bg-[#00873a] hover:bg-[#00a347] text-white hover:brightness-105 active:scale-98 cursor-pointer'
                    }`}
                  >
                    <span>{t('proceedToCheckout')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 pt-1">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Encrypted Checkout</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Best Quality Guaranteed</span>
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

      {/* Full Page Footer */}
      <Footer
        onOpenAdmin={onOpenAdmin}
        onSelectCategory={onSelectCategory}
        onOpenLogin={onOpenLogin}
        onOpenDashboard={onOpenDashboard}
      />
    </div>
  );
};
