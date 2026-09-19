export interface Product {
  id: string;
  title: string;
  supplier: string;
  sku: string;
  price: number;
  unit: string;
  stock: number;
  badge: string;
  image: string;
  category: 'produce' | 'dairy' | 'bakery' | 'beverages' | 'snacks' | 'grains';
  categoryLabel: string;
  isOrganic?: boolean;
  isQuickPrep?: boolean;
  description?: string;
  farmOrigin?: string;
  harvestDate?: string;
  tempRequirement?: string;
  nutrition?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface AisleCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
  slug: string;
}

export interface InventoryLog {
  id: string;
  timestamp: string;
  sku: string;
  productTitle: string;
  changeType: 'RESTOCK' | 'SALE' | 'AUDIT_ADJUSTMENT' | 'SPOILAGE_DISPOSAL';
  quantityChange: number;
  newStock: number;
  operator: string;
  notes: string;
}

export interface Order {
  id: string;
  customerName: string;
  deliveryAddress: string;
  deliveryTimeSlot: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  couponCode?: string;
  status: 'Pending' | 'Picking at Pod #104' | 'Cold-Chain En Route' | 'Delivered';
  createdAt: string;
}
