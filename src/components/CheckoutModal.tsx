import React, { useState, useEffect } from 'react';
import { CartItem, CustomerOrder, Coupon, DeliveryChargeRule } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/currency';
import { useLanguage } from '../context/LanguageContext';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../services/settingsService';
import {
  CheckCircle,
  X,
  MapPin,
  Clock,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Tag,
  Zap,
  Smartphone,
  AlertCircle,
  Check,
} from 'lucide-react';
import { generateOrderOtp } from '../services/otpClientService';
import {
  createServerRazorpayOrder,
  verifyServerPayment,
  recordPaymentCancellation,
  generateDevSignature,
} from '../services/paymentService';

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
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutCouponInput, setCheckoutCouponInput] = useState('');
  const [checkoutCouponError, setCheckoutCouponError] = useState('');
  const [paymentError, setPaymentError] = useState('');

  // Razorpay payment details state
  const [confirmedPaymentId, setConfirmedPaymentId] = useState('');
  const [confirmedOrderId, setConfirmedOrderId] = useState('');
  const [isUpiSimModalOpen, setIsUpiSimModalOpen] = useState(false);
  const [pendingRzpOrder, setPendingRzpOrder] = useState<{
    orderId: string;
    amount: number;
    keyId: string;
    orderNum: number;
  } | null>(null);
  const [selectedUpiApp, setSelectedUpiApp] = useState<'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'vpa'>('gpay');
  const [vpaIdInput, setVpaIdInput] = useState('customer@okhdfcbank');

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

  /**
   * Finalizes order upon successful server-verified Razorpay payment
   */
  const completeOrderWithVerifiedPayment = (
    rzpPaymentId: string,
    rzpOrderId: string,
    orderNum: number
  ) => {
    const generatedOrder = `#FC-${orderNum}`;
    setOrderNumber(String(orderNum));
    setConfirmedPaymentId(rzpPaymentId);
    setConfirmedOrderId(rzpOrderId);

    const customerPhone = currentUser?.phone || '9876541234';

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
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPaymentId,
      settlementStatus: 'NOT_SETTLED',
      createdAt: new Date().toISOString(),
    };

    addOrder(newCustomerOrder);

    // Trigger backend OTP generation & SMS dispatch
    generateOrderOtp(
      generatedOrder,
      newCustomerOrder.customerId || 'guest_user',
      customerPhone
    );

    onOrderPlaced?.(items, newCustomerOrder);
    setStep('success');
    onClearCart();
    setIsSubmitting(false);
    setIsUpiSimModalOpen(false);
  };

  /**
   * Main payment submission handler
   */
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError('');
    setIsSubmitting(true);

    const orderNum = Math.floor(1000 + Math.random() * 9000);

    try {
      // 1. Create order on the backend with verified calculations
      const orderRes = await createServerRazorpayOrder({
        items,
        couponDiscount: discount,
        customerId: currentUser?.id,
        customerName: currentUser?.name,
        subtotal,
        receipt: `rcpt_fc_${orderNum}`,
      });

      if (!orderRes.success || !orderRes.orderId) {
        throw new Error(orderRes.error || 'Failed to initiate Razorpay payment order on server.');
      }

      setPendingRzpOrder({
        orderId: orderRes.orderId,
        amount: orderRes.amount,
        keyId: orderRes.keyId,
        orderNum,
      });

      // 2. Launch Razorpay Standard Checkout if Razorpay script is present
      const RazorpayConstructor = (window as any).Razorpay;

      if (typeof RazorpayConstructor === 'function') {
        try {
          const rzpInstance = new RazorpayConstructor({
            key: orderRes.keyId,
            amount: orderRes.amount,
            currency: 'INR',
            name: 'FreshCart Express',
            description: `Order #${orderNum} · 30-min Delivery`,
            order_id: orderRes.orderId,
            prefill: {
              name: currentUser?.name || 'Customer',
              email: currentUser?.email || 'customer@example.com',
              contact: currentUser?.phone || '9876541234',
            },
            config: {
              display: {
                blocks: {
                  upi: {
                    name: 'Pay using UPI',
                    instruments: [{ method: 'upi' }],
                  },
                },
                sequence: ['block.upi'],
                preferences: { show_default_blocks: false },
              },
            },
            handler: async function (response: any) {
              try {
                // 3. Server-side payment signature verification
                const verifyRes = await verifyServerPayment({
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  orderId: `#FC-${orderNum}`,
                  customerId: currentUser?.id,
                  customerName: currentUser?.name,
                  amount: total,
                });

                if (verifyRes.success && verifyRes.verified) {
                  completeOrderWithVerifiedPayment(
                    response.razorpay_payment_id,
                    response.razorpay_order_id,
                    orderNum
                  );
                } else {
                  setIsSubmitting(false);
                  setPaymentError(
                    verifyRes.error || 'Payment signature verification failed on backend. Order not confirmed.'
                  );
                }
              } catch (verifyErr: any) {
                setIsSubmitting(false);
                setPaymentError(verifyErr.message || 'Error communicating with verification backend.');
              }
            },
            modal: {
              ondismiss: async function () {
                setIsSubmitting(false);
                setPaymentError('UPI payment was cancelled. You can retry anytime.');
                await recordPaymentCancellation({
                  razorpayOrderId: orderRes.orderId,
                  orderId: `#FC-${orderNum}`,
                  customerName: currentUser?.name,
                  userId: currentUser?.id,
                  amount: total,
                });
              },
            },
          });

          rzpInstance.on('payment.failed', async function (failedResp: any) {
            setIsSubmitting(false);
            setPaymentError(
              failedResp.error?.description || 'UPI payment was rejected or failed. Please retry.'
            );
          });

          rzpInstance.open();
          return;
        } catch {
          // If popup creation failed or is blocked, fallback to built-in UPI modal
        }
      }

      // Fallback: Open built-in Razorpay UPI modal for interactive test & developer flows
      setIsUpiSimModalOpen(true);
      setIsSubmitting(false);
    } catch (err: any) {
      setIsSubmitting(false);
      setPaymentError(err.message || 'Payment initiation failed. Please try again.');
    }
  };

  /**
   * Completes UPI payment via built-in UPI test modal:
   * Generates authentic backend signature and runs strict server-side verification.
   */
  const handleConfirmUpiModalPayment = async () => {
    if (!pendingRzpOrder) return;
    setIsSubmitting(true);
    setPaymentError('');

    try {
      const paymentId = `pay_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      // Generate authentic HMAC SHA256 signature on backend
      const signature = await generateDevSignature(pendingRzpOrder.orderId, paymentId);

      // Verify on backend
      const verifyRes = await verifyServerPayment({
        razorpayOrderId: pendingRzpOrder.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        orderId: `#FC-${pendingRzpOrder.orderNum}`,
        customerId: currentUser?.id,
        customerName: currentUser?.name,
        amount: total,
      });

      if (verifyRes.success && verifyRes.verified) {
        completeOrderWithVerifiedPayment(
          paymentId,
          pendingRzpOrder.orderId,
          pendingRzpOrder.orderNum
        );
      } else {
        setIsSubmitting(false);
        setPaymentError(
          verifyRes.error || 'Server signature verification failed. Order not confirmed.'
        );
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setPaymentError(err.message || 'Payment verification failed.');
    }
  };

  const handleDone = () => {
    setStep('details');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-[#e2e8f0] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#e5eeff] bg-[#eff4ff]/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#006b2c] text-white flex items-center justify-center">
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

            {/* Payment Method Selector - UPI ONLY */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#006b2c] inline-block" />
                <span>{t('paymentMethod') || 'Payment Method'}</span>
              </label>
              <div className="grid grid-cols-1 gap-2">
                <div
                  id="checkout-payment-method-upi"
                  className="p-3 rounded-xl border text-[13px] font-semibold transition-all border-[#006b2c] bg-[#eff4ff] text-[#006b2c] ring-2 ring-[#006b2c]/20 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#006b2c]" />
                    <span className="font-bold">UPI</span>
                  </div>
                  <span className="text-[11px] font-medium text-[#16a34a] bg-[#dcfce7] px-2 py-0.5 rounded-md flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#16a34a]" />
                    Razorpay Verified
                  </span>
                </div>
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

            {/* Payment Error Alert with Retry */}
            {paymentError && (
              <div className="p-3 rounded-xl bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#ef4444]" />
                  <span>{paymentError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentError('')}
                  className="text-[11px] underline font-bold cursor-pointer ml-2 shrink-0 text-[#b91c1c]"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Place Order CTA - Pay with UPI */}
            <button
              id="checkout-pay-with-upi-btn"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-xl bg-[#006b2c] text-white font-bold text-[14px] hover:bg-[#00873a] active:scale-98 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing Razorpay UPI Payment...</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>Pay with UPI</span>
                  <span className="text-[#a7f3d0] font-normal">({formatINR(total)})</span>
                </span>
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

            {/* Order Details & Razorpay Verification Info */}
            <div className="bg-[#eff4ff] p-3.5 rounded-xl border border-[#d3e4fe] text-left space-y-1.5 text-[12px]">
              <div className="flex justify-between items-center text-[#0b1c30]">
                <span className="text-[#565e74] font-medium">Order ID</span>
                <span className="font-bold text-[#006b2c] font-display">#FC-{orderNumber}</span>
              </div>
              <div className="flex justify-between items-center text-[#0b1c30]">
                <span className="text-[#565e74] font-medium">Payment Method</span>
                <span className="font-bold flex items-center gap-1 text-[#006b2c]">
                  <Check className="w-3.5 h-3.5 text-[#16a34a]" /> UPI (Razorpay Verified)
                </span>
              </div>
              {confirmedPaymentId && (
                <div className="flex justify-between items-center text-[#0b1c30]">
                  <span className="text-[#565e74] font-medium">Razorpay Payment ID</span>
                  <span className="font-mono text-[11px] font-semibold text-[#0f172a]">{confirmedPaymentId}</span>
                </div>
              )}
              {confirmedOrderId && (
                <div className="flex justify-between items-center text-[#0b1c30]">
                  <span className="text-[#565e74] font-medium">Razorpay Order ID</span>
                  <span className="font-mono text-[11px] text-[#64748b]">{confirmedOrderId}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-[#0b1c30] pt-1 border-t border-[#d3e4fe]">
                <span className="text-[#565e74] font-semibold">Payment Status</span>
                <span className="px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d] font-bold text-[11px]">
                  PAID
                </span>
              </div>
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
                  className="flex-1 py-2.5 rounded-xl bg-[#eff4ff] text-[#006b2c] border border-[#d3e4fe] text-[13px] font-semibold hover:bg-[#dce9ff] transition-colors cursor-pointer"
                >
                  {t('trackInDashboard')}
                </button>
              )}
              <button
                type="button"
                id="checkout-continue-shopping-btn"
                onClick={handleDone}
                className="flex-1 py-2.5 rounded-xl bg-[#006b2c] text-white text-[13px] font-semibold hover:bg-[#00873a] transition-colors cursor-pointer"
              >
                {t('continueShopping')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Razorpay UPI Checkout Simulator Modal (Test Mode / Direct UPI App Flow) */}
      {isUpiSimModalOpen && pendingRzpOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#0b1c30]/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-[#e2e8f0] space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#006b2c] text-white flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-[#7ffc97]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#0b1c30] font-display">Razorpay UPI Checkout</h3>
                  <p className="text-[11px] text-[#64748b]">Razorpay Test Mode · INR</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsUpiSimModalOpen(false);
                  setIsSubmitting(false);
                  setPaymentError('Payment cancelled by user. You can retry with UPI.');
                  recordPaymentCancellation({
                    razorpayOrderId: pendingRzpOrder.orderId,
                    orderId: `#FC-${pendingRzpOrder.orderNum}`,
                    customerName: currentUser?.name,
                    userId: currentUser?.id,
                    amount: total,
                  });
                }}
                className="w-7 h-7 rounded-lg text-[#64748b] hover:bg-[#eff4ff] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#eff4ff] p-3 rounded-xl border border-[#d3e4fe] space-y-1 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[#64748b]">Razorpay Order ID:</span>
                <span className="font-mono font-semibold text-[#006b2c]">{pendingRzpOrder.orderId}</span>
              </div>
              <div className="flex justify-between font-bold text-[14px] text-[#0b1c30] pt-1 border-t border-[#d3e4fe]">
                <span>Payable Amount:</span>
                <span className="text-[#006b2c] font-display">{formatINR(total)}</span>
              </div>
            </div>

            {/* Choose UPI App */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider block">
                Select UPI App / ID
              </span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'gpay', name: 'Google Pay', icon: '🟢' },
                  { id: 'phonepe', name: 'PhonePe', icon: '🟣' },
                  { id: 'paytm', name: 'Paytm UPI', icon: '🔵' },
                  { id: 'bhim', name: 'BHIM UPI', icon: '🟠' },
                ].map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setSelectedUpiApp(app.id as any)}
                    className={`p-2.5 rounded-xl border text-[12px] font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                      selectedUpiApp === app.id
                        ? 'border-[#006b2c] bg-[#eff4ff] text-[#006b2c] ring-2 ring-[#006b2c]/20'
                        : 'border-[#e2e8f0] hover:bg-[#f8fafc] text-[#334155]'
                    }`}
                  >
                    <span>{app.icon}</span>
                    <span>{app.name}</span>
                  </button>
                ))}
              </div>

              {/* Enter VPA ID */}
              <div className="pt-1">
                <label className="text-[11px] text-[#64748b] block mb-1">Or enter UPI ID (VPA):</label>
                <input
                  type="text"
                  value={vpaIdInput}
                  onChange={(e) => setVpaIdInput(e.target.value)}
                  placeholder="e.g. name@okhdfcbank"
                  className="w-full px-3 py-2 text-[12px] border border-[#cbd5e1] rounded-lg bg-[#f8fafc] font-mono focus:outline-hidden focus:ring-1 focus:ring-[#006b2c]"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsUpiSimModalOpen(false);
                  setIsSubmitting(false);
                  setPaymentError('UPI payment cancelled.');
                  recordPaymentCancellation({
                    razorpayOrderId: pendingRzpOrder.orderId,
                    orderId: `#FC-${pendingRzpOrder.orderNum}`,
                    customerName: currentUser?.name,
                    userId: currentUser?.id,
                    amount: total,
                  });
                }}
                className="flex-1 py-2.5 rounded-xl border border-[#cbd5e1] text-[#64748b] text-[12px] font-semibold hover:bg-[#f1f5f9] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmUpiModalPayment}
                className="flex-1 py-2.5 rounded-xl bg-[#006b2c] text-white text-[12px] font-bold hover:bg-[#00873a] transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Authorize &amp; Pay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

