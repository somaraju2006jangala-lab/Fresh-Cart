import React, { useState } from 'react';
import { CartItem } from '../types';
import {
  ShoppingCart,
  ChevronUp,
  X,
  Plus,
  Minus,
  Trash2,
  Truck,
  ArrowRight,
  ShoppingBag,
  Tag,
  Check,
} from 'lucide-react';

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
}) => {
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');

  const freeDeliveryThreshold = 25.0;
  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const discount = appliedCoupon === 'FRESH30' ? subtotal * 0.3 : 0;
  const total = Math.max(0, subtotal - discount);

  const deliveryDiff = freeDeliveryThreshold - subtotal;
  const deliveryProgressPct = Math.min(
    100,
    Math.round((subtotal / freeDeliveryThreshold) * 100)
  );

  const handleApplyCouponSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    if (couponInput.trim().toUpperCase() === 'FRESH30') {
      onApplyCoupon('FRESH30');
      setCouponInput('');
      setCouponError('');
    } else {
      setCouponError('Invalid coupon. Try FRESH30 for 30% off!');
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
            className="flex items-center gap-3.5 bg-[#213145] text-[#eaf1ff] px-5 py-3.5 rounded-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-[#565e74]/30"
          >
            <div className="relative">
              <ShoppingCart className="w-6 h-6 text-[#7ffc97]" />
              <span
                id="cart-badge-count"
                className="absolute -top-2 -right-2 px-1.5 py-0.2 bg-[#006b2c] text-white rounded-full text-[11px] font-bold ring-2 ring-[#213145]"
              >
                {totalItemCount}
              </span>
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-[11px] text-[#bec6e0] font-medium leading-tight">
                Your Live Cart
              </div>
              <div
                id="cart-drawer-toggle-subtotal"
                className="text-[16px] font-bold text-white leading-tight font-display tabular-nums"
              >
                ${total.toFixed(2)}
              </div>
            </div>
            <ChevronUp className="w-5 h-5 text-[#bec6e0]" />
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
                Your Live Basket (
                <span id="cart-count-title">{totalItemCount}</span>)
              </h3>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="w-8 h-8 rounded-lg bg-[#eff4ff] hover:bg-[#e5eeff] flex items-center justify-center text-[#565e74] hover:text-[#0b1c30] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Delivery Goal Progress */}
          <div className="bg-[#eff4ff] p-3 rounded-xl my-3 space-y-1.5 border border-[#e2e8f0]/60">
            <div className="flex items-center justify-between text-[11px] font-medium">
              <span className="text-[#3e4a3d]">
                Free Express Delivery Goal ($25.00)
              </span>
              <span
                id="progress-text"
                className={`font-semibold ${
                  deliveryDiff <= 0 ? 'text-[#006b2c]' : 'text-[#825100]'
                }`}
              >
                {deliveryDiff <= 0
                  ? 'FREE Express Delivery Unlocked!'
                  : `Add $${deliveryDiff.toFixed(2)} more for FREE delivery`}
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
              <div className="text-center py-8 text-[#565e74]">
                <ShoppingCart className="w-10 h-10 mx-auto text-[#bdcaba] mb-2" />
                <p className="text-[14px] font-medium text-[#0b1c30]">
                  Your cart is empty
                </p>
                <p className="text-[12px] text-[#565e74] mt-0.5">
                  Explore fresh farm produce and daily essentials!
                </p>
              </div>
            ) : (
              items.map((item) => (
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
                      {item.quantity} × ${item.product.price.toFixed(2)} / {item.product.unit}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-white rounded-lg border border-[#e2e8f0] shadow-2xs">
                      <button
                        type="button"
                        title="Decrease or remove item"
                        onClick={() => onUpdateQty(item.product.id, -1)}
                        className="w-6 h-6 flex items-center justify-center text-[#0b1c30] hover:bg-[#eff4ff] rounded-l-lg transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-5 text-center text-[11px] font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        title="Increase quantity"
                        onClick={() => onUpdateQty(item.product.id, 1)}
                        className="w-6 h-6 flex items-center justify-center text-[#0b1c30] hover:bg-[#eff4ff] rounded-r-lg transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="text-[13px] font-bold text-[#0b1c30] min-w-[50px] text-right tabular-nums">
                      ${(item.product.price * item.quantity).toFixed(2)}
                    </span>

                    <button
                      type="button"
                      title="Remove item"
                      onClick={() => onRemoveItem(item.product.id)}
                      className="w-7 h-7 rounded-lg hover:bg-[#ffdad6] text-[#6e7b6c] hover:text-[#ba1a1a] transition-colors flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
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
          <div className="my-2 pt-2 border-t border-[#e5eeff]">
            {appliedCoupon ? (
              <div className="flex items-center justify-between bg-[#dcfce7] p-2 rounded-lg text-[12px] text-[#15803d]">
                <div className="flex items-center gap-1.5 font-medium">
                  <Check className="w-4 h-4 text-[#15803d]" />
                  <span>Coupon {appliedCoupon} applied (30% off)</span>
                </div>
                <button
                  type="button"
                  onClick={onRemoveCoupon}
                  className="text-[11px] underline hover:text-[#0b1c30] font-semibold ml-2 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyCouponSubmit} className="flex gap-1.5">
                <div className="relative flex-1">
                  <Tag className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#6e7b6c]" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value);
                      if (couponError) setCouponError('');
                    }}
                    placeholder="Enter coupon (e.g. FRESH30)"
                    className="w-full pl-8 pr-2 py-1.5 text-[12px] bg-[#f8f9ff] border border-[#cbd5e1] rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#006b2c]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#565e74] hover:bg-[#131b2e] text-white text-[12px] font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Apply
                </button>
              </form>
            )}
            {couponError && (
              <p className="text-[11px] text-[#ba1a1a] mt-1">{couponError}</p>
            )}
          </div>

          {/* Order Financials */}
          <div className="pt-2 border-t border-[#e5eeff] space-y-1 text-[13px]">
            <div className="flex justify-between text-[#565e74]">
              <span>Aisle Subtotal</span>
              <span id="cart-drawer-subtotal" className="font-semibold text-[#0b1c30] tabular-nums">
                ${subtotal.toFixed(2)}
              </span>
            </div>

            {discount > 0 && (
              <div className="flex justify-between text-[#006b2c]">
                <span>Farm Welcome Discount (30%)</span>
                <span className="font-semibold tabular-nums">-${discount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-[#565e74]">
              <span>Cold-Chain Eco Packaging</span>
              <span className="text-[#006b2c] font-medium">Free</span>
            </div>

            <div className="flex justify-between text-[15px] font-bold text-[#0b1c30] pt-1 border-t border-[#e5eeff]">
              <span>Total Estimated</span>
              <span id="cart-drawer-total" className="text-[#006b2c] tabular-nums font-display">
                ${total.toFixed(2)}
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
            <span>Proceed to Express Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
