import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface FloatingCartProps {
  cartCount: number;
  onNavigateToCart: () => void;
  visible?: boolean;
}

export const FloatingCart: React.FC<FloatingCartProps> = ({
  cartCount,
  onNavigateToCart,
  visible = true,
}) => {
  const { t } = useLanguage();

  if (!visible || cartCount <= 0) return null;

  return (
    <div id="cart-drawer-toggle" className="fixed bottom-6 right-6 z-50 pointer-events-auto">
      <button
        id="floating-cart-btn"
        type="button"
        onClick={onNavigateToCart}
        aria-label={`${t('cart')} (${cartCount})`}
        title={t('cart')}
        className="relative flex items-center justify-center bg-[#006b2c] text-white p-3.5 rounded-2xl shadow-2xl active:scale-95 cursor-pointer border border-white/40 cart-floating-glow group select-none transition-transform hover:scale-105"
      >
        <ShoppingCart className="w-6 h-6 text-white transition-transform group-hover:scale-105" />
        <span
          id="floating-cart-badge"
          className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-[#ba1a1a] text-white rounded-full text-[11px] font-bold ring-2 ring-white shadow-xs"
        >
          {cartCount}
        </span>
      </button>
    </div>
  );
};
