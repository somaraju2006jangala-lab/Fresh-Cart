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
  category: string;
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
  date?: string;
  time?: string;
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
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress: string;
  deliveryTimeSlot: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  couponCode?: string;
  status: 'Picking' | 'Ordered' | 'Pending' | 'Picking at Pod #104' | 'Cold-Chain En Route' | 'Delivered' | string;
  createdAt: string;
  otpVerifiedAt?: string;
  handoverReleased?: boolean;
}

export interface CustomerAddress {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  isDefault?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  savedAddresses: CustomerAddress[];
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  avatarUrl?: string;
  loyaltyTier?: string;
}

export interface CustomerOrder extends Order {
  customerId?: string;
  estimatedDeliveryTime?: string;
  paymentMethod?: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountPercentage: number;
  minOrderAmount: number;
  isActive: boolean;
  startDate?: string;
  expiryDate?: string;
  maxUses?: number;
  usedCount?: number;
  description?: string;
  createdAt?: string;
}

export type ViewType = 'storefront' | 'admin' | 'login' | 'register' | 'dashboard' | 'search' | 'category';

