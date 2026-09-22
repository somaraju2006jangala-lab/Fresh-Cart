import React, { useState } from 'react';
import { Product } from '../types';
import { formatINR } from '../utils/currency';
import { Plus, Minus, ShoppingCart, Check } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

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
  const { t } = useLanguage();
  const [qty, setQty] = useState(1);
  const [addedAnim, setAddedAnim] = useState(false);

  const isOutOfStock = product.stock <= 0;

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
    onAddToCart(product, Math.min(qty, product.stock));
    setAddedAnim(true);
    setTimeout(() => setAddedAnim(false), 1200);
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
              {formatINR(product.price)}
            </span>
            <span className="text-[12px] text-[#565e74]">/ {product.unit}</span>
          </div>
        </div>
      </div>

      <div className="p-4 pt-0">
        {isOutOfStock ? (
          <button
            id={`add-to-cart-${product.id}`}
            type="button"
            disabled
            className="w-full py-2.5 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 bg-[#f1f5f9] text-[#94a3b8] cursor-not-allowed border border-[#e2e8f0]"
          >
            <span>{t('unavailable')}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#eff4ff] rounded-lg p-0.5 border border-[#e2e8f0]">
              <button
                type="button"
                title="Decrease quantity"
                onClick={handleDecrement}
                disabled={qty <= 1}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#e5eeff] text-[#0b1c30] active:scale-95 transition-all disabled:opacity-40"
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
                disabled={qty >= product.stock}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#e5eeff] text-[#0b1c30] active:scale-95 transition-all disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              id={`add-to-cart-${product.id}`}
              type="button"
              onClick={handleAdd}
              className={`flex-1 py-2 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-98 cursor-pointer ${
                addedAnim
                  ? 'bg-[#15803d] text-white'
                  : 'bg-[#006b2c] text-white hover:bg-[#00873a]'
              }`}
            >
              {addedAnim ? (
                <>
                  <Check className="w-4 h-4 text-[#7ffc97]" />
                  <span>{t('added')}</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  <span>{t('add')}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
