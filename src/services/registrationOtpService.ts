/**
 * Registration Validation Service
 * Validates Indian (+91) mobile numbers for customer registration.
 * Mobile number is stored in E.164 format: +91XXXXXXXXXX.
 */

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

  // Strip repeated leading 91 prefixes (e.g. 91919876543210 -> strip repeated 91)
  while (digits.length > 10 && digits.startsWith('9191')) {
    digits = digits.slice(2);
  }

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
 * Formats an Indian mobile number for display:
 * "+91 9876543210"
 */
export function formatIndianDisplayNumber(input?: string): string {
  if (!input || typeof input !== 'string') return '';
  const validation = validateIndianMobileNumber(input);
  if (validation.isValid && validation.digits) {
    return `+91 ${validation.digits}`;
  }
  return input;
}


