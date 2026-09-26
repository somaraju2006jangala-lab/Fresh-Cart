import React, { useState, useRef } from 'react';
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

  const cardRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

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

  // Cursor-reactive 3D parallax tilt & glass specular highlight
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const normX = (x / rect.width) * 2 - 1;
    const normY = (y / rect.height) * 2 - 1;

    // Subtle 3D tilt: max 4.5 degrees
    const rotateX = (-normY * 4.5).toFixed(2);
    const rotateY = (normX * 4.5).toFixed(2);

    cardRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;

    if (highlightRef.current) {
      highlightRef.current.style.opacity = '1';
      highlightRef.current.style.background = `radial-gradient(320px circle at ${x}px ${y}px, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0.1) 40%, transparent 70%)`;
    }
  };

  const handleMouseLeave = () => {
    if (cardRef.current) {
      cardRef.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    }
    if (highlightRef.current) {
      highlightRef.current.style.opacity = '0';
    }
  };

  return (
    <div
      ref={cardRef}
      id={`product-card-${product.id}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative bg-white/35 backdrop-blur-md rounded-2xl shadow-xs hover:shadow-[0_16px_36px_-6px_rgba(0,107,44,0.12)] transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out flex flex-col justify-between overflow-hidden border border-white/50 hover:border-white/85 hover:bg-white/45 group will-change-transform ${
        isOutOfStock ? 'opacity-85' : ''
      }`}
    >
      {/* Specular glass reflection overlay following cursor */}
      <div
        ref={highlightRef}
        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300 z-10"
        aria-hidden="true"
      />

      <div
        className="cursor-pointer relative z-0"
        onClick={() => onOpenDetails(product)}
      >
        <div className="relative h-48 w-full bg-white/15 backdrop-blur-xs overflow-hidden">
          <img
            src={product.image}
            alt={product.title}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-106 ${
              isOutOfStock ? 'grayscale' : ''
            }`}
            loading="lazy"
          />

          {/* Badge with crystal glass styling */}
          <span className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-lg bg-white/65 backdrop-blur-md text-[11px] text-[#0b1c30] font-semibold shadow-2xs border border-white/70 transition-transform group-hover:scale-102">
            {product.badge}
          </span>
        </div>

        <div className="p-4">
          <span className="text-[11px] text-[#565e74] font-medium tracking-wide">
            {product.supplier} · {product.sku}
          </span>
          <h3 className="text-[16px] leading-snug text-[#0b1c30] font-semibold mt-1 group-hover:text-[#006b2c] transition-colors line-clamp-1">
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

      <div className="p-4 pt-0 relative z-0">
        {isOutOfStock ? (
          <button
            id={`add-to-cart-${product.id}`}
            type="button"
            disabled
            className="w-full py-2.5 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 bg-white/20 backdrop-blur-xs text-[#94a3b8] cursor-not-allowed border border-white/40"
          >
            <span>{t('unavailable')}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/40 backdrop-blur-md rounded-lg p-0.5 border border-white/55 shadow-2xs">
              <button
                type="button"
                title="Decrease quantity"
                onClick={handleDecrement}
                disabled={qty <= 1}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/70 text-[#0b1c30] active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
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
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/70 text-[#0b1c30] active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              id={`add-to-cart-${product.id}`}
              type="button"
              onClick={handleAdd}
              className={`flex-1 py-2 px-3 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-98 cursor-pointer ${
                addedAnim
                  ? 'bg-[#15803d] text-white shadow-[#15803d]/30'
                  : 'bg-[#006b2c] hover:bg-[#00873a] text-white hover:brightness-105 shadow-[#006b2c]/20'
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
