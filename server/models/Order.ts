import mongoose, { Schema, type Document } from 'mongoose';

export interface IOrderDocument extends Document {
  id: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryTimeSlot?: string;
  items?: any[];
  subtotal?: number;
  discount?: number;
  total?: number;
  status: string;
  otp?: string;
  hashedOtp?: string;
  salt?: string;
  otpExpiresAt?: number;
  otpStatus?: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED';
  createdAt?: string;
  otpVerifiedAt?: string;
}

const OrderSchema = new Schema<IOrderDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    deliveryAddress: { type: String, default: '' },
    deliveryTimeSlot: { type: String, default: '' },
    items: { type: Array, default: [] },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    status: { type: String, default: 'Picking' },
    otp: { type: String, default: '' },
    hashedOtp: { type: String, default: '' },
    salt: { type: String, default: '' },
    otpExpiresAt: { type: Number, default: 0 },
    otpStatus: {
      type: String,
      enum: ['UNUSED', 'USED', 'EXPIRED', 'LOCKED'],
      default: 'UNUSED',
    },
    createdAt: { type: String, default: () => new Date().toISOString() },
    otpVerifiedAt: { type: String, default: '' },
  },
  { timestamps: true }
);

export const OrderModel =
  mongoose.models.Order || mongoose.model<IOrderDocument>('Order', OrderSchema);
