import React, { useState } from 'react';
import { Product } from '../types';
import { Plus, Minus, ShoppingCart, Bell, Check } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity: number) => void;
  onOpenDetails: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  onOpenDetails,
}) => {
  const [qty, setQty] = useState(1);
  const [addedAnim, setAddedAnim] = useState(false);
  const [notified, setNotified] = useState(false);

  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 5;

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (qty < product.stock) {
      setQty((prev) => prev + 1);
    }
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (qty > 1) {
      setQty((prev) => prev - 1);
    }
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    onAddToCart(product, qty);
    setAddedAnim(true);
    setTimeout(() => setAddedAnim(false), 1200);
  };

  const handleNotify = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotified(true);
  };

  return (
    <div
      id={`product-card-${product.id}`}
      className={`bg-white rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden border border-[#e2e8f0]/80 group ${
        isOutOfStock ? 'opacity-85' : ''
      }`}
    >
      <div
        className="cursor-pointer"
        onClick={() => onOpenDetails(product)}
      >
        <div className="relative h-48 w-full bg-[#eff4ff] overflow-hidden">
          <img
            src={product.image}
            alt={product.title}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              isOutOfStock ? 'grayscale' : ''
            }`}
            loading="lazy"
          />

          {/* Stock Status Pill */}
          <div className="absolute top-2.5 left-2.5">
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] text-[11px] font-semibold shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a]" />
                Out of Stock
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ffddb8] text-[#825100] text-[11px] font-semibold shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#825100]" />
                Only {product.stock} left - Low Stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#7ffc97] text-[#002109] text-[11px] font-semibold shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#006b2c]" />
                In Stock ({product.stock} left)
              </span>
            )}
          </div>

          {/* Badge */}
          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/95 backdrop-blur-xs text-[11px] text-[#0b1c30] font-medium shadow-xs border border-[#e2e8f0]/60">
            {product.badge}
          </span>
        </div>

        <div className="p-4">
          <span className="text-[11px] text-[#565e74] font-medium tracking-wide">
            {product.supplier} · {product.sku}
          </span>
          <h3 className="text-[16px] leading-snug text-[#0b1c30] font-semibold mt-1 hover:text-[#006b2c] transition-colors line-clamp-1">
            {product.title}
          </h3>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-[20px] font-bold text-[#0b1c30] tabular-nums font-display">
              ${product.price.toFixed(2)}
            </span>
            <span className="text-[12px] text-[#565e74]">/ {product.unit}</span>
          </div>
        </div>
      </div>

      <div className="p-4 pt-0">
        {isOutOfStock ? (
          <button
            id={`notify-btn-${product.id}`}
            type="button"
            onClick={handleNotify}
            disabled={notified}
            className={`w-full py-2 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs ${
              notified
                ? 'bg-[#dcfce7] text-[#15803d]'
                : 'bg-[#dce9ff] text-[#0b1c30] hover:bg-[#cbdbf5]'
            }`}
          >
            {notified ? (
              <>
                <Check className="w-4 h-4 text-[#15803d]" />
                <span>Restock Alert Set!</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 text-[#565e74]" />
                <span>Notify Restock (Tomorrow 8am)</span>
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#eff4ff] rounded-lg p-0.5 border border-[#e2e8f0]">
              <button
                type="button"
                title="Decrease quantity"
                onClick={handleDecrement}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#e5eeff] text-[#0b1c30] active:scale-95 transition-all"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-7 text-center text-[12px] font-semibold text-[#0b1c30] tabular-nums">
                {qty}
              </span>
              <button
                type="button"
                title="Increase quantity"
                onClick={handleIncrement}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#e5eeff] text-[#0b1c30] active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              id={`add-to-cart-${product.id}`}
              type="button"
              onClick={handleAdd}
              className={`flex-1 py-2 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-98 ${
                addedAnim
                  ? 'bg-[#15803d] text-white'
                  : 'bg-[#006b2c] text-white hover:bg-[#00873a]'
              }`}
            >
              {addedAnim ? (
                <>
                  <Check className="w-4 h-4 text-[#7ffc97]" />
                  <span>Added!</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  <span>Add</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
