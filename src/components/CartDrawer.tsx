import React, { useState, useEffect } from 'react';
import { CartItem, Coupon } from '../types';
import { formatINR } from '../utils/currency';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ChevronRight,
  ShoppingBag,
  Truck,
  ArrowRight,
  Sparkles,
  Tag,
  X,
  Check,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface CartDrawerProps {
  items: CartItem[];
  isOpen: boolean;
  onToggle: () => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onOpenCheckout: () => void;
  appliedCoupon: string | null;
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  coupons?: Coupon[];
  taxAndPackingPercentage?: number;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  items,
  isOpen,
  onToggle,
  onUpdateQty,
  onRemoveItem,
  onOpenCheckout,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  coupons = [],
  taxAndPackingPercentage = 0,
}) => {
  const { t } = useLanguage();
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponFeedback, setCouponFeedback] = useState('');

  const freeDeliveryThreshold = 499.0;
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

  // Admin-controlled Estimated Taxes & Packing
  // Formula: Cart Subtotal × Tax & Packing Percentage ÷ 100
  const taxAndPackingAmount = items.length > 0 && subtotal > 0
    ? Math.round(((subtotal * taxAndPackingPercentage) / 100) * 100) / 100
    : 0;

  const total = Math.max(0, Math.round((subtotal - discount + taxAndPackingAmount) * 100) / 100);

  // Dynamic cart total revalidation when subtotal changes
  const prevSubtotalRef = React.useRef(subtotal);
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

  const deliveryDiff = freeDeliveryThreshold - subtotal;
  const deliveryProgressPct = Math.min(
    100,
    Math.round((subtotal / freeDeliveryThreshold) * 100)
  );

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
    <>
      {/* Floating Cart Drawer Toggle Button (Bottom-Right) */}
      {!isOpen && (
        <div id="cart-drawer-toggle" className="fixed bottom-6 right-6 z-40">
          <button
            type="button"
            onClick={onToggle}
            aria-label={t('cart')}
            title={t('cart')}
            className="relative flex items-center justify-center bg-[#213145] text-[#7ffc97] p-3.5 rounded-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-[#565e74]/30"
          >
            <ShoppingCart className="w-6 h-6" />
            {totalItemCount > 0 && (
              <span
                id="floating-cart-badge"
                className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-[#006b2c] text-white rounded-full text-[11px] font-bold ring-2 ring-[#213145]"
              >
                {totalItemCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Expanded Cart Drawer Panel */}
      {isOpen && (
        <div
          id="cart-drawer-panel"
          className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] max-w-md bg-white rounded-2xl shadow-2xl p-5 sm:p-6 border border-[#e2e8f0] flex flex-col transition-all max-h-[88vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#e5eeff]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#006b2c]">
                <ShoppingBag className="w-4 h-4 text-[#006b2c]" />
              </div>
              <h3 className="text-[18px] font-bold text-[#0b1c30] font-display">
                {t('yourLiveCart')} (
                <span id="cart-count-title">{totalItemCount}</span>)
              </h3>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="w-8 h-8 rounded-lg bg-[#eff4ff] hover:bg-[#e5eeff] flex items-center justify-center text-[#565e74] hover:text-[#0b1c30] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Delivery Goal Progress */}
          <div className="bg-[#eff4ff] p-3 rounded-xl my-3 space-y-1.5 border border-[#e2e8f0]/60">
            <div className="flex items-center justify-between text-[11px] font-medium">
              <span className="text-[#3e4a3d]">
                {t('deliveryProgress', { percent: deliveryProgressPct })}
              </span>
              <span
                id="progress-text"
                className={`font-semibold ${
                  deliveryDiff <= 0 ? 'text-[#006b2c]' : 'text-[#825100]'
                }`}
              >
                {deliveryDiff <= 0
                  ? t('freeDeliveryMeterUnlocked')
                  : t('freeDeliveryMeterNeed', { amount: formatINR(deliveryDiff) })}
              </span>
            </div>
            <div className="w-full h-2 bg-[#e5eeff] rounded-full overflow-hidden">
              <div
                id="cart-delivery-progress"
                className="h-full bg-[#006b2c] rounded-full transition-all duration-500"
                style={{ width: `${deliveryProgressPct}%` }}
              />
            </div>
            <p className="text-[11px] text-[#565e74] flex items-center gap-1.5 pt-0.5">
              <Truck className="w-3.5 h-3.5 text-[#006b2c]" />
              <span>Dedicated runner dispatched in under 7 mins</span>
            </p>
          </div>

          {/* Items Container */}
          <div
            id="cart-items-container"
            className="space-y-2.5 overflow-y-auto my-2 pr-1 flex-1 max-h-56"
          >
            {items.length === 0 ? (
              <div id="empty-cart-state" className="text-center py-8 text-[#565e74]">
                <ShoppingCart className="w-10 h-10 mx-auto text-[#bdcaba] mb-2" />
                <h4 id="empty-cart-title" className="text-[16px] font-bold text-[#0b1c30]">
                  {t('emptyCartTitle')}
                </h4>
                <p className="text-[12px] text-[#565e74] mt-0.5">
                  {t('emptyCartDesc')}
                </p>
              </div>
            ) : (
              items.map((item) => {
                const isAtMaxStock = item.quantity >= item.product.stock;

                return (
                  <div
                    key={item.product.id}
                    id={`cart-item-${item.product.id}`}
                    className="flex items-center justify-between bg-[#eff4ff]/60 p-2.5 rounded-xl gap-2 border border-[#e2e8f0]/40 hover:bg-[#eff4ff] transition-colors"
                  >
                    <img
                      src={item.product.image}
                      alt={item.product.title}
                      className="w-11 h-11 rounded-lg object-cover bg-white shrink-0 border border-[#e2e8f0]"
                    />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="text-[13px] font-semibold text-[#0b1c30] truncate">
                        {item.product.title}
                      </span>
                      <span className="text-[11px] text-[#565e74]">
                        {item.quantity} × {formatINR(item.product.price)} / {item.product.unit}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-white rounded-lg border border-[#e2e8f0] shadow-2xs">
                        <button
                          type="button"
                          title="Decrease or remove item"
                          onClick={() => onUpdateQty(item.product.id, -1)}
                          className="w-6 h-6 flex items-center justify-center text-[#0b1c30] hover:bg-[#eff4ff] rounded-l-lg transition-colors cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-[11px] font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          title="Increase quantity"
                          disabled={isAtMaxStock}
                          onClick={() => onUpdateQty(item.product.id, 1)}
                          className="w-6 h-6 flex items-center justify-center text-[#0b1c30] hover:bg-[#eff4ff] rounded-r-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="text-[13px] font-bold text-[#0b1c30] min-w-[50px] text-right tabular-nums">
                        {formatINR(item.product.price * item.quantity)}
                      </span>

                      <button
                        type="button"
                        title="Remove item"
                        onClick={() => onRemoveItem(item.product.id)}
                        className="w-7 h-7 rounded-lg hover:bg-[#ffdad6] text-[#6e7b6c] hover:text-[#ba1a1a] transition-colors flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add More Items Link */}
          {items.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onToggle}
                className="w-full py-1.5 rounded-lg border border-[#006b2c] text-[#006b2c] hover:bg-[#eff4ff] text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add more items</span>
              </button>
            </div>
          )}

          {/* Coupon Code Section */}
          <div className="my-2 pt-2 border-t border-[#e5eeff] space-y-1.5">
            {appliedCoupon && isQualified && activeCoupon ? (
              <div className="flex items-center justify-between bg-[#dcfce7] p-2.5 rounded-xl text-[12px] text-[#15803d] border border-[#86efac] shadow-2xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <Check className="w-4 h-4 text-[#15803d] shrink-0" />
                  <span>{activeCoupon.code} ({activeCoupon.discountPercentage}% OFF Applied)</span>
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
                  Remove Coupon
                </button>
              </div>
            ) : (
              <div className="flex justify-center">
                <button
                  id="apply-coupon-btn"
                  type="button"
                  onClick={() => handleApplyCouponSubmit()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-bold rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Apply Coupon</span>
                </button>
              </div>
            )}
            {couponError && (
              <div id="cart-coupon-error" className="text-[11px] text-[#ba1a1a] bg-[#fee2e2]/60 p-2 rounded-lg border border-[#fecaca] font-semibold text-center">
                {couponError}
              </div>
            )}
            {couponFeedback && (
              <div id="cart-coupon-feedback" className="text-[11px] text-[#15803d] bg-[#dcfce7]/70 p-2 rounded-lg border border-[#bbf7d0] font-semibold text-center">
                {couponFeedback}
              </div>
            )}
          </div>

          {/* Order Financials */}
          <div className="pt-2 border-t border-[#e5eeff] space-y-1 text-[13px]">
            <div className="flex justify-between text-[#565e74]">
              <span>{t('subtotal')}</span>
              <span id="cart-drawer-subtotal" className="font-semibold text-[#0b1c30] tabular-nums">
                {formatINR(subtotal)}
              </span>
            </div>

            {discount > 0 && isQualified && activeCoupon && (
              <div className="flex justify-between text-[#006b2c] font-semibold">
                <span>{t('discountCoupon')} ({activeCoupon.discountPercentage}% OFF)</span>
                <span id="cart-drawer-discount" className="tabular-nums">-{formatINR(discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-[#565e74]">
              <span>{t('estimatedTaxes')}</span>
              <span id="cart-drawer-taxes" className={`tabular-nums ${taxAndPackingAmount > 0 ? 'font-semibold text-[#0b1c30]' : 'text-[#006b2c] font-medium'}`}>
                {taxAndPackingAmount > 0 ? formatINR(taxAndPackingAmount) : t('free')}
              </span>
            </div>

            <div className="flex justify-between text-[15px] font-bold text-[#0b1c30] pt-1 border-t border-[#e5eeff]">
              <span>{t('total')}</span>
              <span id="cart-drawer-total" className="text-[#006b2c] tabular-nums font-display">
                {formatINR(total)}
              </span>
            </div>
          </div>

          {/* Checkout CTA */}
          <button
            id="proceed-checkout-btn"
            type="button"
            disabled={items.length === 0}
            onClick={onOpenCheckout}
            className={`w-full mt-3 py-2.5 rounded-xl text-[13px] font-semibold shadow-md transition-all flex items-center justify-center gap-2 ${
              items.length === 0
                ? 'bg-[#cbd5e1] text-[#64748b] cursor-not-allowed'
                : 'bg-[#006b2c] text-white hover:bg-[#00873a] active:scale-98 cursor-pointer'
            }`}
          >
            <span>{t('proceedToCheckout')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
