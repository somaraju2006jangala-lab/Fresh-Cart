import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  maskMobileNumber,
  normalizeAndValidateIndianMobile,
  getSmsProviderConfig,
} from './smsProvider.ts';
import {
  connectMySql,
  isMySqlConnected,
  findOrderInDb,
  updateOrderOtpInDb,
  upsertOrderInDb,
  checkDatabaseAvailability,
  isProductionEnv,
  saveOtpRecordInDb,
  findOtpRecordInDb,
} from './db.ts';

// Connect to MySQL eagerly if in running server
const isBuildStep =
  process.env.npm_lifecycle_event === 'build' ||
  process.argv.some((arg) => typeof arg === 'string' && arg.includes('build'));

if (!isBuildStep) {
  connectMySql().catch(() => { });
}

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

// Ensure server data directory exists for local caching
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // Ignore if already exists
  }
}

const otpStore = new Map<string, StoredOtpRecord>();

function loadStore(): void {
  if (isProductionEnv()) {
    return;
  }
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
      const records: StoredOtpRecord[] = JSON.parse(data);
      records.forEach((r) => otpStore.set(r.orderId, r));
    }
    const fc1005 = otpStore.get('#FC-1005') || otpStore.get('FC-1005');
    if (fc1005 && fc1005.status === 'UNUSED' && Date.now() > fc1005.expiresAt) {
      fc1005.expiresAt = Date.now() + 10 * 60 * 1000;
      fc1005.createdAt = new Date().toISOString();
      persistStore();
    }
  } catch {
    // Ignore error
  }
}

