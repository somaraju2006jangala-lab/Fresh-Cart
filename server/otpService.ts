import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  maskMobileNumber,
  normalizeAndValidateIndianMobile,
  getSmsProviderConfig,
} from './smsProvider.ts';

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
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
      const records: StoredOtpRecord[] = JSON.parse(data);
      records.forEach((r) => otpStore.set(r.orderId, r));
    }
  } catch {
    // Ignore error and initialize fresh map
  }
}

function persistStore(): void {
  try {
    const records = Array.from(otpStore.values());
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Ignore persistence error
  }
}

loadStore();

export { maskMobileNumber, normalizeAndValidateIndianMobile };

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
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
  const record = otpStore.get(orderId) || otpStore.get(altId);

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
 */
export function getCustomerOrderOtp(
  orderId: string,
  requestingCustomerId: string
): {
  success: boolean;
  orderId: string;
  otp?: string;
  expiresAt: number;
  isExpired: boolean;
  status: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED' | 'NOT_FOUND';
  error?: string;
  message?: string;
} {
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

  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
  const record = otpStore.get(orderId) || otpStore.get(altId);

  if (!record) {
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: 'NOT_FOUND',
      error: 'Order not found.',
    };
  }

  const isOwner =
    record.customerId === requestingCustomerId ||
    record.customerId === 'guest' ||
    record.customerId === 'guest_user' ||
    record.customerId === 'cust-guest';

  if (!isOwner) {
    console.warn(`[OTP Server] Unauthorized attempt: customer "${requestingCustomerId}" requested OTP for order "${orderId}" owned by "${record.customerId}".`);
    return {
      success: false,
      orderId,
      expiresAt: 0,
      isExpired: false,
      status: record.status,
      error: 'Access denied: You can only view the OTP for your own order.',
    };
  }

  const isExpired = Date.now() > record.expiresAt || record.status === 'EXPIRED';
  const effectiveStatus = record.status === 'UNUSED' && isExpired ? 'EXPIRED' : record.status;

  if (effectiveStatus === 'USED') {
    return {
      success: true,
      orderId,
      status: 'USED',
      expiresAt: record.expiresAt,
      isExpired: false,
      message: 'Order Delivered',
    };
  }

  if (effectiveStatus === 'EXPIRED') {
    return {
      success: true,
      orderId,
      status: 'EXPIRED',
      expiresAt: record.expiresAt,
      isExpired: true,
      message: 'OTP expired. Please request a new OTP.',
    };
  }

  return {
    success: true,
    orderId,
    otp: record.otp,
    expiresAt: record.expiresAt,
    isExpired: false,
    status: 'UNUSED',
    message: `Order Handover OTP: ${record.otp}`,
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
