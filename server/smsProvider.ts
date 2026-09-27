/**
 * Order Handover OTP Provider Module
 *
 * FreshCart:
 * Provides Indian mobile number validation, normalization, and masking.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

/**
 * Synchronously loads .env and .env.local from both import.meta.url relative path
 * and process.cwd() relative path.
 */
export function ensureEnvLoaded(): void {
  try {
    const candidates = [
      fileURLToPath(new URL('../.env', import.meta.url)),
      fileURLToPath(new URL('../.env.local', import.meta.url)),
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '.env.local'),
    ];

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = dotenv.parse(content);
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v === 'string' && v.trim().length > 0) {
              if (!process.env[k] || process.env[k] === 'YOUR_' + k) {
                process.env[k] = v.trim();
              }
            }
          }
        } catch {
          // ignore error reading candidate
        }
      }
    }
  } catch {
    // ignore
  }
}

// Ensure environment variables are loaded immediately on module initialization
ensureEnvLoaded();

export interface SmsProviderConfig {
  providerName: string;
  isConfigured: boolean;
}

export interface NormalizedIndianMobile {
  isValid: boolean;
  e164Format: string;        // e.g. "+919876543210"
  displayFormat: string;     // e.g. "+91 9876543210"
  national10Digit: string;   // e.g. "9876543210"
  maskedPhone: string;       // e.g. "******3210"
  error?: string;
}

/**
 * Safe backend Indian mobile number normalization and validation function.
 *
 * Requirements:
 * - Exactly 10 digits national Indian mobile number starting with 6, 7, 8, or 9.
 * - Handles: 9876543210, +919876543210, +91 9876543210, 91 9876543210, 09876543210, 91919876543210
 * - Display format: +91 9876543210
 * - Strictly rejects missing, non-Indian, letter-containing, or invalid phone numbers.
 */
export function normalizeAndValidateIndianMobile(input?: string): NormalizedIndianMobile {
  const invalidResult = (error: string = 'Valid Indian mobile number is not available for this customer.'): NormalizedIndianMobile => ({
    isValid: false,
    e164Format: '',
    displayFormat: '',
    national10Digit: '',
    maskedPhone: '******0000',
    error,
  });

  if (!input || typeof input !== 'string') {
    return invalidResult();
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return invalidResult();
  }

  // Reject letters
  if (/[a-zA-Z]/.test(trimmed)) {
    return invalidResult();
  }

  // Reject invalid special characters (allow digits, +, -, spaces, parentheses)
  if (/[^\d+\-\s()]/.test(trimmed)) {
    return invalidResult();
  }

  let allDigits = trimmed.replace(/\D/g, '');

  // Strip repeated country code prefixes (e.g. 91919876543210 -> strip 9191)
  while (allDigits.length > 10 && allDigits.startsWith('9191')) {
    allDigits = allDigits.slice(2);
  }

  // Strip single 91 prefix if length is 12 (e.g. 919876543210 -> 9876543210)
  if (allDigits.length === 12 && allDigits.startsWith('91')) {
    allDigits = allDigits.slice(2);
  } else if (allDigits.length === 11 && allDigits.startsWith('0')) {
    // Strip leading trunk zero (e.g. 09876543210 -> 9876543210)
    allDigits = allDigits.slice(1);
  }

  // National Indian mobile number must be exactly 10 digits
  if (allDigits.length !== 10) {
    return invalidResult();
  }

  // Must start with valid Indian mobile prefix: 6, 7, 8, or 9
  if (!/^[6-9]\d{9}$/.test(allDigits)) {
    return invalidResult();
  }

  const national10Digit = allDigits;
  const e164Format = `+91${national10Digit}`;
  const displayFormat = `+91 ${national10Digit}`;
  const maskedPhone = `******${national10Digit.slice(-4)}`;

  return {
    isValid: true,
    e164Format,
    displayFormat,
    national10Digit,
    maskedPhone,
  };
}

/**
 * Normalizes phone numbers to standard E.164 format (+91XXXXXXXXXX)
 */
export function formatE164Phone(phone: string): string {
  const norm = normalizeAndValidateIndianMobile(phone);
  return norm.isValid ? norm.e164Format : '';
}

/**
 * Mask mobile number to format: ******1234
 */
export function maskMobileNumber(phone?: string): string {
  if (!phone || typeof phone !== 'string') return '******0000';
  const norm = normalizeAndValidateIndianMobile(phone);
  if (norm.isValid) {
    return norm.maskedPhone;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `******${digits.slice(-4)}`;
  }
  return `******0000`;
}

/**
 * Returns configuration status for the Order Handover OTP system.
 */
export function getSmsProviderConfig(): SmsProviderConfig {
  return {
    providerName: 'Order Handover OTP',
    isConfigured: true,
  };
}