function persistStore(): void {
  if (isProductionEnv()) {
    return;
  }
  try {
    const records = Array.from(otpStore.values());
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Ignore error
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
 * and stores the record securely in MySQL.
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

  if (!isMySqlConnected()) {
    await connectMySql();
  }

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

  // If order is Cash on Delivery, OTP is NOT required and must not be generated
  const dbOrder = (await findOrderInDb(orderId)) || (await findOrderInDb(altId));
  const isCod =
    dbOrder?.paymentMethod?.toLowerCase().includes('cash') ||
    dbOrder?.paymentMethod === 'Cash on Delivery';
  if (isCod) {
    return {
      success: false,
      orderId,
      maskedPhone: 'Not available',
      expiresAt: 0,
      otp: '',
      message: 'OTP is not required for Cash on Delivery orders.',
      error: 'OTP is not required for Cash on Delivery orders.',
    };
  }

  // If an active UNUSED and unexpired OTP already exists for this order, reuse it
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

  registerKnownOrder({
    id: orderId,
    customerId: customerId || 'guest',
    customerPhone: formattedPhone,
    status: 'Picking',
  });

  if (isMySqlConnected()) {
    saveOtpRecordInDb({
      orderId,
      customerId: customerId || 'guest',
      otp,
      otpHash: hashedOtp,
      otpSalt: salt,
      expiresAt,
      used: false,
    }).catch(() => { });
  }

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
  if (!isMySqlConnected()) {
    await connectMySql();
  }

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

  // If order is Cash on Delivery, OTP is NOT required
  const dbOrder = (await findOrderInDb(orderId)) || (await findOrderInDb(altId));
  const isCod =
    dbOrder?.paymentMethod?.toLowerCase().includes('cash') ||
    dbOrder?.paymentMethod === 'Cash on Delivery';
  if (isCod) {
    return {
      success: false,
      orderId,
      message: 'OTP is not required for Cash on Delivery orders.',
      error: 'OTP is not required for Cash on Delivery orders.',
    };
  }

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

  if (isMySqlConnected()) {
    saveOtpRecordInDb({
      orderId,
      customerId,
      otp,
      otpHash: hashedOtp,
      otpSalt: salt,
      expiresAt,
      used: false,
    }).catch(() => { });
  }

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
  if (!isMySqlConnected()) {
    await connectMySql();
  }

  const dbCheck = checkDatabaseAvailability();
  if (!dbCheck.available) {
    return {
      success: false,
      error: dbCheck.error || 'Database unavailable in production.',
      status: 'Picking',
    };
  }

  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  // If order is Cash on Delivery, OTP is NOT required
  const dbOrder = (await findOrderInDb(orderId)) || (await findOrderInDb(altId));
  const isCod =
    dbOrder?.paymentMethod?.toLowerCase().includes('cash') ||
    dbOrder?.paymentMethod === 'Cash on Delivery';
  if (isCod) {
    return {
      success: false,
      error: 'OTP verification is not required for Cash on Delivery orders.',
      status: 'Picking',
    };
  }

  const dbOtp = await findOtpRecordInDb(orderId);
  const localRecord = otpStore.get(orderId) || otpStore.get(altId);

  const record = localRecord || (dbOtp ? {
    orderId,
    customerId: dbOtp.customerId,
    customerPhone: '',
    maskedPhone: 'Not available',
    hashedOtp: dbOtp.otpHash,
    salt: dbOtp.otpSalt,
    otp: '',
    expiresAt: dbOtp.expiresAt,
    attempts: dbOtp.attempts || 0,
    maxAttempts: dbOtp.maxAttempts || 5,
    status: dbOtp.used ? 'USED' : 'UNUSED',
    createdAt: new Date().toISOString(),
    verifiedAt: dbOtp.verifiedAt,
  } as StoredOtpRecord : null);

  if (!record) {
    return {
      success: false,
      error: 'No active OTP found for this order. Please click Resend OTP.',
      status: 'Picking',
    };
  }

  // 1. Used OTP cannot be reused
  if (record.status === 'USED' || dbOtp?.used) {
    return {
      success: false,
      error: 'This OTP has already been verified and used. The same OTP must never work again.',
      status: 'Delivered',
      verifiedAt: record.verifiedAt || dbOtp?.verifiedAt,
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

    if (isMySqlConnected()) {
      updateOrderOtpInDb(orderId, {
        otpStatus: 'USED',
        otpVerifiedAt: verifiedAt,
        status: 'Delivered',
        used: true,
      }).catch(() => { });
    }

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

    if (isMySqlConnected()) {
      updateOrderOtpInDb(orderId, { attempts: record.attempts }).catch(() => { });
    }

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

  if (!isMySqlConnected()) {
    await connectMySql();
  }

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
  const dbOrder = (await findOrderInDb(orderId)) || (await findOrderInDb(altId));
  const localRecord = otpStore.get(orderId) || otpStore.get(altId);
  const knownOrder = KNOWN_CUSTOMER_ORDERS[orderId] || KNOWN_CUSTOMER_ORDERS[altId];

  // If order is Cash on Delivery, OTP is NOT required
  const isCod =
    dbOrder?.paymentMethod?.toLowerCase().includes('cash') ||
    dbOrder?.paymentMethod === 'Cash on Delivery';
  if (isCod) {
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: 'NOT_FOUND',
      error: 'OTP is not required for Cash on Delivery orders.',
    };
  }

  const orderOwner = dbOrder?.customerId || localRecord?.customerId || knownOrder?.customerId;
  const orderStatus = dbOrder?.status || knownOrder?.status || (localRecord?.status === 'USED' ? 'Delivered' : 'Picking');
  const orderPhone = dbOrder?.customerPhone || localRecord?.customerPhone || knownOrder?.customerPhone || '';

  if (!orderOwner && !localRecord) {
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: 'NOT_FOUND',
      error: 'Order not found.',
    };
  }

  // Customer authorization: check if requesting customer owns this order
  const isOwner =
    orderOwner === requestingCustomerId ||
    orderOwner === 'guest' ||
    orderOwner === 'guest_user' ||
    orderOwner === 'cust-guest';

  if (!isOwner) {
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: localRecord?.status || 'NOT_FOUND',
      error: 'Access denied: You can only view the OTP for your own order.',
    };
  }

  // If order is Delivered / USED: return USED status without exposing active OTP
  if (orderStatus === 'Delivered' || localRecord?.status === 'USED') {
    return {
      success: true,
      orderId,
      status: 'USED',
      expiresAt: localRecord?.expiresAt || 0,
      isExpired: false,
      message: 'Order Delivered',
    };
  }

  // If active unused unexpired OTP exists, return it! (Same OTP returned on refresh)
  if (localRecord && localRecord.status === 'UNUSED' && Date.now() < localRecord.expiresAt) {
    return {
      success: true,
      orderId,
      otp: localRecord.otp,
      expiresAt: localRecord.expiresAt,
      isExpired: false,
      status: 'UNUSED',
      message: `Order Handover OTP: ${localRecord.otp}`,
    };
  }

  // If existing OTP is expired:
  if (localRecord && (Date.now() >= localRecord.expiresAt || localRecord.status === 'EXPIRED')) {
    localRecord.status = 'EXPIRED';
    persistStore();
    return {
      success: true,
      orderId,
      expiresAt: localRecord.expiresAt,
      isExpired: true,
      status: 'EXPIRED',
      message: 'OTP has expired. Please click Resend OTP to receive a new code.',
    };
  }

  // Generate new OTP if none exists
  const gen = await generateOrderOtp(orderId, requestingCustomerId, orderPhone);
  return {
    success: gen.success,
    orderId,
    otp: gen.otp,
    expiresAt: gen.expiresAt,
    isExpired: false,
    status: 'UNUSED',
    message: gen.message,
    error: gen.error,
  };
}
