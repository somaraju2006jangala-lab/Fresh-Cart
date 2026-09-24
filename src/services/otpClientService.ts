/**
 * Frontend client service for interacting with the backend OTP API.
 * Follows strict security rules:
 * - All OTP generation, hashing, attempt tracking, and verification are performed by the backend.
 * - OTP is never exposed in frontend code, localStorage, or console logs.
 */

export interface OtpVerifyResult {
  success: boolean;
  message?: string;
  error?: string;
  status: 'Picking' | 'Delivered';
  verifiedAt?: string;
  isExpired?: boolean;
  remainingAttempts?: number;
}

export interface OtpStatusResult {
  success: boolean;
  orderId: string;
  hasRecord: boolean;
  status: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED' | 'NOT_FOUND';
  maskedPhone: string;
  expiresAt: number;
  isExpired: boolean;
  verifiedAt?: string;
  providerConfigured: boolean;
}

/**
 * Formats a mobile number to the required masked format: ******1234
 * Example from specification: Mobile: ******1234
 */
export function maskMobileNumber(phone?: string): string {
  if (!phone || typeof phone !== 'string') return '******1234';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `******${digits.slice(-4)}`;
  }
  return `******${phone.slice(-4)}`;
}

/**
 * Calls backend to generate OTP and initiate SMS delivery.
 */
export async function generateOrderOtp(
  orderId: string,
  customerId: string,
  customerPhone: string
): Promise<{
  success: boolean;
  orderId?: string;
  maskedPhone?: string;
  expiresAt?: number;
  error?: string;
}> {
  try {
    const res = await fetch('/api/otp/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, customerId, customerPhone }),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      error: 'Could not contact server to initiate OTP.',
    };
  }
}

/**
 * Calls backend to verify entered OTP against the salted SHA-256 hash.
 */
export async function verifyOrderOtp(
  orderId: string,
  otp: string
): Promise<OtpVerifyResult> {
  try {
    const res = await fetch('/api/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, otp }),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      error: 'Backend communication error while verifying OTP.',
      status: 'Picking',
    };
  }
}

/**
 * Calls backend to invalidate previous OTP and issue a fresh one.
 */
export async function resendOrderOtp(
  orderId: string,
  customerId?: string,
  customerPhone?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  maskedPhone?: string;
  expiresAt?: number;
}> {
  try {
    const res = await fetch('/api/otp/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, customerId, customerPhone }),
    });
    return await res.json();
  } catch {
    return {
      success: false,
      error: 'Failed to contact backend to resend OTP.',
    };
  }
}

/**
 * Queries safe order verification status from backend without exposing plain OTP.
 */
export async function getOrderOtpStatus(orderId: string): Promise<OtpStatusResult | null> {
  try {
    const res = await fetch(`/api/otp/status/${encodeURIComponent(orderId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
