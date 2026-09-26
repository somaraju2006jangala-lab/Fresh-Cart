/**
 * Isolated SMS / OTP Delivery Provider Module
 *
 * Supports live carrier delivery via:
 * 1. Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
 * 2. Fast2SMS for India (FAST2SMS_API_KEY)
 * 3. Generic SMS Gateway (SMS_GATEWAY_URL, optional SMS_GATEWAY_API_KEY)
 *
 * If credentials are not present, it strictly does NOT pretend that an SMS was sent,
 * does NOT create fake SMS logs, and clearly identifies the missing provider configuration.
 */

export interface SmsProviderConfig {
  providerName: string;
  isConfigured: boolean;
  activeProvider?: 'twilio' | 'fast2sms' | 'generic';
  missingConfig?: string[];
}

export interface SmsDeliveryResult {
  sent: boolean;
  provider: string;
  status: 'DELIVERED_TO_CARRIER' | 'PROVIDER_NOT_CONFIGURED' | 'FAILED';
  carrierMessageId?: string;
  message: string;
}

/**
 * Normalizes phone numbers to standard E.164 (+91XXXXXXXXXX for 10-digit Indian numbers)
 */
export function formatE164Phone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
  return `+${cleaned}`;
}

/**
 * Extracts pure 10-digit phone for Indian national gateways like Fast2SMS
 */
export function extract10DigitPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/**
 * Checks environment variables for real SMS provider credentials.
 */
export function getSmsProviderConfig(): SmsProviderConfig {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  const gatewayUrl = process.env.SMS_GATEWAY_URL;

  // Check Fast2SMS
  if (fast2smsKey && fast2smsKey.trim()) {
    return {
      providerName: 'Fast2SMS',
      isConfigured: true,
      activeProvider: 'fast2sms',
    };
  }

  // Check Twilio
  const hasTwilioPartial = Boolean(twilioSid || twilioAuthToken || twilioPhone);
  if (twilioSid && twilioAuthToken && twilioPhone) {
    return {
      providerName: 'Twilio',
      isConfigured: true,
      activeProvider: 'twilio',
    };
  }

  // Check Generic Webhook
  if (gatewayUrl && gatewayUrl.trim()) {
    return {
      providerName: 'Custom SMS Gateway',
      isConfigured: true,
      activeProvider: 'generic',
    };
  }

  const missing: string[] = [];
  if (hasTwilioPartial) {
    if (!twilioSid) missing.push('TWILIO_ACCOUNT_SID');
    if (!twilioAuthToken) missing.push('TWILIO_AUTH_TOKEN');
    if (!twilioPhone) missing.push('TWILIO_PHONE_NUMBER');
  } else {
    missing.push('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', '(or FAST2SMS_API_KEY)');
  }

  return {
    providerName: 'Unconfigured SMS Provider',
    isConfigured: false,
    missingConfig: missing,
  };
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

  // 1. FAST2SMS PROVIDER
  if (config.activeProvider === 'fast2sms') {
    try {
      const apiKey = process.env.FAST2SMS_API_KEY!;
      const phone10 = extract10DigitPhone(recipientPhone);

      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
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

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.return === true) {
        return {
          sent: true,
          provider: 'Fast2SMS',
          status: 'DELIVERED_TO_CARRIER',
          carrierMessageId: data.request_id || `f2s-${Date.now()}`,
          message: `OTP SMS dispatched to customer mobile (${phone10}).`,
        };
      } else {
        return {
          sent: false,
          provider: 'Fast2SMS',
          status: 'FAILED',
          message: Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Fast2SMS delivery rejected.'),
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

  // 2. TWILIO PROVIDER
  if (config.activeProvider === 'twilio') {
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID!;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN!;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER!;
      const e164Phone = formatE164Phone(recipientPhone);

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');

      const params = new URLSearchParams();
      params.append('To', e164Phone);
      params.append('From', twilioPhone);
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
        return {
          sent: false,
          provider: 'Twilio',
          status: 'FAILED',
          message: data.message || `Twilio dispatch rejected (Status ${response.status}).`,
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

  // 3. GENERIC CUSTOM SMS GATEWAY
  if (config.activeProvider === 'generic') {
    try {
      const gatewayUrl = process.env.SMS_GATEWAY_URL!;
      const apiKey = process.env.SMS_GATEWAY_API_KEY;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(gatewayUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: recipientPhone,
          message: smsBody,
          otp,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        return {
          sent: true,
          provider: 'Custom SMS Gateway',
          status: 'DELIVERED_TO_CARRIER',
          carrierMessageId: data.id || `gw-${Date.now()}`,
          message: 'OTP SMS delivered to custom gateway.',
        };
      } else {
        return {
          sent: false,
          provider: 'Custom SMS Gateway',
          status: 'FAILED',
          message: data.message || `Gateway returned HTTP ${response.status}.`,
        };
      }
    } catch (err: any) {
      return {
        sent: false,
        provider: 'Custom SMS Gateway',
        status: 'FAILED',
        message: err.message || 'Custom gateway network request failed.',
      };
    }
  }

  // 4. UNCONFIGURED
  return {
    sent: false,
    provider: 'None (Unconfigured)',
    status: 'PROVIDER_NOT_CONFIGURED',
    message: `SMS provider is not configured. Missing environment variables: ${config.missingConfig?.join(', ')}. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER or FAST2SMS_API_KEY in Vercel / .env.`,
  };
}
