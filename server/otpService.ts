import fs from 'fs';
import path from 'path';
import {
  sendMsg91Otp,
  resendMsg91Otp,
  verifyMsg91Otp,
  getSmsProviderConfig,
  maskMobileNumber,
  formatMsg91Phone,
  type SmsDeliveryResult,
} from './smsProvider.ts';

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

export { maskMobileNumber };

/**
 * Generates an OTP request for an order via official MSG91 Send OTP API,
 * establishes a 10-minute expiry, and saves record to order store.
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

  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry
  const maskedPhone = maskMobileNumber(customerPhone);

  const record: StoredOtpRecord = {
    orderId,
    customerId,
    customerPhone,
    maskedPhone,
    hashedOtp: '',
    salt: '',
    expiresAt,
    attempts: 0,
    maxAttempts: 5,
    status: 'UNUSED',
    createdAt: new Date().toISOString(),
  };

  otpStore.set(orderId, record);
  otpStore.set(altId, record);
  persistStore();

  // Attempt real SMS delivery via official MSG91 Send OTP API
  const delivery = await sendMsg91Otp(customerPhone);

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
 * Verifies submitted OTP against MSG91's official OTP verification API.
 * Ensures used OTPs cannot be reused, respects lockout and expiry,
 * and updates order handover status to Delivered on success.
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

  // 5. Check if MSG91 is configured
  const provider = getSmsProviderConfig();
  if (!provider.isConfigured) {
    return {
      success: false,
      error: 'MSG91 is not configured. Missing environment variables: MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID.',
      message: 'MSG91 is not configured. Missing environment variables: MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID.',
      status: 'Picking',
    };
  }

  // 6. Call official MSG91 OTP Verify API
  const verifyResult = await verifyMsg91Otp(record.customerPhone, cleanInput);

  if (verifyResult.success) {
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
    // INCORRECT OR EXPIRED OTP
    record.attempts += 1;
    const remaining = Math.max(0, record.maxAttempts - record.attempts);
    if (remaining === 0) {
      record.status = 'LOCKED';
    }
    if (verifyResult.isExpired) {
      record.status = 'EXPIRED';
    }
    persistStore();

    const errorMessage = verifyResult.isExpired
      ? 'OTP expired. Please send a new OTP.'
      : 'Invalid OTP.';

    return {
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: 'Picking',
      isExpired: verifyResult.isExpired,
      remainingAttempts: remaining,
    };
  }
}

/**
 * Resends a new OTP for an order via MSG91 official resend API,
 * immediately invalidating the previous OTP and resetting the 10-minute expiry.
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

  // Resend via MSG91 official retry API
  const delivery = await resendMsg91Otp(customerPhone);
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;
  const maskedPhone = maskMobileNumber(customerPhone);

  const newRecord: StoredOtpRecord = {
    orderId,
    customerId,
    customerPhone,
    maskedPhone,
    hashedOtp: '',
    salt: '',
    expiresAt,
    attempts: 0,
    maxAttempts: 5,
    status: 'UNUSED',
    createdAt: new Date().toISOString(),
  };

  otpStore.set(orderId, newRecord);
  otpStore.set(altId, newRecord);
  persistStore();

  return {
    success: delivery.sent,
    message: delivery.sent
      ? `New 6-digit OTP sent to ${maskedPhone}. 10-minute expiry reset.`
      : (delivery.message || 'Failed to resend OTP.'),
    error: delivery.sent ? undefined : delivery.message,
    maskedPhone,
    expiresAt,
    delivery,
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

/**
 * Validates an Indian mobile number.
 * Requirements:
 * - Exactly 10 digits after optional country code / prefix.
 * - Starts with 6, 7, 8, or 9.
 * - Rejects letters and special characters.
 * - Returns normalized E.164 strictly formatted: +919876543210 (no spaces, dashes, or parentheses).
 */
export function validateIndianMobile(input: string): {
  isValid: boolean;
  normalized?: string;
  digits?: string;
  error?: string;
} {
  if (!input || typeof input !== 'string') {
    return {
      isValid: false,
      error: 'Mobile number is required.',
    };
  }

  const trimmed = input.trim();

  // Reject letters
  if (/[a-zA-Z]/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Mobile number must contain digits only. Letters are not allowed.',
    };
  }

  // Reject special characters (only digits, spaces, hyphens, and leading plus allowed)
  if (/[^\d+\-\s]/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Mobile number cannot contain special characters.',
    };
  }

  // Extract clean digits
  let digits = trimmed.replace(/\D/g, '');

  // Strip leading country code if present (+91 or 91) or leading trunk zero (0)
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Check length: exactly 10 digits
  if (digits.length < 10) {
    return {
      isValid: false,
      error: 'Please enter a complete 10-digit Indian mobile number.',
    };
  }
  if (digits.length > 10) {
    return {
      isValid: false,
      error: 'Mobile number cannot exceed 10 digits.',
    };
  }

  // Check Indian mobile numbering pattern: first digit must be 6, 7, 8, or 9
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return {
      isValid: false,
      error: 'Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.',
    };
  }

  const normalized = `+91${digits}`;

  return {
    isValid: true,
    normalized,
    digits,
  };
}
