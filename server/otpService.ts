import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { dispatchOtpSms, getSmsProviderConfig, type SmsDeliveryResult } from './smsProvider.ts';

export interface StoredOtpRecord {
  orderId: string;
  customerId: string;
  customerPhone: string;
  maskedPhone: string;
  hashedOtp: string;
  salt: string;
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
  } catch (err) {
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

/**
 * Mask mobile number to format: ******1234 (exact requirement: Example: ******1234)
 */
export function maskMobileNumber(phone?: string): string {
  if (!phone || typeof phone !== 'string') return '******0000';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    const last4 = digits.slice(-4);
    return `******${last4}`;
  }
  return `******${phone.slice(-4)}`;
}

/**
 * Hashes an OTP with cryptographic salt using SHA-256.
 */
function hashOtp(otp: string, salt: string): string {
  return crypto.createHash('sha256').update(otp.trim() + salt).digest('hex');
}

/**
 * Generates a unique 6-digit OTP for an order, hashes it securely,
 * establishes a 10-minute expiry, and invokes the isolated SMS provider.
 */
export async function generateOrderOtp(
  orderId: string,
  customerId: string,
  customerPhone: string
): Promise<{
  success: boolean;
  orderId: string;
  maskedPhone: string;
  expiresAt: number;
  delivery: SmsDeliveryResult;
  error?: string;
}> {
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  // Invalidate any previous OTP for this order before generating a new one
  const existing = otpStore.get(orderId) || otpStore.get(altId);
  if (existing && existing.status !== 'USED') {
    existing.status = 'EXPIRED';
  }

  // Generate secure 6-digit number
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedOtp = hashOtp(rawOtp, salt);

  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry
  const maskedPhone = maskMobileNumber(customerPhone);

  const record: StoredOtpRecord = {
    orderId,
    customerId,
    customerPhone,
    maskedPhone,
    hashedOtp,
    salt,
    expiresAt,
    attempts: 0,
    maxAttempts: 5,
    status: 'UNUSED',
    createdAt: new Date().toISOString(),
  };

  otpStore.set(orderId, record);
  otpStore.set(altId, record);
  persistStore();

  // Attempt real SMS delivery via isolated SMS provider
  const delivery = await dispatchOtpSms(customerPhone, rawOtp, orderId);

  return {
    success: delivery.sent,
    orderId,
    maskedPhone,
    expiresAt,
    delivery,
    ...(delivery.sent ? {} : { error: delivery.message || 'SMS delivery failed.' }),
  };
}

/**
 * Verifies submitted OTP against the backend salted SHA-256 hash.
 */
export function verifyOrderOtp(
  orderId: string,
  submittedOtp: string
): {
  success: boolean;
  message?: string;
  error?: string;
  status: 'Picking' | 'Delivered';
  verifiedAt?: string;
  isExpired?: boolean;
  remainingAttempts?: number;
} {
  const record = otpStore.get(orderId);

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

  // 4. Timing-safe comparison of SHA-256 salted hashes
  const cleanInput = submittedOtp.trim();
  const candidateHash = hashOtp(cleanInput, record.salt);

  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(record.hashedOtp, 'hex');

  const matches = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);

  if (matches) {
    // CORRECT OTP
    const verifiedAt = new Date().toISOString();
    record.status = 'USED';
    record.verifiedAt = verifiedAt;
    persistStore();

    return {
      success: true,
      message: 'OTP Verified. Order completed.',
      status: 'Delivered',
      verifiedAt,
    };
  } else {
    // INCORRECT OTP
    record.attempts += 1;
    const remaining = Math.max(0, record.maxAttempts - record.attempts);
    if (remaining === 0) {
      record.status = 'LOCKED';
    }
    persistStore();

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
 * Resends a new OTP for an order, immediately invalidating the previous OTP.
 */
export async function resendOrderOtp(
  orderId: string,
  fallbackCustomerId?: string,
  fallbackCustomerPhone?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  maskedPhone?: string;
  expiresAt?: number;
  delivery?: SmsDeliveryResult;
}> {
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
  const existing = otpStore.get(orderId) || otpStore.get(altId);
  const customerId = fallbackCustomerId || existing?.customerId || 'guest';
  const customerPhone = fallbackCustomerPhone || existing?.customerPhone;

  if (!customerPhone) {
    return {
      success: false,
      error: 'Customer registered mobile number is required to resend OTP.',
    };
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

  // Generate new OTP & dispatch real SMS
  const result = await generateOrderOtp(
    orderId,
    customerId,
    customerPhone
  );

  return {
    ...result,
    message: result.success
      ? `New 6-digit OTP sent to ${result.maskedPhone}. 10-minute expiry reset.`
      : (result.delivery?.message || 'Failed to resend OTP.'),
  };
}

/**
 * Fetches the current safe verification status of an order without exposing the OTP.
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
      maskedPhone: '******0000',
      expiresAt: 0,
      isExpired: false,
      providerConfigured: provider.isConfigured,
    };
  }

  const isExpired = Date.now() > record.expiresAt;
  return {
    orderId,
    hasRecord: true,
    status: record.status === 'UNUSED' && isExpired ? 'EXPIRED' : record.status,
    maskedPhone: record.maskedPhone,
    expiresAt: record.expiresAt,
    isExpired,
    verifiedAt: record.verifiedAt,
    providerConfigured: provider.isConfigured,
  };
}

