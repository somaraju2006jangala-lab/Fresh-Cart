import React, { useState, useEffect } from 'react';
import { CartItem, CustomerOrder, Coupon, DeliveryChargeRule } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/currency';
import { useLanguage } from '../context/LanguageContext';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../services/settingsService';
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
} from 'lucide-react';
import { generateOrderOtp } from '../services/otpClientService';

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
  const [paymentMethod, setPaymentMethod] = useState<'cash'>('cash');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutCouponInput, setCheckoutCouponInput] = useState('');
  const [checkoutCouponError, setCheckoutCouponError] = useState('');

  useEffect(() => {
    if (currentUser?.address) {
      setAddress(currentUser.address);
    }
  }, [currentUser]);

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
    setTimeout(() => {
      setIsSubmitting(false);
      const orderNum = Math.floor(1000 + Math.random() * 9000);
      const generatedOrder = `#FC-${orderNum}`;
      setOrderNumber(String(orderNum));

      const customerPhone = currentUser?.phone || '9876541234';

      // Save order to customer account history
      const newCustomerOrder: CustomerOrder = {
        id: generatedOrder,
        customerId: currentUser?.id || 'guest_user',
        customerName: currentUser?.name || 'Guest Customer',
        customerEmail: currentUser?.email,
        customerPhone,
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
      };
      addOrder(newCustomerOrder);

      // Trigger backend OTP generation & isolated SMS provider dispatch
      generateOrderOtp(
        generatedOrder,
        newCustomerOrder.customerId || 'guest_user',
        customerPhone
      );

      onOrderPlaced?.(items, newCustomerOrder);
      setStep('success');
      onClearCart();
    }, 800);
  };

  const handleDone = () => {
    setStep('details');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-md">
      <div className="bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-white/80 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#e5eeff]/80 bg-white/50 backdrop-blur-md">
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
            className="w-8 h-8 rounded-lg text-[#565e74] hover:bg-[#e5eeff] hover:text-[#0b1c30] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        {step === 'details' ? (
          <form onSubmit={handlePlaceOrder} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Speed delivery banner */}
            <div className="bg-[#eff4ff] border border-[#d3e4fe] p-3 rounded-xl flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 text-[#006b2c] font-semibold">
                <Clock className="w-4 h-4 text-[#006b2c]" />
                <span>{t('estimatedArrival')}: {t('minsArrival')}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#7ffc97] text-[#002109] text-[10px] font-bold">
                Store #104
              </span>
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
                className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-[#f8f9ff] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
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
                className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-[#f8f9ff] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                placeholder={t('fulfillmentNotesPlaceholder')}
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-[#006b2c]" />
                {t('paymentMethod')}
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'border-[#006b2c] bg-[#eff4ff] text-[#006b2c] ring-2 ring-[#006b2c]/20'
                      : 'border-[#e2e8f0] bg-white text-[#565e74] hover:bg-[#f8f9ff]'
                  }`}
                >
                  {t('payCod')}
                </button>
              </div>
            </div>

            {/* Order Items Review */}
            <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0] space-y-1.5">
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
              <div className="pt-2 border-t border-[#e2e8f0]">
                {appliedCoupon && activeCoupon ? (
                  <div className="flex items-center justify-between bg-[#dcfce7] p-2 rounded-lg text-[12px] text-[#15803d]">
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
                        className="flex-1 px-2.5 py-1 text-[12px] uppercase font-mono bg-white border border-[#cbd5e1] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#006b2c]"
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
              <div className="pt-2 border-t border-[#e2e8f0] space-y-1 text-[12px]">
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
                <div className="flex justify-between font-bold text-[14px] text-[#0b1c30] pt-1 border-t border-[#e2e8f0]">
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
          <div className="p-6 text-center space-y-4">
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
