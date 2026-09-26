/**
 * Isolated SMS / OTP Delivery Provider Module
 *
 * Supports live carrier delivery via:
 * 1. Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
 * 2. Fast2SMS for India (FAST2SMS_API_KEY)
 *
 * If credentials are not present, it strictly does NOT pretend that an SMS was sent,
 * does NOT create fake SMS logs, and clearly identifies the missing provider configuration.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Ensure environment variables are loaded in local development
try {
  dotenv.config({ quiet: true } as any);
  dotenv.config({ path: '.env.local', quiet: true, override: false } as any);
} catch {
  // Ignore in production/serverless environments where dotenv might be unnecessary
}

export interface SmsProviderConfig {
  providerName: 'Twilio' | 'Fast2SMS' | 'None';
  isConfigured: boolean;
  activeProvider?: 'twilio' | 'fast2sms';
  missingConfig?: string[];
}

export interface SmsDeliveryResult {
  sent: boolean;
  provider: 'Twilio' | 'Fast2SMS' | 'None';
  status: 'DELIVERED_TO_CARRIER' | 'PROVIDER_NOT_CONFIGURED' | 'FAILED';
  carrierMessageId?: string;
  message: string;
}

function isPlaceholder(val: string): boolean {
  const lower = val.toLowerCase().trim();
  return (
    lower.startsWith('your_real_') ||
    lower.startsWith('your_') ||
    lower.startsWith('my_') ||
    lower.startsWith('<') ||
    lower.includes('placeholder')
  );
}

/**
 * Cleanly reads an environment variable, trimming whitespace and optional wrapping quotes.
 * Safely ignores placeholder values awaiting real user secrets.
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
  if (!unquoted || isPlaceholder(unquoted)) {
    return undefined;
  }
  return unquoted;
}

/**
 * Normalizes phone numbers to standard E.164 (+91XXXXXXXXXX for 10-digit Indian numbers)
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
 * Extracts pure 10-digit phone for Indian national gateways like Fast2SMS
 */
export function extract10DigitPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
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
 * Checks environment variables for real SMS provider credentials.
 *
 * 1. When the required Twilio variables are available: Provider = Twilio
 * 2. When FAST2SMS_API_KEY is available: Provider = Fast2SMS
 * 3. If neither provider is configured: Provider = None
 *
 * Supports common alias names (e.g. TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM_NUMBER, FAST2SMS_KEY)
 * to prevent variable name mismatches.
 */
export function getSmsProviderConfig(): SmsProviderConfig {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    try {
      const loadNonEmptyEnv = (filePath: string) => {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = dotenv.parse(content);
          for (const [k, v] of Object.entries(parsed)) {
            if (v && v.trim() && !isPlaceholder(v)) {
              process.env[k] = v.trim();
            }
          }
        }
      };
      loadNonEmptyEnv(fileURLToPath(new URL('../.env', import.meta.url)));
      loadNonEmptyEnv(fileURLToPath(new URL('../.env.local', import.meta.url)));
      loadNonEmptyEnv(path.resolve(process.cwd(), '.env'));
      loadNonEmptyEnv(path.resolve(process.cwd(), '.env.local'));
    } catch {
      // ignore
    }
  }

  const twilioSid = getEnvWithFallbacks('TWILIO_ACCOUNT_SID', ['TWILIO_SID']);
  const twilioAuthToken = getEnvWithFallbacks('TWILIO_AUTH_TOKEN', ['TWILIO_TOKEN']);
  const twilioPhone = getEnvWithFallbacks('TWILIO_PHONE_NUMBER', ['TWILIO_FROM_NUMBER', 'TWILIO_NUMBER', 'TWILIO_PHONE']);
  const fast2smsKey = getEnvWithFallbacks('FAST2SMS_API_KEY', ['FAST2SMS_KEY', 'FAST_2_SMS_KEY', 'FAST_2_SMS_API_KEY']);

  // 1. When the required Twilio variables are available: Provider = Twilio
  if (twilioSid && twilioAuthToken && twilioPhone) {
    return {
      providerName: 'Twilio',
      isConfigured: true,
      activeProvider: 'twilio',
    };
  }

  // 2. When FAST2SMS_API_KEY is available: Provider = Fast2SMS
  if (fast2smsKey) {
    return {
      providerName: 'Fast2SMS',
      isConfigured: true,
      activeProvider: 'fast2sms',
    };
  }

  // 3. If neither provider is configured: Provider = None
  const missing: string[] = [];
  const hasTwilioPartial = Boolean(twilioSid || twilioAuthToken || twilioPhone);

  if (hasTwilioPartial) {
    if (!twilioSid) missing.push('TWILIO_ACCOUNT_SID');
    if (!twilioAuthToken) missing.push('TWILIO_AUTH_TOKEN');
    if (!twilioPhone) missing.push('TWILIO_PHONE_NUMBER');
  } else {
    missing.push('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', '(or FAST2SMS_API_KEY)');
  }

  return {
    providerName: 'None',
    isConfigured: false,
    missingConfig: missing,
  };
}

/**
 * Safely inspects the availability of each Twilio environment variable
 * without ever exposing or printing secrets.
 */
export function getSafeEnvStatus(): {
  TWILIO_ACCOUNT_SID: 'configured' | 'missing';
  TWILIO_AUTH_TOKEN: 'configured' | 'missing';
  TWILIO_PHONE_NUMBER: 'configured' | 'missing';
} {
  const twilioSid = getEnvWithFallbacks('TWILIO_ACCOUNT_SID', ['TWILIO_SID']);
  const twilioAuthToken = getEnvWithFallbacks('TWILIO_AUTH_TOKEN', ['TWILIO_TOKEN']);
  const twilioPhone = getEnvWithFallbacks('TWILIO_PHONE_NUMBER', ['TWILIO_FROM_NUMBER', 'TWILIO_NUMBER', 'TWILIO_PHONE']);

  return {
    TWILIO_ACCOUNT_SID: twilioSid ? 'configured' : 'missing',
    TWILIO_AUTH_TOKEN: twilioAuthToken ? 'configured' : 'missing',
    TWILIO_PHONE_NUMBER: twilioPhone ? 'configured' : 'missing',
  };
}

