/**
 * Frontend client service for interacting with the backend Order Handover OTP API.
 */

export interface OtpGenerateResult {
  success: boolean;
  orderId?: string;
  maskedPhone?: string;
  expiresAt?: number;
  otp?: string;
  message?: string;
  error?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  message?: string;
  error?: string;
  status: 'Picking' | 'Delivered';
  verifiedAt?: string;
  isExpired?: boolean;
  remainingAttempts?: number;
}

export interface OtpResendResult {
  success: boolean;
  message?: string;
  error?: string;
  maskedPhone?: string;
  expiresAt?: number;
  otp?: string;
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
): Promise<OtpGenerateResult> {
  try {
    const res = await fetch('/api/otp/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, customerId, customerPhone }),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Could not contact server to initiate OTP.',
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
): Promise<OtpResendResult> {
  try {
    const res = await fetch('/api/otp/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, customerId, customerPhone }),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to contact backend to resend OTP.',
    };
  }
}

export interface CustomerOtpResult {
  success: boolean;
  orderId?: string;
  otp?: string;
  expiresAt?: number;
  isExpired?: boolean;
  status?: string;
  message?: string;
  error?: string;
}

/**
 * Queries safe order verification status from backend.
 * Admin passes { role: 'admin' } to verify.
 */
export async function getOrderOtpStatus(
  orderId: string,
  options?: { customerId?: string; role?: 'admin' | 'customer' }
): Promise<OtpStatusResult | null> {
  try {
    const params = new URLSearchParams();
    if (options?.customerId) params.set('customerId', options.customerId);
    if (options?.role) params.set('role', options.role);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/otp/status/${encodeURIComponent(orderId)}${qs}`, {
      headers: options?.role === 'admin' ? { 'x-admin-role': 'admin' } : {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Retrieves the Order Handover OTP strictly for the authenticated customer who placed the order.
 * Backend verifies customer ownership and prevents cross-customer OTP exposure.
 */
export async function getCustomerOrderOtp(
  orderId: string,
  customerId: string
): Promise<CustomerOtpResult> {
  try {
    const res = await fetch(
      `/api/otp/customer-order-otp/${encodeURIComponent(orderId)}?customerId=${encodeURIComponent(customerId)}`,
      {
        headers: {
          'x-customer-id': customerId,
        },
      }
    );
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to fetch Order Handover OTP.',
    };
  }
}
