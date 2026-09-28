import mongoose, { Schema, type Document } from 'mongoose';

export interface ICustomerDocument extends Document {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  savedAddresses?: any[];
  passwordHash?: string;
  passwordSalt?: string;
  createdAt?: string;
  avatarUrl?: string;
  loyaltyTier?: string;
}

const CustomerSchema = new Schema<ICustomerDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, default: '', index: true },
    address: { type: String, default: '' },
    savedAddresses: { type: Array, default: [] },
    passwordHash: { type: String, default: '' },
    passwordSalt: { type: String, default: '' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    avatarUrl: { type: String, default: '' },
    loyaltyTier: { type: String, default: 'Fresh Member' },
  },
  { timestamps: true }
);

export const CustomerModel =
  mongoose.models.Customer ||
  mongoose.model<ICustomerDocument>('Customer', CustomerSchema);