/**
 * Logs safe environment variable statuses conforming to:
 * TWILIO_ACCOUNT_SID: configured / missing
 * TWILIO_AUTH_TOKEN: configured / missing
 * TWILIO_PHONE_NUMBER: configured / missing
 */
export function logSafeEnvStatus(): void {
  const status = getSafeEnvStatus();
  console.log(`[OTP Server] TWILIO_ACCOUNT_SID: ${status.TWILIO_ACCOUNT_SID}`);
  console.log(`[OTP Server] TWILIO_AUTH_TOKEN: ${status.TWILIO_AUTH_TOKEN}`);
  console.log(`[OTP Server] TWILIO_PHONE_NUMBER: ${status.TWILIO_PHONE_NUMBER}`);
}

/**
 * Dispatches an OTP via the configured live SMS provider.
 * Uses exact customer-facing message:
 * "Your FreshCart order verification OTP is 123456. This OTP is valid for 10 minutes."
 *
 * If unconfigured or provider rejects, returns sent: false without faking delivery.
 */
export async function dispatchOtpSms(
  recipientPhone: string,
  otp: string,
  _orderId: string
): Promise<SmsDeliveryResult> {
  const config = getSmsProviderConfig();
  const smsBody = `Your FreshCart order verification OTP is ${otp}. This OTP is valid for 10 minutes.`;

  // 1. TWILIO PROVIDER
  if (config.activeProvider === 'twilio') {
    try {
      const twilioSid = getEnvWithFallbacks('TWILIO_ACCOUNT_SID', ['TWILIO_SID'])!;
      const twilioAuthToken = getEnvWithFallbacks('TWILIO_AUTH_TOKEN', ['TWILIO_TOKEN'])!;
      const twilioPhone = getEnvWithFallbacks('TWILIO_PHONE_NUMBER', ['TWILIO_FROM_NUMBER', 'TWILIO_NUMBER', 'TWILIO_PHONE'])!;
      const e164Phone = formatE164Phone(recipientPhone);

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');

      const params = new URLSearchParams();
      const fromParam = twilioPhone.startsWith('MG') ? twilioPhone : (twilioPhone.startsWith('+') ? twilioPhone : formatE164Phone(twilioPhone));
      params.append('To', e164Phone);
      params.append('From', fromParam);
      params.append('Body', smsBody);

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.sid) {
        return {
          sent: true,
          provider: 'Twilio',
          status: 'DELIVERED_TO_CARRIER',
          carrierMessageId: data.sid,
          message: `OTP SMS delivered to carrier route for ${e164Phone}.`,
        };
      } else {
        const errorDetail = data.message || `Twilio dispatch rejected (Status ${response.status}).`;
        return {
          sent: false,
          provider: 'Twilio',
          status: 'FAILED',
          message: errorDetail,
        };
      }
    } catch (err: any) {
      return {
        sent: false,
        provider: 'Twilio',
        status: 'FAILED',
        message: err.message || 'Twilio network request error.',
      };
    }
  }

  // 2. FAST2SMS PROVIDER
  if (config.activeProvider === 'fast2sms') {
    try {
      const apiKey = getEnvWithFallbacks('FAST2SMS_API_KEY', ['FAST2SMS_KEY', 'FAST_2_SMS_KEY', 'FAST_2_SMS_API_KEY'])!;
      const phone10 = extract10DigitPhone(recipientPhone);

      // Attempt 1: route 'q' with full custom message
      let response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'q',
          message: smsBody,
          language: 'english',
          flash: 0,
          numbers: phone10,
        }),
      });

      let data = await response.json().catch(() => ({}));

      // If route 'q' rejected (e.g. DND number in India), fallback to transactional 'otp' route
      if (!response.ok || data.return !== true) {
        const fallbackRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            authorization: apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            route: 'otp',
            variables_values: otp,
            numbers: phone10,
          }),
        }).catch(() => null);

        if (fallbackRes && fallbackRes.ok) {
          const fallbackData = await fallbackRes.json().catch(() => ({}));
          if (fallbackData.return === true) {
            response = fallbackRes;
            data = fallbackData;
          }
        }
      }

      if (response.ok && data.return === true) {
        return {
          sent: true,
          provider: 'Fast2SMS',
          status: 'DELIVERED_TO_CARRIER',
          carrierMessageId: data.request_id || `f2s-${Date.now()}`,
          message: `OTP SMS dispatched to customer mobile (${phone10}).`,
        };
      } else {
        const errorDetail = Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Fast2SMS delivery rejected.');
        return {
          sent: false,
          provider: 'Fast2SMS',
          status: 'FAILED',
          message: `Fast2SMS rejected: ${errorDetail}`,
        };
      }
    } catch (err: any) {
      return {
        sent: false,
        provider: 'Fast2SMS',
        status: 'FAILED',
        message: err.message || 'Fast2SMS network connection error.',
      };
    }
  }

  // 3. UNCONFIGURED (Provider = None)
  const missingSummary = config.missingConfig && config.missingConfig.length > 0
    ? config.missingConfig.join(', ')
    : 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, (or FAST2SMS_API_KEY)';

  return {
    sent: false,
    provider: 'None',
    status: 'PROVIDER_NOT_CONFIGURED',
    message: `SMS provider is not configured. Missing environment variables: ${missingSummary}.`,
  };
}
