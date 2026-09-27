/**
 * Isolated SMS / OTP Delivery Provider Module
 *
 * Dedicated live carrier delivery via MSG91 OTP API (v5):
 * 1. Send OTP: POST https://control.msg91.com/api/v5/otp
 * 2. Resend OTP: GET https://control.msg91.com/api/v5/otp/retry
 * 3. Verify OTP: GET https://control.msg91.com/api/v5/otp/verify
 *
 * Credentials stored exclusively in environment variables:
 * - MSG91_AUTH_KEY
 * - MSG91_OTP_TEMPLATE_ID
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

/**
 * Synchronously loads .env and .env.local from both import.meta.url relative path
 * and process.cwd() relative path.
 * Guarantees that non-empty values from .env are populated into process.env even if
 * empty strings or undefined exist in the shell environment.
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
  providerName: 'MSG91' | 'None';
  isConfigured: boolean;
  activeProvider?: 'msg91';
  missingConfig?: string[];
}

export interface SmsDeliveryResult {
  sent: boolean;
  provider: 'MSG91' | 'None';
  status: 'DELIVERED_TO_CARRIER' | 'PROVIDER_NOT_CONFIGURED' | 'FAILED';
  carrierMessageId?: string;
  message: string;
}

/**
 * Cleanly reads an environment variable, trimming whitespace and optional wrapping quotes.
 */
function getCleanEnv(key: string): string | undefined {
  const val = process.env[key];
  if (!val) return undefined;
  const trimmed = val.trim();
  let unquoted = trimmed;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    unquoted = trimmed.slice(1, -1).trim();
  }
  if (!unquoted || unquoted.length === 0) {
    return undefined;
  }
  return unquoted;
}

/**
 * Normalizes phone numbers to standard E.164 format (+91XXXXXXXXXX)
 */
export function formatE164Phone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return '+' + cleaned.replace(/\D/g, '');
  }
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
}

/**
 * Normalizes customer mobile numbers for MSG91 in international format: 91XXXXXXXXXX
 * Strictly strips accidental +91 +91, 0, or extra characters.
 */
export function formatMsg91Phone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.trim().replace(/\D/g, '');

  // Extract clean 10-digit national number if valid Indian mobile
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10)) {
      return `91${last10}`;
    }
  }

  // Handle leading 0 prefix: e.g. 09876543210 -> 9876543210
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }

  // If 10 digits
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // If 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }

  return digits;
}

/**
 * Mask mobile number to format: ******1234
 */
export function maskMobileNumber(phone?: string): string {
  if (!phone || typeof phone !== 'string') return '******0000';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `******${digits.slice(-4)}`;
  }
  return `******${phone.slice(-4)}`;
}

/**
 * Helper to fetch a clean environment variable by primary name or fallback aliases.
 */
function getEnvWithFallbacks(primary: string, fallbacks: string[] = []): string | undefined {
  const allKeys = [primary, ...fallbacks];
  for (const k of allKeys) {
    const val = getCleanEnv(k);
    if (val) return val;
  }
  return undefined;
}

/**
 * Checks environment variables for MSG91 provider credentials.
 * Configured if MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are present and not placeholder values.
 */
export function getSmsProviderConfig(): SmsProviderConfig {
  ensureEnvLoaded();

  const authKey = getEnvWithFallbacks('MSG91_AUTH_KEY', ['MSG91_KEY', 'AUTH_KEY']);
  const templateId = getEnvWithFallbacks('MSG91_OTP_TEMPLATE_ID', ['MSG91_TEMPLATE_ID', 'OTP_TEMPLATE_ID', 'TEMPLATE_ID']);

  const isConfigured = Boolean(
    authKey &&
    templateId &&
    authKey !== 'YOUR_MSG91_AUTH_KEY' &&
    templateId !== 'YOUR_MSG91_OTP_TEMPLATE_ID'
  );

  if (isConfigured) {
    return {
      providerName: 'MSG91',
      isConfigured: true,
      activeProvider: 'msg91',
    };
  }

  const missing: string[] = [];
  if (!authKey || authKey === 'YOUR_MSG91_AUTH_KEY') missing.push('MSG91_AUTH_KEY');
  if (!templateId || templateId === 'YOUR_MSG91_OTP_TEMPLATE_ID') missing.push('MSG91_OTP_TEMPLATE_ID');

  return {
    providerName: 'None',
    isConfigured: false,
    missingConfig: missing,
  };
}

/**
 * Safely inspects the availability of MSG91 environment variables
 * without ever exposing or printing secrets.
 */
export function getSafeEnvStatus(): {
  MSG91_AUTH_KEY: 'configured' | 'missing';
  MSG91_OTP_TEMPLATE_ID: 'configured' | 'missing';
} {
  ensureEnvLoaded();
  const authKey = getEnvWithFallbacks('MSG91_AUTH_KEY', ['MSG91_KEY', 'AUTH_KEY']);
  const templateId = getEnvWithFallbacks('MSG91_OTP_TEMPLATE_ID', ['MSG91_TEMPLATE_ID', 'OTP_TEMPLATE_ID', 'TEMPLATE_ID']);

  return {
    MSG91_AUTH_KEY: (authKey && authKey !== 'YOUR_MSG91_AUTH_KEY') ? 'configured' : 'missing',
    MSG91_OTP_TEMPLATE_ID: (templateId && templateId !== 'YOUR_MSG91_OTP_TEMPLATE_ID') ? 'configured' : 'missing',
  };
}

