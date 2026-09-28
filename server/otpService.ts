import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  maskMobileNumber,
  normalizeAndValidateIndianMobile,
  getSmsProviderConfig,
} from './smsProvider.ts';
import {
  connectMongo,
  isMongoConnected,
  findOrderInDb,
  updateOrderOtpInDb,
  upsertOrderInDb,
  checkDatabaseAvailability,
  isProductionEnv,
} from './db.ts';

// Connect to MongoDB Atlas if MONGODB_URI is provided
connectMongo().catch(() => {});

export interface StoredOtpRecord {
  orderId: string;
  customerId: string;
  customerPhone: string;
  maskedPhone: string;
  hashedOtp: string;
  salt: string;
  otp: string; // Stored securely on backend for order handover verification
  expiresAt: number; // 10 minutes expiry timestamp (ms)
  attempts: number;
  maxAttempts: number; // 5 attempts limit
  status: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED';
  createdAt: string;
  verifiedAt?: string;
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'freshcart_data')
  : path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'otp_store.json');

// Ensure server data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // Ignore if already exists
  }
}

const otpStore = new Map<string, StoredOtpRecord>();

function loadStore(): void {
  // In production/Vercel, local filesystem is ephemeral and not authoritative
  if (isProductionEnv()) {
    return;
  }
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
      const records: StoredOtpRecord[] = JSON.parse(data);
      records.forEach((r) => otpStore.set(r.orderId, r));
    }
    // Ensure active demo orders (e.g. #FC-1005) have an active OTP window if unused
    const fc1005 = otpStore.get('#FC-1005') || otpStore.get('FC-1005');
    if (fc1005 && fc1005.status === 'UNUSED' && Date.now() > fc1005.expiresAt) {
      fc1005.expiresAt = Date.now() + 10 * 60 * 1000;
      fc1005.createdAt = new Date().toISOString();
      persistStore();
    }
  } catch {
    // Ignore error and initialize fresh map
  }
}

function persistStore(): void {
  // In production/Vercel, do not silently use local filesystem storage as substitute for MongoDB
  if (isProductionEnv()) {
    return;
  }
  try {
    const records = Array.from(otpStore.values());
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Ignore persistence error
  }
}

loadStore();

export { maskMobileNumber, normalizeAndValidateIndianMobile };

// Pre-registered known customer orders (e.g. demo and seed orders)
export const KNOWN_CUSTOMER_ORDERS: Record<
  string,
  { customerId: string; customerPhone?: string; status: string }
> = {
  '#FC-1005': { customerId: 'rahul123', customerPhone: '+91 9876543210', status: 'Picking' },
  'FC-1005': { customerId: 'rahul123', customerPhone: '+91 9876543210', status: 'Picking' },
  '#FC-1006': { customerId: 'priya123', customerPhone: '+91 9123456789', status: 'Picking' },
  'FC-1006': { customerId: 'priya123', customerPhone: '+91 9123456789', status: 'Picking' },
  '#1001': { customerId: 'rahul123', customerPhone: '+91 9876543210', status: 'Picking' },
  '1001': { customerId: 'rahul123', customerPhone: '+91 9876543210', status: 'Picking' },
  '#FC-94821': { customerId: 'cust-demo-1', customerPhone: '(555) 234-1234', status: 'Picking' },
  'FC-94821': { customerId: 'cust-demo-1', customerPhone: '(555) 234-1234', status: 'Picking' },
};

export function registerKnownOrder(order: {
  id: string;
  customerId: string;
  customerPhone?: string;
  status?: string;
}) {
  const altId = order.id.startsWith('#') ? order.id.slice(1) : `#${order.id}`;
  KNOWN_CUSTOMER_ORDERS[order.id] = {
    customerId: order.customerId,
    customerPhone: order.customerPhone,
    status: order.status || 'Picking',
  };
  KNOWN_CUSTOMER_ORDERS[altId] = KNOWN_CUSTOMER_ORDERS[order.id];

  if (isMongoConnected()) {
    upsertOrderInDb(order).catch(() => {});
  }
}

/**
 * Generates a random 6-digit numeric OTP (100000 - 999999).
 */
export function generateRandom6DigitOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hashes an OTP with a unique cryptographic salt using SHA-256.
 */
export function hashOtp(otp: string, salt: string): string {
  return crypto.createHash('sha256').update(otp + salt).digest('hex');
}

/**
 * Generates a random 6-digit Order Handover OTP for an order, establishes a 10-minute expiry,
 * and stores the record securely on the backend.
 */
