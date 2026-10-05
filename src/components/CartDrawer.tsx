import React from 'react';
import { FloatingCart } from './FloatingCart';
import { CartItem } from '../types';

interface CartDrawerProps {
  items: CartItem[];
  isOpen?: boolean;
  onToggle?: () => void;
  onNavigateToCart?: () => void;
  onUpdateQty?: (productId: string, delta: number) => void;
  onRemoveItem?: (productId: string) => void;
  onOpenCheckout?: () => void;
  appliedCoupon?: string | null;
  onApplyCoupon?: (code: string) => void;
  onRemoveCoupon?: () => void;
  coupons?: any[];
  deliveryCharges?: number;
  deliveryRules?: any[];
  taxAndPackingPercentage?: number;
}

/**
 * CartDrawer is retained for backwards compatibility with any component imports,
 * but no longer renders a drawer, modal, popup, or overlay panel.
 * It strictly renders the Floating Cart icon that navigates to the dedicated /cart page.
 */
export const CartDrawer: React.FC<CartDrawerProps> = ({
  items = [],
  onToggle,
  onNavigateToCart,
}) => {
  const totalItemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <FloatingCart
      cartCount={totalItemCount}
      onNavigateToCart={onNavigateToCart || onToggle || (() => {})}
    />
  );
};