/**
 * Logs safe environment variable statuses conforming to specification:
 * [OTP Server] MSG91_AUTH_KEY: configured / missing
 * [OTP Server] MSG91_OTP_TEMPLATE_ID: configured / missing
 */
export function logSafeEnvStatus(): void {
  const status = getSafeEnvStatus();
  console.log(`[OTP Server] MSG91_AUTH_KEY: ${status.MSG91_AUTH_KEY}`);
  console.log(`[OTP Server] MSG91_OTP_TEMPLATE_ID: ${status.MSG91_OTP_TEMPLATE_ID}`);
}

/**
 * Sends an OTP via the official MSG91 OTP API (POST https://control.msg91.com/api/v5/otp).
 *
 * Parameters:
 * - template_id: MSG91_OTP_TEMPLATE_ID
 * - mobile: 91XXXXXXXXXX
 * - otp_length: 6
 * - otp_expiry: 10 (minutes)
 * - otp: (optional 6-digit OTP to send specific code)
 *
 * Logs strictly:
 * [OTP Server] Provider: MSG91
 * [OTP Server] Phone: ******1234
 * [OTP Server] Sent: true/false
 * Never logs Auth Key, full phone, or OTP.
 */
export async function sendMsg91Otp(
  recipientPhone: string,
  options?: { otp?: string; purpose?: string }
): Promise<SmsDeliveryResult> {
  const config = getSmsProviderConfig();
  const masked = maskMobileNumber(recipientPhone);

  if (!config.isConfigured) {
    console.log(`[OTP Server] Provider: MSG91`);
    console.log(`[OTP Server] Phone: ${masked}`);
    console.log(`[OTP Server] Sent: false`);
    const missingSummary = config.missingConfig?.join(', ') || 'MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID';
    return {
      sent: false,
      provider: 'None',
      status: 'PROVIDER_NOT_CONFIGURED',
      message: `SMS provider is not configured. Missing environment variables: ${missingSummary}.`,
    };
  }

  const authKey = getEnvWithFallbacks('MSG91_AUTH_KEY', ['MSG91_KEY', 'AUTH_KEY'])!;
  const templateId = getEnvWithFallbacks('MSG91_OTP_TEMPLATE_ID', ['MSG91_TEMPLATE_ID', 'OTP_TEMPLATE_ID', 'TEMPLATE_ID'])!;
  const msg91Mobile = formatMsg91Phone(recipientPhone);

  try {
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', templateId);
    url.searchParams.set('mobile', msg91Mobile);
    url.searchParams.set('otp_length', '6');
    url.searchParams.set('otp_expiry', '10');

    if (options?.otp) {
      url.searchParams.set('otp', options.otp);
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await response.json().catch(() => ({}));
    const isSuccess = Boolean(
      (response.ok && data?.type === 'success') ||
      data?.request_id ||
      (data?.type !== 'error' && data?.message?.toLowerCase().includes('success'))
    );

    console.log(`[OTP Server] Provider: MSG91`);
    console.log(`[OTP Server] Phone: ${masked}`);
    console.log(`[OTP Server] Sent: ${isSuccess}`);

    if (isSuccess) {
      return {
        sent: true,
        provider: 'MSG91',
        status: 'DELIVERED_TO_CARRIER',
        carrierMessageId: data?.request_id || `msg91-${Date.now()}`,
        message: `OTP SMS delivered via MSG91 to customer mobile (${masked}).`,
      };
    } else {
      const errorDetail = data?.message || `MSG91 delivery rejected (Status ${response.status}).`;
      console.warn(`[OTP Server] MSG91 delivery rejected: ${errorDetail}`);
      return {
        sent: false,
        provider: 'MSG91',
        status: 'FAILED',
        message: 'OTP could not be sent. Please verify the mobile number or try again later.',
      };
    }
  } catch (err: any) {
    console.log(`[OTP Server] Provider: MSG91`);
    console.log(`[OTP Server] Phone: ${masked}`);
    console.log(`[OTP Server] Sent: false`);
    console.warn(`[OTP Server] MSG91 network error:`, err?.message);
    return {
      sent: false,
      provider: 'MSG91',
      status: 'FAILED',
      message: 'OTP could not be sent. Please verify the mobile number or try again later.',
    };
  }
}

/**
 * Resends an OTP via official MSG91 Retry API (GET https://control.msg91.com/api/v5/otp/retry).
 * Falls back to sendMsg91Otp if retry quota is exceeded.
 */
export async function resendMsg91Otp(
  recipientPhone: string,
  options?: { otp?: string }
): Promise<SmsDeliveryResult> {
  const config = getSmsProviderConfig();
  const masked = maskMobileNumber(recipientPhone);

  if (!config.isConfigured) {
    console.log(`[OTP Server] Provider: MSG91`);
    console.log(`[OTP Server] Phone: ${masked}`);
    console.log(`[OTP Server] Sent: false`);
    const missingSummary = config.missingConfig?.join(', ') || 'MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID';
    return {
      sent: false,
      provider: 'None',
      status: 'PROVIDER_NOT_CONFIGURED',
      message: `SMS provider is not configured. Missing environment variables: ${missingSummary}.`,
    };
  }

  const authKey = getEnvWithFallbacks('MSG91_AUTH_KEY', ['MSG91_KEY', 'AUTH_KEY'])!;
  const msg91Mobile = formatMsg91Phone(recipientPhone);

  try {
    const url = new URL('https://control.msg91.com/api/v5/otp/retry');
    url.searchParams.set('mobile', msg91Mobile);
    url.searchParams.set('retrytype', 'text');
    url.searchParams.set('authkey', authKey);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        authkey: authKey,
        Accept: 'application/json',
      },
    });

    const data = await response.json().catch(() => ({}));
    const isSuccess = Boolean(response.ok && data?.type === 'success');

    if (isSuccess) {
      console.log(`[OTP Server] Provider: MSG91`);
      console.log(`[OTP Server] Phone: ${masked}`);
      console.log(`[OTP Server] Sent: true`);
      return {
        sent: true,
        provider: 'MSG91',
        status: 'DELIVERED_TO_CARRIER',
        carrierMessageId: data?.request_id || `msg91-retry-${Date.now()}`,
        message: `OTP SMS resent via MSG91 to customer mobile (${masked}).`,
      };
    } else {
      // If retry is disallowed (e.g. max retries or no existing request), fall back to fresh Send OTP
      console.log(`[OTP Server] MSG91 retry reported: ${data?.message || 'retry failed'}. Attempting fresh OTP dispatch...`);
      return await sendMsg91Otp(recipientPhone, options);
    }
  } catch (err: any) {
    console.log(`[OTP Server] Provider: MSG91`);
    console.log(`[OTP Server] Phone: ${masked}`);
    console.log(`[OTP Server] Sent: false`);
    console.warn(`[OTP Server] MSG91 retry network error:`, err?.message);
    // Fallback to fresh send
    return await sendMsg91Otp(recipientPhone, options);
  }
}

