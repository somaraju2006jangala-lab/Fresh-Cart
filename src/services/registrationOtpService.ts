/**
 * Registration OTP Service
 * Frontend client service for Indian (+91) mobile number registration & OTP verification.
 * 
 * Strict Security Principles:
 * - OTP is generated and hashed exclusively on the server.
 * - OTP is never exposed in browser UI, console, localStorage, or frontend source code.
 * - Mobile number is stored in E.164 format: +91XXXXXXXXXX.
 */

export interface RegistrationOtpSendResult {
  success: boolean;
  maskedPhone?: string;
  expiresAt?: number;
  cooldownSeconds?: number;
  error?: string;
}

export interface RegistrationOtpVerifyResult {
  success: boolean;
  message?: string;
  verificationToken?: string;
  phone?: string;
  remainingAttempts?: number;
  error?: string;
}

/**
 * Validates an Indian mobile number.
 * Requirements:
 * - Exactly 10 digits after +91.
 * - Starts with 6, 7, 8, or 9.
 * - Rejects letters and special characters.
 * - Normalized format: +91XXXXXXXXXX (no spaces, hyphens, or parentheses).
 */
export function validateIndianMobileNumber(input: string): {
  isValid: boolean;
  normalized?: string;
  digits?: string;
  error?: string;
} {
  if (!input || typeof input !== 'string') {
    return {
      isValid: false,
      error: 'Please enter a 10-digit Indian mobile number.',
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

  // Reject special characters
  if (/[^\d+\-\s]/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Mobile number cannot contain special characters.',
    };
  }

  let digits = trimmed.replace(/\D/g, '');

  // Strip leading 91 or 0
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

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

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return {
      isValid: false,
      error: 'Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.',
    };
  }

  return {
    isValid: true,
    normalized: `+91${digits}`,
    digits,
  };
}

/**
 * Calls backend to generate and dispatch OTP to the Indian mobile number.
 */
export async function sendRegistrationOtp(phone: string): Promise<RegistrationOtpSendResult> {
  try {
    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'OTP could not be sent. Please verify the mobile number or try again later.',
        cooldownSeconds: data.cooldownSeconds,
      };
    }

    return {
      success: true,
      maskedPhone: data.maskedPhone,
      expiresAt: data.expiresAt,
      cooldownSeconds: data.cooldownSeconds || 30,
    };
  } catch {
    return {
      success: false,
      error: 'OTP could not be sent. Please verify the mobile number or try again later.',
    };
  }
}

/**
 * Sends entered 6-digit OTP to the backend for cryptographic salted SHA-256 verification.
 */
export async function verifyRegistrationOtp(
  phone: string,
  otp: string
): Promise<RegistrationOtpVerifyResult> {
  try {
    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Invalid OTP. Please try again.',
        remainingAttempts: data.remainingAttempts,
      };
    }

    return {
      success: true,
      message: data.message || '✓ Mobile number verified',
      verificationToken: data.verificationToken,
      phone: data.phone,
    };
  } catch {
    return {
      success: false,
      error: 'Backend error verifying OTP. Please try again.',
    };
  }
}

/**
 * Calls backend to resend a new OTP, invalidating previous OTP and resetting cooldown.
 */
export async function resendRegistrationOtp(phone: string): Promise<RegistrationOtpSendResult> {
  try {
    const res = await fetch('/api/auth/otp/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Failed to resend OTP. Please try again.',
        cooldownSeconds: data.cooldownSeconds,
      };
    }

    return {
      success: true,
      maskedPhone: data.maskedPhone,
      expiresAt: data.expiresAt,
      cooldownSeconds: data.cooldownSeconds || 30,
    };
  } catch {
    return {
      success: false,
      error: 'Failed to resend OTP. Please check connection.',
    };
  }
}

/**
 * Validates with backend that the mobile number was verified before registration submission.
 */
export async function verifyRegistrationPhoneWithBackend(
  phone: string,
  verificationToken?: string
): Promise<{ success: boolean; verified: boolean; normalizedPhone?: string; error?: string }> {
  try {
    const res = await fetch('/api/auth/verify-registration-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, verificationToken }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      success: Boolean(data.success && data.verified),
      verified: Boolean(data.verified),
      normalizedPhone: data.normalizedPhone,
      error: data.error,
    };
  } catch {
    return {
      success: false,
      verified: false,
      error: 'Failed to verify mobile verification session with server.',
    };
  }
}

/**
 * Notifies backend to consume the verification session token after account creation.
 */
export async function consumeRegistrationTokenWithBackend(
  phone: string,
  verificationToken?: string
): Promise<void> {
  try {
    await fetch('/api/auth/consume-registration-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, verificationToken }),
    });
  } catch {
    // Ignore error
  }
}
