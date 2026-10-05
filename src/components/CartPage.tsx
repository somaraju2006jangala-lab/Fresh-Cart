import React, { useState, useEffect, useRef } from 'react';
import { CartItem, Coupon, DeliveryChargeRule } from '../types';
import { formatINR } from '../utils/currency';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../services/settingsService';
import { TrustBanner } from './TrustBanner';
import { Footer } from './Footer';
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
  Zap,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface CartPageProps {
  items: CartItem[];
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart?: () => void;
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
  onClearCart,
  onOpenCheckout,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  coupons = [],
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

  // Active and date-valid rules
  const activeRules = coupons.filter(isCouponValidNow);

  // The coupon currently applied - ONLY active if customer explicitly applied it
  const activeCoupon = appliedCoupon
    ? activeRules.find((c) => c.code.toUpperCase() === appliedCoupon.toUpperCase())
    : null;

  // The coupon only applies if the cart subtotal meets its minimum requirement
  const isQualified = Boolean(activeCoupon && subtotal >= (activeCoupon.minOrderAmount || 0));
  const discountPercent = isQualified && activeCoupon ? activeCoupon.discountPercentage : 0;
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

  // Dynamic cart total revalidation when subtotal changes
  const prevSubtotalRef = useRef(subtotal);
  useEffect(() => {
    // Only revalidate if a coupon was actively applied
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

    // Only recalculate when subtotal actually changed
    if (prevSubtotalRef.current !== subtotal) {
      prevSubtotalRef.current = subtotal;

      const qualifyingRules = activeRules.filter(
        (c) => subtotal >= (c.minOrderAmount || 0)
      );

      if (qualifyingRules.length === 0) {
        // Cart no longer qualifies for any active discount tier
        const minReq = activeRules.length > 0
          ? Math.min(...activeRules.map((c) => c.minOrderAmount || 0))
          : 1000;
        onRemoveCoupon();
        setCouponError(
          `Coupon removed: Cart total (${formatINR(subtotal)}) no longer qualifies for the minimum order requirement (${formatINR(minReq)}).`
        );
        setCouponFeedback('');
      } else {
        // Re-select the highest applicable discount tier for the new subtotal
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
      // Customer entered a specific coupon code
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
      // Customer clicked "Apply Coupon" without entering a specific code:
      // Automatically select the highest applicable discount tier
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
    <div className="flex flex-col w-full min-h-[calc(100vh-6rem)]">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto flex-1">
        {/* Navigation & Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/60">
          <div>
            <button
              type="button"
              id="cart-back-btn"
              onClick={onBackToStorefront}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#006b2c] hover:text-[#00873a] transition-colors mb-2 cursor-pointer group"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              <span>{t('backToStorefrontBtn') || 'Back to Storefront'}</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/45 backdrop-blur-md flex items-center justify-center text-[#006b2c] shadow-2xs border border-white/60">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-[26px] sm:text-[32px] font-bold text-[#0b1c30] font-display flex items-center gap-2.5">
                  <span>{t('yourLiveCart') || 'Your Shopping Cart'}</span>
                  <span
                    id="cart-count-title"
                    className="text-[14px] sm:text-[16px] font-semibold px-2.5 py-0.5 rounded-full bg-white/60 backdrop-blur-xs text-[#006b2c] border border-white/70 shadow-2xs"
                  >
                    {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                  </span>
                </h1>
                <p className="text-[13px] text-[#565e74] mt-0.5">
                  Fresh organic produce and daily essentials delivered cold-chain in 30 minutes.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {items.length > 0 && onClearCart && (
              <button
                type="button"
                onClick={onClearCart}
                className="px-3.5 py-2 bg-white/40 hover:bg-red-50/80 text-[#ba1a1a] border border-white/60 hover:border-red-200 text-[12px] font-semibold rounded-xl transition-all duration-200 shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                title={t('clearCart')}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('clearCart')}</span>
              </button>
            )}
            <button
              type="button"
              id="return-to-storefront-top-btn"
              onClick={onBackToStorefront}
              className="px-4 py-2 bg-white/60 hover:bg-white/80 backdrop-blur-md text-[#006b2c] border border-white/70 text-[12px] font-semibold rounded-xl hover:-translate-y-0.5 hover:shadow-xs transition-all duration-200 shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Continue Shopping</span>
            </button>
          </div>
        </div>

        {/* Free Delivery Goal Progress Meter */}
        <div className="bg-white/35 backdrop-blur-md p-4 sm:p-5 rounded-2xl mb-8 border border-white/50 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px] font-medium mb-2">
            <span className="text-[#3e4a3d] font-semibold flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-[#006b2c]" />
              <span>{t('deliveryProgress', { percent: deliveryProgressPct })}</span>
            </span>
            <span
              id="progress-text"
              className={`font-bold ${
                deliveryDiff <= 0 ? 'text-[#006b2c]' : 'text-[#825100]'
              }`}
            >
              {deliveryDiff <= 0
                ? t('freeDeliveryMeterUnlocked')
                : t('freeDeliveryMeterNeed', { amount: formatINR(deliveryDiff) })}
            </span>
          </div>
          <div className="w-full h-2.5 bg-white/50 rounded-full overflow-hidden p-0.5 border border-white/40">
            <div
              id="cart-delivery-progress"
              className="h-full bg-[#006b2c] rounded-full transition-all duration-500 shadow-xs"
              style={{ width: `${deliveryProgressPct}%` }}
            />
          </div>
          <p className="text-[12px] text-[#565e74] flex items-center gap-1.5 pt-2">
            <Zap className="w-3.5 h-3.5 text-[#006b2c]" />
            <span>Dedicated delivery runner dispatched in under 7 mins · Cold-Chain Temperature Controlled</span>
          </p>
        </div>

        {/* Main Content: Empty State OR Items + Summary */}
        {items.length === 0 ? (
          <div
            id="empty-cart-state"
            className="text-center py-16 sm:py-20 bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 p-8 sm:p-12 max-w-xl mx-auto shadow-md my-8"
          >
            <div className="w-20 h-20 rounded-3xl bg-white/60 backdrop-blur-md flex items-center justify-center mx-auto mb-4 text-[#006b2c] shadow-inner border border-white/70">
              <ShoppingCart className="w-10 h-10 text-[#006b2c]/60" />
            </div>
            <h2 id="empty-cart-title" className="text-[22px] sm:text-[24px] font-bold text-[#0b1c30] font-display">
              {t('emptyCartTitle')}
            </h2>
            <p className="text-[14px] text-[#565e74] mt-2 mb-6 max-w-md mx-auto">
              {t('emptyCartDesc')}
            </p>
            <button
              type="button"
              id="return-to-storefront-empty-btn"
              onClick={onBackToStorefront}
              className="px-6 py-3 bg-[#006b2c] text-white text-[13px] font-bold rounded-xl hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer shadow-xs inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('startShopping') || 'Start Shopping'}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
            {/* Left Column: Cart Items List */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-[13px] font-bold uppercase tracking-wider text-[#565e74]">
                  Items in your cart ({totalItemCount})
                </span>
                <span className="text-[12px] text-[#565e74]">
                  Prices include applicable taxes
                </span>
              </div>

              <div
                id="cart-items-container"
                className="flex flex-col gap-3"
              >
                {items.map((item) => {
                  const isAtMaxStock = item.quantity >= item.product.stock;

                  return (
                    <div
                      key={item.product.id}
                      id={`cart-item-${item.product.id}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between bg-white/35 backdrop-blur-md p-4 sm:p-5 rounded-2xl gap-4 border border-white/50 hover:bg-white/50 transition-all duration-200 shadow-2xs hover:shadow-xs group"
                    >
                      {/* Product Thumbnail & Details */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <img
                          src={item.product.image}
                          alt={item.product.title}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover bg-white/20 shrink-0 border border-white/40 shadow-2xs"
                        />
                        <div className="flex-1 min-w-0">
                          {item.product.categoryLabel && (
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#006b2c] block mb-0.5">
                              {item.product.categoryLabel}
                            </span>
                          )}
                          <h3 className="text-[15px] sm:text-[16px] font-bold text-[#0b1c30] truncate group-hover:text-[#006b2c] transition-colors">
                            {item.product.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#565e74] mt-1">
                            <span className="font-semibold text-[#0b1c30]">
                              {formatINR(item.product.price)}
                            </span>
                            <span>/</span>
                            <span>{item.product.unit}</span>
                            {item.product.isOrganic && (
                              <span className="px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                Organic
                              </span>
                            )}
                          </div>
                          {item.product.stock <= 5 && (
                            <span className="text-[11px] text-[#ba1a1a] font-semibold mt-1 block">
                              Only {item.product.stock} left in stock
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantity Controls & Line Price */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/40">
                        {/* Quantity Counter */}
                        <div className="flex items-center bg-white/60 backdrop-blur-xs rounded-xl border border-white/70 shadow-2xs">
                          <button
                            type="button"
                            title="Decrease or remove item"
                            onClick={() => onUpdateQty(item.product.id, -1)}
                            className="w-8 h-8 flex items-center justify-center text-[#0b1c30] hover:bg-white/80 rounded-l-xl transition-colors cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-[13px] font-bold tabular-nums text-[#0b1c30]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            title="Increase quantity"
                            disabled={isAtMaxStock}
                            onClick={() => onUpdateQty(item.product.id, 1)}
                            className="w-8 h-8 flex items-center justify-center text-[#0b1c30] hover:bg-white/80 rounded-r-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Item Total Price */}
                        <div className="text-right min-w-[75px]">
                          <span className="text-[16px] font-bold text-[#0b1c30] tabular-nums block font-display">
                            {formatINR(item.product.price * item.quantity)}
                          </span>
                        </div>

                        {/* Remove Trash Button */}
                        <button
                          type="button"
                          title="Remove item"
                          onClick={() => onRemoveItem(item.product.id)}
                          className="w-8 h-8 rounded-xl hover:bg-[#ffdad6] text-[#6e7b6c] hover:text-[#ba1a1a] transition-all flex items-center justify-center cursor-pointer shadow-2xs border border-white/40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add More Items Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onBackToStorefront}
                  className="w-full py-3 rounded-2xl border border-dashed border-white/70 bg-white/25 backdrop-blur-xs text-[#006b2c] hover:bg-white/45 text-[13px] font-semibold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add more fresh harvest items</span>
                </button>
              </div>
            </div>

            {/* Right Column: Sticky Order Summary & Checkout Card */}
            <div className="lg:col-span-5 xl:col-span-4 sticky top-24">
              <div className="bg-white/45 backdrop-blur-xl rounded-3xl shadow-xl p-6 sm:p-7 border border-white/60 flex flex-col gap-5">
                <div className="border-b border-white/50 pb-3">
                  <h2 className="text-[20px] font-bold text-[#0b1c30] font-display">
                    Order Summary
                  </h2>
                  <p className="text-[12px] text-[#565e74]">
                    Review prices, applied discounts, and delivery charges
                  </p>
                </div>

                {/* Coupon Code Section */}
                <div className="space-y-2">
                  <span className="text-[12px] font-semibold text-[#3e4a3d] block">
                    {t('promoCodeLabel') || 'Coupon & Promo Codes'}
                  </span>

                  {appliedCoupon && isQualified && activeCoupon ? (
                    <div className="flex items-center justify-between bg-[#dcfce7]/90 backdrop-blur-xs p-3 rounded-xl text-[12px] text-[#15803d] border border-[#86efac]/80 shadow-2xs">
                      <div className="flex items-center gap-2 font-bold min-w-0">
                        <Check className="w-4 h-4 text-[#15803d] shrink-0" />
                        <span className="truncate">
                          {activeCoupon.code} ({activeCoupon.discountPercentage}% OFF)
                        </span>
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
                        className="text-[12px] underline hover:text-[#0b1c30] font-bold ml-2 cursor-pointer text-[#dc2626] shrink-0"
                      >
                        {t('removeCoupon') || 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyCouponSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        placeholder={t('couponPlaceholder') || 'Enter code (e.g. SAVE10)'}
                        className="flex-1 px-3.5 py-2 bg-white/60 backdrop-blur-xs border border-white/70 rounded-xl text-[13px] text-[#0b1c30] placeholder-[#94a3b8] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]/40 font-medium uppercase"
                      />
                      <button
                        id="apply-coupon-btn"
                        type="submit"
                        className="px-4 py-2 bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-bold rounded-xl transition-all duration-200 cursor-pointer shadow-xs shrink-0 flex items-center gap-1.5"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>{t('apply') || 'Apply Coupon'}</span>
                      </button>
                    </form>
                  )}

                  {couponError && (
                    <div
                      id="cart-coupon-error"
                      className="text-[12px] text-[#ba1a1a] bg-[#fee2e2]/80 backdrop-blur-xs p-2.5 rounded-xl border border-[#fecaca] font-semibold text-center"
                    >
                      {couponError}
                    </div>
                  )}

                  {couponFeedback && (
                    <div
                      id="cart-coupon-feedback"
                      className="text-[12px] text-[#15803d] bg-[#dcfce7]/90 backdrop-blur-xs p-2.5 rounded-xl border border-[#bbf7d0] font-semibold text-center"
                    >
                      {couponFeedback}
                    </div>
                  )}
                </div>

                {/* Pricing Financials Breakdown */}
                <div className="pt-3 border-t border-white/50 space-y-2 text-[14px]">
                  <div className="flex justify-between text-[#565e74]">
                    <span>{t('subtotal')}</span>
                    <span id="cart-drawer-subtotal" className="font-semibold text-[#0b1c30] tabular-nums">
                      {formatINR(subtotal)}
                    </span>
                  </div>

                  {discount > 0 && isQualified && activeCoupon && (
                    <div className="flex justify-between text-[#006b2c] font-semibold">
                      <span>{t('discountCoupon')} ({activeCoupon.discountPercentage}% OFF)</span>
                      <span id="cart-drawer-discount" className="tabular-nums font-bold">
                        -{formatINR(discount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-[#565e74]">
                    <span>{t('deliveryCharges') || 'Delivery Charges'}</span>
                    <span
                      id="cart-drawer-taxes"
                      data-testid="cart-drawer-delivery-charges"
                      className={`tabular-nums ${deliveryChargesAmount > 0 ? 'font-semibold text-[#0b1c30]' : 'text-[#006b2c] font-bold'}`}
                    >
                      {items.length === 0 ? '₹0' : (deliveryChargesAmount > 0 ? formatINR(deliveryChargesAmount) : 'FREE')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[18px] sm:text-[20px] font-bold text-[#0b1c30] pt-3 border-t border-white/50">
                    <span className="font-display">{t('total')}</span>
                    <span id="cart-drawer-total" className="text-[#006b2c] tabular-nums font-display text-[24px]">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* Checkout CTA Button */}
                <button
                  id="proceed-checkout-btn"
                  type="button"
                  disabled={items.length === 0}
                  onClick={onOpenCheckout}
                  className={`w-full py-3.5 rounded-xl text-[14px] font-bold shadow-md transition-all duration-200 flex items-center justify-center gap-2 ${
                    items.length === 0
                      ? 'bg-[#cbd5e1] text-[#64748b] cursor-not-allowed'
                      : 'bg-[#006b2c] text-white hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 active:translate-y-0 active:scale-98 cursor-pointer'
                  }`}
                >
                  <span>{t('proceedToCheckout')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* Trust Badges */}
                <div className="pt-2 border-t border-white/40 flex items-center justify-center gap-4 text-[11px] text-[#565e74]">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#006b2c]" />
                    <span>Secure Checkout</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#006b2c]" />
                    <span>Cold-Chain Handover</span>
                  </span>
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
