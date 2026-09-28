import mongoose from 'mongoose';
import { OrderModel } from './models/Order.ts';
import { CustomerModel } from './models/Customer.ts';

let isConnected = false;

/**
 * Checks whether the current runtime environment is Production or Vercel.
 */
export function isProductionEnv(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL) ||
    process.env.ENVIRONMENT === 'production'
  );
}

/**
 * Attempts connection to MongoDB Atlas.
 * - In Production / Vercel: MongoDB Atlas is the required authoritative database.
 *   If MONGODB_URI is missing or unreachable, it logs a critical error and returns false.
 *   Production will NEVER silently fall back to local disk storage.
 * - In Local Development: Falls back to development store only if MONGODB_URI is omitted.
 */
export async function connectMongo(): Promise<boolean> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri || !uri.trim()) {
    if (isProductionEnv()) {
      console.error(
        '[MongoDB Atlas CRITICAL] MONGODB_URI is not configured in production/Vercel environment. ' +
        'MongoDB Atlas is the authoritative persistent database for customers and orders. ' +
        'Local filesystem fallback is disabled in production to prevent silent unpersisted data loss.'
      );
    } else {
      console.log(
        '[MongoDB Atlas] MONGODB_URI not configured. Operating in local development mode with fallback store.'
      );
    }
    return false;
  }

  if (isConnected && mongoose.connection.readyState === 1) {
    return true;
  }

  try {
    await mongoose.connect(uri.trim(), {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('[MongoDB Atlas] Connected successfully as the authoritative persistent database.');

    // Seed initial demo data in MongoDB Atlas if collections are empty
    await seedInitialDataIfDbConnected().catch(() => {});
    return true;
  } catch (err: any) {
    isConnected = false;
    if (isProductionEnv()) {
      console.error(
        `[MongoDB Atlas CRITICAL] Connection failed in production: ${err?.message || 'unknown error'}. ` +
        'Operation aborted to prevent silent unpersisted data loss on ephemeral container storage.'
      );
    } else {
      console.warn(
        `[MongoDB Atlas] Connection failed (${err?.message || 'unknown error'}). Operating with local development fallback.`
      );
    }
    return false;
  }
}

export function isMongoConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Checks database availability according to environment rules:
 * In production/Vercel, MongoDB Atlas must be connected. If not, returns explicit error.
 */
export function checkDatabaseAvailability(): {
  available: boolean;
  isProduction: boolean;
  error?: string;
  code?: string;
} {
  const isProd = isProductionEnv();
  const connected = isMongoConnected();

  if (isProd && !connected) {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri || !uri.trim()) {
      return {
        available: false,
        isProduction: true,
        error:
          'Database configuration error: MONGODB_URI is missing. MongoDB Atlas is the required authoritative database in production.',
        code: 'MONGODB_URI_MISSING',
      };
    }
    return {
      available: false,
      isProduction: true,
      error:
        'Database unavailable: Failed to connect to MongoDB Atlas cluster in production. Local disk fallback is disabled to protect data integrity.',
      code: 'MONGODB_UNAVAILABLE',
    };
  }

  return {
    available: true,
    isProduction: isProd,
  };
}

/**
 * Finds a customer by id, email, or phone in MongoDB Atlas.
 */
export async function findCustomerInDb(identifier: string): Promise<any | null> {
  if (!isMongoConnected() || !identifier) return null;

  try {
    const cleanId = identifier.trim();
    const doc = await CustomerModel.findOne({
      $or: [
        { id: cleanId },
        { email: cleanId.toLowerCase() },
        { phone: cleanId },
      ],
    }).lean();
    return doc;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error finding customer:', err?.message);
    return null;
  }
}

/**
 * Upserts a customer document in MongoDB Atlas.
 */
export async function upsertCustomerInDb(customerData: any): Promise<boolean> {
  if (!isMongoConnected() || !customerData?.id) return false;

  try {
    await CustomerModel.findOneAndUpdate(
      { id: customerData.id },
      { $set: customerData },
      { upsert: true, new: true }
    );
    return true;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error upserting customer:', err?.message);
    return false;
  }
}

/**
 * Retrieves all customers from MongoDB Atlas.
 */
export async function getCustomersFromDb(): Promise<any[]> {
  if (!isMongoConnected()) return [];

  try {
    return await CustomerModel.find({}).lean();
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error querying customers:', err?.message);
    return [];
  }
}

/**
 * Finds an order by its ID in MongoDB Atlas.
 */
export async function findOrderInDb(orderId: string): Promise<any | null> {
  if (!isMongoConnected() || !orderId) return null;

  try {
    const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
    const doc = await OrderModel.findOne({
      id: { $in: [orderId, altId] },
    }).lean();
    return doc;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error finding order:', err?.message);
    return null;
  }
}