export async function generateOrderOtp(
  orderId: string,
  customerId?: string,
  customerPhone?: string
): Promise<{
  success: boolean;
  orderId: string;
  maskedPhone: string;
  expiresAt: number;
  otp: string;
  message: string;
  error?: string;
}> {
  if (!orderId) {
    return {
      success: false,
      orderId: '',
      maskedPhone: 'Not available',
      expiresAt: 0,
      otp: '',
      message: 'Order ID is required.',
      error: 'Order ID is required.',
    };
  }

  // Validate production database availability
  const dbCheck = checkDatabaseAvailability();
  if (!dbCheck.available) {
    return {
      success: false,
      orderId,
      maskedPhone: 'Not available',
      expiresAt: 0,
      otp: '',
      message: dbCheck.error || 'Database unavailable in production.',
      error: dbCheck.error || 'Database unavailable in production.',
    };
  }

  // Format and mask phone if provided and valid, otherwise display 'Not available'
  let formattedPhone = '';
  let maskedPhone = 'Not available';

  if (customerPhone && typeof customerPhone === 'string' && customerPhone.trim()) {
    const norm = normalizeAndValidateIndianMobile(customerPhone);
    if (norm.isValid) {
      formattedPhone = norm.e164Format;
      maskedPhone = norm.maskedPhone;
    } else {
      const cleanDigits = customerPhone.replace(/\D/g, '');
      if (cleanDigits.length >= 4) {
        maskedPhone = `******${cleanDigits.slice(-4)}`;
      }
    }
  }

  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  // If an active UNUSED and unexpired OTP already exists for this order, reuse it (one fixed OTP per order)
  const existing = otpStore.get(orderId) || otpStore.get(altId);
  if (existing && existing.status === 'UNUSED' && Date.now() < existing.expiresAt) {
    return {
      success: true,
      orderId,
      maskedPhone: existing.maskedPhone,
      expiresAt: existing.expiresAt,
      otp: existing.otp,
      message: 'Order Handover OTP active.',
    };
  }

  // Invalidate any previous expired/unused record before generating fresh OTP
  if (existing && existing.status !== 'USED') {
    existing.status = 'EXPIRED';
  }

  const otp = generateRandom6DigitOtp();
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedOtp = hashOtp(otp, salt);
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry

  const record: StoredOtpRecord = {
    orderId,
    customerId: customerId || 'guest',
    customerPhone: formattedPhone,
    maskedPhone,
    hashedOtp,
    salt,
    otp,
    expiresAt,
    attempts: 0,
    maxAttempts: 5,
    status: 'UNUSED',
    createdAt: new Date().toISOString(),
  };

  otpStore.set(orderId, record);
  otpStore.set(altId, record);
  persistStore();

  // Register in known orders
  registerKnownOrder({
    id: orderId,
    customerId: customerId || 'guest',
    customerPhone: formattedPhone,
    status: 'Picking',
  });

  if (isMongoConnected()) {
    updateOrderOtpInDb(orderId, {
      otp,
      hashedOtp,
      salt,
      otpExpiresAt: expiresAt,
      otpStatus: 'UNUSED',
      status: 'Picking',
    }).catch(() => {});
  }

  console.log(`[Order Handover OTP] Order: ${orderId} | Customer: ${customerId || 'guest'} | Mobile: ${maskedPhone} (Expires in 10 minutes)`);

  return {
    success: true,
    orderId,
    maskedPhone,
    expiresAt,
    otp,
    message: 'Order Handover OTP generated.',
  };
}

/**
 * Resends a fresh random 6-digit Order Handover OTP for an order,
 * immediately invalidating the previous OTP and resetting the 10-minute expiry.
 */
