import React, { useState } from 'react';
import { CartItem } from '../types';
import {
  X,
  CheckCircle,
  Clock,
  MapPin,
  CreditCard,
  Truck,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  appliedCoupon: string | null;
  onClearCart: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  appliedCoupon,
  onClearCart,
}) => {
  const [step, setStep] = useState<'details' | 'success'>('details');
  const [address, setAddress] = useState('742 Evergreen Terrace, Apt 4B');
  const [deliveryNote, setDeliveryNote] = useState('Leave with doorman in thermal tote');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple_pay' | 'cash'>('apple_pay');
  const [orderNumber, setOrderNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const discount = appliedCoupon === 'FRESH30' ? subtotal * 0.3 : 0;
  const total = Math.max(0, subtotal - discount);

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      const generatedOrder = `FC-${Math.floor(100000 + Math.random() * 900000)}`;
      setOrderNumber(generatedOrder);
      setStep('success');
      onClearCart();
    }, 800);
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
                {step === 'details' ? 'Express 30-Min Checkout' : 'Order Dispatched!'}
              </h2>
              <p className="text-[11px] text-[#565e74]">
                {step === 'details'
                  ? 'Store #104 Cold-Chain Fulfillment Hub'
                  : `Order ID: #${orderNumber}`}
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
                <span>Estimated Arrival: 24–30 Mins</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#7ffc97] text-[#002109] text-[10px] font-bold">
                Direct Runner
              </span>
            </div>

            {/* Delivery Destination */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#006b2c]" />
                Delivery Address
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-[#f8f9ff] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                placeholder="Apartment, building, street..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30]">
                Fulfillment Instructions (Optional)
              </label>
              <input
                type="text"
                value={deliveryNote}
                onChange={(e) => setDeliveryNote(e.target.value)}
                className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-[#f8f9ff] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                placeholder="e.g. Ring bell, leave in insulated cooler..."
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#006b2c]" />
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('apple_pay')}
                  className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                    paymentMethod === 'apple_pay'
                      ? 'border-[#006b2c] bg-[#eff4ff] text-[#006b2c] ring-2 ring-[#006b2c]/20'
                      : 'border-[#e2e8f0] bg-white text-[#565e74] hover:bg-[#f8f9ff]'
                  }`}
                >
                  ⚡ Express Pay
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                    paymentMethod === 'card'
                      ? 'border-[#006b2c] bg-[#eff4ff] text-[#006b2c] ring-2 ring-[#006b2c]/20'
                      : 'border-[#e2e8f0] bg-white text-[#565e74] hover:bg-[#f8f9ff]'
                  }`}
                >
                  Credit Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-2.5 rounded-xl border text-center text-[12px] font-semibold transition-all cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'border-[#006b2c] bg-[#eff4ff] text-[#006b2c] ring-2 ring-[#006b2c]/20'
                      : 'border-[#e2e8f0] bg-white text-[#565e74] hover:bg-[#f8f9ff]'
                  }`}
                >
                  Pay on Delivery
                </button>
              </div>
            </div>

            {/* Order Items Review */}
            <div className="bg-[#f8fafc] p-3 rounded-xl border border-[#e2e8f0] space-y-1.5">
              <span className="text-[11px] font-bold uppercase text-[#565e74] tracking-wider">
                Order Items ({items.length})
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-[12px]">
                {items.map((it) => (
                  <div key={it.product.id} className="flex justify-between text-[#0b1c30]">
                    <span className="truncate max-w-[240px]">
                      {it.quantity}x {it.product.title}
                    </span>
                    <span className="font-semibold tabular-nums">
                      ${(it.product.price * it.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-[#e2e8f0] flex justify-between font-bold text-[14px]">
                <span>Total Amount Due</span>
                <span className="text-[#006b2c] font-display tabular-nums">
                  ${total.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Place Order CTA */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-[#006b2c] text-white font-semibold text-[14px] hover:bg-[#00873a] active:scale-98 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <span>Locking Inventory with Pod #104...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-[#7ffc97]" />
                  <span>Place Order · ${total.toFixed(2)}</span>
                </>
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
                Order Successfully Placed!
              </h3>
              <p className="text-[13px] text-[#565e74] mt-1">
                Your order is being picked at cold-chain Pod #104.
              </p>
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

            <button
              type="button"
              onClick={handleDone}
              className="w-full py-2.5 rounded-xl bg-[#006b2c] text-white text-[13px] font-semibold hover:bg-[#00873a] transition-colors"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