/**
 * Finds orders for a customer in MongoDB Atlas.
 */
export async function findOrdersForCustomerInDb(customerId?: string): Promise<any[]> {
  if (!isMongoConnected()) return [];

  try {
    const filter = customerId ? { customerId } : {};
    return await OrderModel.find(filter).sort({ createdAt: -1 }).lean();
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error querying orders:', err?.message);
    return [];
  }
}

/**
 * Upserts an order document in MongoDB Atlas.
 */
export async function upsertOrderInDb(orderData: any): Promise<boolean> {
  if (!isMongoConnected() || !orderData?.id) return false;

  try {
    const altId = orderData.id.startsWith('#') ? orderData.id.slice(1) : `#${orderData.id}`;
    await OrderModel.findOneAndUpdate(
      { id: { $in: [orderData.id, altId] } },
      { $set: orderData },
      { upsert: true, new: true }
    );
    return true;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error upserting order:', err?.message);
    return false;
  }
}

/**
 * Updates OTP verification state for an order in MongoDB Atlas.
 */
export async function updateOrderOtpInDb(
  orderId: string,
  otpData: {
    otp?: string;
    hashedOtp?: string;
    salt?: string;
    otpExpiresAt?: number;
    otpStatus?: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED';
    otpVerifiedAt?: string;
    status?: string;
  }
): Promise<boolean> {
  if (!isMongoConnected() || !orderId) return false;

  try {
    const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
    const updatePayload: any = {};
    if (otpData.otp !== undefined) updatePayload.otp = otpData.otp;
    if (otpData.hashedOtp !== undefined) updatePayload.hashedOtp = otpData.hashedOtp;
    if (otpData.salt !== undefined) updatePayload.salt = otpData.salt;
    if (otpData.otpExpiresAt !== undefined) updatePayload.otpExpiresAt = otpData.otpExpiresAt;
    if (otpData.otpStatus !== undefined) updatePayload.otpStatus = otpData.otpStatus;
    if (otpData.otpVerifiedAt !== undefined) updatePayload.otpVerifiedAt = otpData.otpVerifiedAt;
    if (otpData.status !== undefined) updatePayload.status = otpData.status;

    await OrderModel.findOneAndUpdate(
      { id: { $in: [orderId, altId] } },
      { $set: updatePayload }
    );
    return true;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error updating OTP in DB:', err?.message);
    return false;
  }
}

/**
 * Seeds initial demo customers and orders in MongoDB Atlas if collections are empty.
 */
export async function seedInitialDataIfDbConnected(): Promise<void> {
  if (!isMongoConnected()) return;

  try {
    const custCount = await CustomerModel.countDocuments();
    if (custCount === 0) {
      await CustomerModel.insertMany([
        {
          id: 'rahul123',
          name: 'Rahul',
          email: 'rahul@example.com',
          phone: '+91 9876543210',
          address: 'Flat 402, Green Meadows, Bengaluru 560001',
          loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        },
        {
          id: 'priya123',
          name: 'Priya Sharma',
          email: 'priya@example.com',
          phone: '+91 9123456789',
          address: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
          loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        },
        {
          id: 'cust-demo-1',
          name: 'Alex Morgan',
          email: 'customer@freshcart.com',
          phone: '(555) 234-5678',
          address: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
          loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        },
      ]);
      console.log('[MongoDB Atlas] Seeded initial customer records.');
    }

    const orderCount = await OrderModel.countDocuments();
    if (orderCount === 0) {
      await OrderModel.insertMany([
        {
          id: '#FC-1005',
          customerId: 'rahul123',
          customerName: 'Rahul',
          customerEmail: 'rahul@example.com',
          customerPhone: '+91 9876543210',
          deliveryAddress: 'Flat 402, Green Meadows, Bengaluru 560001',
          status: 'Picking',
          total: 300,
        },
        {
          id: '#FC-1006',
          customerId: 'priya123',
          customerName: 'Priya Sharma',
          customerEmail: 'priya@example.com',
          customerPhone: '+91 9123456789',
          deliveryAddress: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
          status: 'Picking',
          total: 210,
        },
        {
          id: '#1001',
          customerId: 'rahul123',
          customerName: 'Rahul',
          customerEmail: 'rahul@example.com',
          customerPhone: '+91 9876543210',
          deliveryAddress: 'Flat 402, Green Meadows, Bengaluru 560001',
          status: 'Picking',
          total: 300,
        },
        {
          id: '#FC-94821',
          customerId: 'cust-demo-1',
          customerName: 'Alex Morgan',
          customerEmail: 'customer@freshcart.com',
          customerPhone: '(555) 234-1234',
          deliveryAddress: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
          status: 'Picking',
          total: 217,
        },
      ]);
      console.log('[MongoDB Atlas] Seeded initial order records.');
    }
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Seeding error:', err?.message);
  }
}