export async function resendOrderOtp(
  orderId: string,
  fallbackCustomerId?: string,
  fallbackCustomerPhone?: string
): Promise<{
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
  maskedPhone?: string;
  expiresAt?: number;
  otp?: string;
}> {
  const dbCheck = checkDatabaseAvailability();
  if (!dbCheck.available) {
    return {
      success: false,
      orderId,
      message: dbCheck.error || 'Database unavailable in production.',
      error: dbCheck.error || 'Database unavailable in production.',
    };
  }

  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
  const existing = otpStore.get(orderId) || otpStore.get(altId);
  const customerId = fallbackCustomerId || existing?.customerId || 'guest';
  const customerPhone = fallbackCustomerPhone || existing?.customerPhone || '';

  let formattedPhone = existing?.customerPhone || '';
  let maskedPhone = existing?.maskedPhone || 'Not available';

  if (customerPhone && typeof customerPhone === 'string' && customerPhone.trim()) {
    const norm = normalizeAndValidateIndianMobile(customerPhone);
    if (norm.isValid) {
      formattedPhone = norm.e164Format;
      maskedPhone = norm.maskedPhone;
    } else if (maskedPhone === 'Not available' || maskedPhone === '******0000') {
      const cleanDigits = customerPhone.replace(/\D/g, '');
      if (cleanDigits.length >= 4) {
        maskedPhone = `******${cleanDigits.slice(-4)}`;
      }
    }
  }

  if (existing && existing.status === 'USED') {
    return {
      success: false,
      error: 'Order has already been verified and delivered.',
      message: 'Order has already been verified and delivered.',
    };
  }

  // Invalidate previous OTP immediately
  if (existing) {
    existing.status = 'EXPIRED';
    persistStore();
  }

  const otp = generateRandom6DigitOtp();
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedOtp = hashOtp(otp, salt);
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;

  const newRecord: StoredOtpRecord = {
    orderId,
    customerId,
    customerPhone: formattedPhone,
    maskedPhone,
    hashedOtp,
    salt,
    otp,
    expiresAt,
    attempts: 0,
    maxAttempts: 5,
    status: 'UNUSED',
    createdAt: new Date().toISOString(),
  };

  otpStore.set(orderId, newRecord);
  otpStore.set(altId, newRecord);
  persistStore();

  if (isMongoConnected()) {
    updateOrderOtpInDb(orderId, {
      otp,
      hashedOtp,
      salt,
      otpExpiresAt: expiresAt,
      otpStatus: 'UNUSED',
    }).catch(() => {});
  }

  console.log(`[Order Handover OTP Resend] Order: ${orderId} | Customer: ${customerId} | Mobile: ${maskedPhone} (Previous OTP invalidated)`);

  return {
    success: true,
    orderId,
    message: 'New 6-digit Order Handover OTP generated.',
    maskedPhone,
    expiresAt,
    otp,
  };
}

/**
 * Verifies submitted OTP against the backend stored record.
 * Rules:
 * - Correct OTP -> status changes from Picking to Delivered.
 * - Incorrect OTP -> show "Invalid OTP" and keep status as Picking.
 * - Expired OTP -> show "OTP expired" and keep status as Picking.
 * - Already-used OTP -> reject it.
 * - After successful verification, the OTP must be marked as used.
 * - A used OTP cannot be reused.
 */
export async function verifyOrderOtp(
  orderId: string,
  submittedOtp: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  status: 'Picking' | 'Delivered';
  verifiedAt?: string;
  isExpired?: boolean;
  remainingAttempts?: number;
}> {
  const dbCheck = checkDatabaseAvailability();
  if (!dbCheck.available) {
    return {
      success: false,
      error: dbCheck.error || 'Database unavailable in production.',
      status: 'Picking',
    };
  }

  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
  const dbOrder = await findOrderInDb(orderId);
  const localRecord = otpStore.get(orderId) || otpStore.get(altId);
  const record = isMongoConnected() && dbOrder?.otp
    ? {
        orderId: dbOrder.id,
        customerId: dbOrder.customerId,
        customerPhone: dbOrder.customerPhone || '',
        maskedPhone: dbOrder.customerPhone ? maskMobileNumber(dbOrder.customerPhone) : 'Not available',
        hashedOtp: dbOrder.hashedOtp || '',
        salt: dbOrder.salt || '',
        otp: dbOrder.otp,
        expiresAt: dbOrder.otpExpiresAt || 0,
        attempts: 0,
        maxAttempts: 5,
        status: (dbOrder.otpStatus || 'UNUSED') as 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED',
        createdAt: dbOrder.createdAt || new Date().toISOString(),
        verifiedAt: dbOrder.otpVerifiedAt,
      }
    : localRecord;

  if (!record) {
    return {
      success: false,
      error: 'No active OTP found for this order. Please click Resend OTP.',
      status: 'Picking',
    };
  }

  // 1. Used OTP cannot be reused
  if (record.status === 'USED') {
    return {
      success: false,
      error: 'This OTP has already been verified and used. The same OTP must never work again.',
      status: 'Delivered',
      verifiedAt: record.verifiedAt,
    };
  }

  // 2. Lockout protection against repeated incorrect attempts
  if (record.status === 'LOCKED' || record.attempts >= record.maxAttempts) {
    return {
      success: false,
      error: 'Maximum incorrect OTP attempts exceeded. Please click Resend OTP.',
      status: 'Picking',
      remainingAttempts: 0,
    };
  }

  // 3. 10-Minute Expiry check
  const now = Date.now();
  if (now > record.expiresAt || record.status === 'EXPIRED') {
    record.status = 'EXPIRED';
    persistStore();
    return {
      success: false,
      error: 'OTP expired. Please send a new OTP.',
      message: 'OTP expired. Please send a new OTP.',
      status: 'Picking',
      isExpired: true,
      remainingAttempts: 0,
    };
  }

  // 4. Input validation (must be 6 numeric digits)
  const cleanInput = (submittedOtp || '').trim();
  if (cleanInput.length !== 6 || !/^\d{6}$/.test(cleanInput)) {
    return {
      success: false,
      error: 'Invalid OTP.',
      message: 'Invalid OTP.',
      status: 'Picking',
    };
  }

  // 5. Verification comparison (against plain OTP or SHA-256 hash)
  const isMatch =
    (record.otp && cleanInput === record.otp) ||
    (record.hashedOtp && record.salt && hashOtp(cleanInput, record.salt) === record.hashedOtp);

  if (isMatch) {
    // CORRECT OTP -> status changes from Picking to Delivered
    const verifiedAt = new Date().toISOString();
    record.status = 'USED';
    record.verifiedAt = verifiedAt;
    persistStore();

    if (isMongoConnected()) {
      updateOrderOtpInDb(orderId, {
        otpStatus: 'USED',
        otpVerifiedAt: verifiedAt,
        status: 'Delivered',
      }).catch(() => {});
    }

    console.log(`[Order Handover OTP] Order: ${orderId} | Status: Delivered (OTP Verified successfully)`);

    return {
      success: true,
      message: 'OTP Verified. Order completed.',
      status: 'Delivered',
      verifiedAt,
    };
  } else {
    // INCORRECT OTP -> show "Invalid OTP" and keep status as Picking
    record.attempts += 1;
    const remaining = Math.max(0, record.maxAttempts - record.attempts);
    if (remaining === 0) {
      record.status = 'LOCKED';
    }
    persistStore();

    console.log(`[Order Handover OTP] Order: ${orderId} | Incorrect OTP entered. Remaining attempts: ${remaining}`);

    return {
      success: false,
      error: 'Invalid OTP.',
      message: 'Invalid OTP.',
      status: 'Picking',
      remainingAttempts: remaining,
    };
  }
}

