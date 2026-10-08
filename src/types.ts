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
  status: 'Picking' | 'Ordered' | 'Pending' | 'Picking at Pod #104' | 'Cold-Chain En Route' | 'Delivered' | 'CONFIRMED' | string;
  createdAt: string;
  otpVerifiedAt?: string;
  handoverReleased?: boolean;
  paymentMethod?: string;
  paymentStatus?: string;
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
  token?: string;
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

export type ViewType = 'storefront' | 'admin' | 'login' | 'register' | 'dashboard' | 'search' | 'category' | 'cart' | 'checkout';

export interface DeliveryChargeRule {
  id: string;
  minOrderAmount: number;
  deliveryCharge: number; // 0 indicates FREE delivery
}

export interface UpiPaymentSettings {
  upiId: string;
  upi_id?: string;
  merchantName: string;
  merchant_name?: string;
  enabled: boolean;
  updatedAt?: string;
  updated_at?: string;
  qrCodeUrl?: string;
  qr_code_url?: string;
}

export interface UpiPaymentRecord {
  paymentId: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
  upiId: string;
  merchantName: string;
  paymentMethod: string;
  transactionRef: string;
  createdAt: string;
  paymentStatus: string;
}

