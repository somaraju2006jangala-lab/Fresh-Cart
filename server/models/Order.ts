export interface OrderEntity {
  id?: number;
  order_id: string;
  customer_id: string;
  customer_name: string;
  email?: string;
  mobile?: string;
  delivery_address: string;
  delivery_time_slot?: string;
  subtotal: number;
  discount: number;
  total: number;
  coupon_code?: string;
  status: string;
  payment_id?: string;
  payment_method: string;
  payment_status: string;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface OrderItemEntity {
  id?: number;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  price: number;
  subtotal: number;
  created_at?: string | Date;
}

export interface OrderWithItems extends OrderEntity {
  items: OrderItemEntity[];
}