/**
 * Fetches the current verification status of an order.
 * Returns safe status without revealing the secret OTP.
 */
export function getOrderOtpStatus(orderId: string): {
  orderId: string;
  hasRecord: boolean;
  status: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED' | 'NOT_FOUND';
  maskedPhone: string;
  expiresAt: number;
  isExpired: boolean;
  verifiedAt?: string;
  providerConfigured: boolean;
} {
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
  const record = otpStore.get(orderId) || otpStore.get(altId);
  const provider = getSmsProviderConfig();

  if (!record) {
    return {
      orderId,
      hasRecord: false,
      status: 'NOT_FOUND',
      maskedPhone: 'Not available',
      expiresAt: 0,
      isExpired: false,
      providerConfigured: provider.isConfigured,
    };
  }

  const isExpired = Date.now() > record.expiresAt || record.status === 'EXPIRED';
  const effectiveStatus = record.status === 'UNUSED' && isExpired ? 'EXPIRED' : record.status;
  const safeMaskedPhone = record.maskedPhone && record.maskedPhone !== '******0000'
    ? record.maskedPhone
    : 'Not available';

  return {
    orderId,
    hasRecord: true,
    status: effectiveStatus,
    maskedPhone: safeMaskedPhone,
    expiresAt: record.expiresAt,
    isExpired,
    verifiedAt: record.verifiedAt,
    providerConfigured: provider.isConfigured,
  };
}

/**
 * Retrieves the Order Handover OTP specifically for the authenticated customer who placed the order.
 * - Customer can only view their own active order OTP.
 * - If the order status is Delivered (USED), no active OTP is returned.
 * - If the OTP has expired, returns isExpired: true and instructs to request a new OTP.
 * - If another customer requests this order's OTP, returns 403 Forbidden.
 * - If newly created or active order has no active OTP yet, automatically generates an active backend OTP.
 * - If order exists and has active OTP, returns the identical OTP (refresh-safe).
 */