/**
 * Verifies submitted OTP via official MSG91 Verify API:
 * GET https://control.msg91.com/api/v5/otp/verify?otp=...&mobile=...
 *
 * Headers: authkey: <MSG91_AUTH_KEY>
 *
 * Returns verification result. Never logs Auth Key or actual OTP.
 */
export async function verifyMsg91Otp(
  recipientPhone: string,
  otp: string
): Promise<{ success: boolean; message: string; isExpired?: boolean }> {
  const config = getSmsProviderConfig();
  const masked = maskMobileNumber(recipientPhone);

  console.log(`[OTP Server] Provider: MSG91`);
  console.log(`[OTP Server] Phone: ${masked}`);

  if (!config.isConfigured) {
    return {
      success: false,
      message: 'MSG91 is not configured. Missing environment variables: MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID.',
    };
  }

  const authKey = getEnvWithFallbacks('MSG91_AUTH_KEY', ['MSG91_KEY', 'AUTH_KEY'])!;
  const msg91Mobile = formatMsg91Phone(recipientPhone);

  try {
    const url = new URL('https://control.msg91.com/api/v5/otp/verify');
    url.searchParams.set('otp', otp.trim());
    url.searchParams.set('mobile', msg91Mobile);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        authkey: authKey,
        Accept: 'application/json',
      },
    });

    const data = await response.json().catch(() => ({}));
    const messageLower = String(data?.message || '').toLowerCase();

    // MSG91 returns type: 'success' and message: 'number_verified_successfully' or 'OTP verified success'
    const isSuccess = Boolean(
      response.ok &&
      data?.type === 'success' &&
      !messageLower.includes('not match') &&
      !messageLower.includes('expired') &&
      !messageLower.includes('invalid')
    );

    const isExpired = Boolean(messageLower.includes('expired'));

    return {
      success: isSuccess,
      message: isSuccess
        ? 'OTP Verified. Order completed.'
        : isExpired
        ? 'OTP expired. Please send a new OTP.'
        : 'Invalid OTP.',
      isExpired,
    };
  } catch (err: any) {
    console.warn(`[OTP Server] MSG91 verify network error:`, err?.message);
    return {
      success: false,
      message: 'Invalid OTP.',
    };
  }
}

/**
 * Dispatches an OTP SMS via MSG91 (Order Handover).
 */
export async function dispatchOtpSms(
  recipientPhone: string,
  otp: string,
  _contextId: string,
  options?: { purpose?: 'order' | 'registration'; customMessage?: string }
): Promise<SmsDeliveryResult> {
  return sendMsg91Otp(recipientPhone, { otp, purpose: options?.purpose || 'order' });
}