export async function getCustomerOrderOtp(
  orderId: string,
  requestingCustomerId: string
): Promise<{
  success: boolean;
  orderId: string;
  otp?: string;
  expiresAt: number;
  isExpired: boolean;
  status: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED' | 'NOT_FOUND';
  error?: string;
  message?: string;
}> {
  if (!requestingCustomerId || !requestingCustomerId.trim()) {
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: 'NOT_FOUND',
      error: 'Authentication required. Customer identity must be provided.',
    };
  }

  // Validate production database availability
  const dbCheck = checkDatabaseAvailability();
  if (!dbCheck.available) {
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: 'NOT_FOUND',
      error: dbCheck.error || 'Database unavailable in production.',
    };
  }

  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  // 1. Authoritative check in MongoDB Atlas if connected
  const dbOrder = await findOrderInDb(orderId);

  // 2. Local OTP store (used only in development fallback or local in-memory session)
  const localRecord = otpStore.get(orderId) || otpStore.get(altId);
  const existingRecord = isMongoConnected() && dbOrder?.otp
    ? {
        orderId: dbOrder.id,
        customerId: dbOrder.customerId,
        customerPhone: dbOrder.customerPhone || '',
        maskedPhone: dbOrder.customerPhone ? maskMobileNumber(dbOrder.customerPhone) : 'Not available',
        hashedOtp: dbOrder.hashedOtp || '',
        salt: dbOrder.salt || '',
        otp: dbOrder.otp,
        expiresAt: dbOrder.otpExpiresAt || 0,
        attempts: 0,
        maxAttempts: 5,
        status: (dbOrder.otpStatus || 'UNUSED') as 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED',
        createdAt: dbOrder.createdAt || new Date().toISOString(),
        verifiedAt: dbOrder.otpVerifiedAt,
      }
    : localRecord;

  // 3. Check known customer orders
  const knownOrder = KNOWN_CUSTOMER_ORDERS[orderId] || KNOWN_CUSTOMER_ORDERS[altId];

  // Determine owner and order existence
  const orderOwner = dbOrder?.customerId || existingRecord?.customerId || knownOrder?.customerId;
  const orderStatus = dbOrder?.status || knownOrder?.status || (existingRecord?.status === 'USED' ? 'Delivered' : 'Picking');
  const orderPhone = dbOrder?.customerPhone || existingRecord?.customerPhone || knownOrder?.customerPhone || '';

  if (!orderOwner && !existingRecord) {
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: 'NOT_FOUND',
      error: 'Order not found.',
    };
  }

  // Check customer authorization (must be owner or guest)
  const isOwner =
    orderOwner === requestingCustomerId ||
    orderOwner === 'guest' ||
    orderOwner === 'guest_user' ||
    orderOwner === 'cust-guest';

  if (!isOwner) {
    console.warn(`[OTP Server] Unauthorized attempt: customer "${requestingCustomerId}" requested OTP for order "${orderId}" owned by "${orderOwner}".`);
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: existingRecord?.status || 'NOT_FOUND',
      error: 'Access denied: You can only view the OTP for your own order.',
    };
  }

  // If order is Delivered / USED: return USED status without exposing active OTP
  if (orderStatus === 'Delivered' || existingRecord?.status === 'USED') {
    return {
      success: true,
      orderId,
      status: 'USED',
      expiresAt: existingRecord?.expiresAt || 0,
      isExpired: false,
      message: 'Order Delivered',
    };
  }

  // If active unused unexpired OTP exists, return it! (Same OTP returned on refresh)
  if (existingRecord && existingRecord.status === 'UNUSED' && Date.now() < existingRecord.expiresAt) {
    return {
      success: true,
      orderId,
      otp: existingRecord.otp,
      expiresAt: existingRecord.expiresAt,
      isExpired: false,
      status: 'UNUSED',
      message: `Order Handover OTP: ${existingRecord.otp}`,
    };
  }

  // If existing OTP is expired:
  if (existingRecord && (Date.now() >= existingRecord.expiresAt || existingRecord.status === 'EXPIRED')) {
    existingRecord.status = 'EXPIRED';
    persistStore();
    return {
      success: true,
      orderId,
      status: 'EXPIRED',
      expiresAt: existingRecord.expiresAt,
      isExpired: true,
      message: 'OTP expired. Please request a new OTP.',
    };
  }

  // If order is Picking and no active OTP exists yet (newly created order or demo order in Picking):
  // Automatically generate an active backend OTP!
  const gen = await generateOrderOtp(orderId, requestingCustomerId, orderPhone);
  return {
    success: true,
    orderId,
    otp: gen.otp,
    expiresAt: gen.expiresAt,
    isExpired: false,
    status: 'UNUSED',
    message: `Order Handover OTP: ${gen.otp}`,
  };
}

/**
 * Legacy wrapper forwarding to normalizeAndValidateIndianMobile
 */
export function validateIndianMobile(input: string): {
  isValid: boolean;
  normalized?: string;
  digits?: string;
  error?: string;
} {
  const norm = normalizeAndValidateIndianMobile(input);
  return {
    isValid: norm.isValid,
    normalized: norm.e164Format,
    digits: norm.national10Digit,
    error: norm.error,
  };
}
