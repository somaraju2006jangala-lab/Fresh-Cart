/**
 * Isolated SMS / OTP Delivery Provider Module
 *
 * This module isolates the SMS provider integration so a real carrier or gateway
 * (e.g., Twilio, AWS SNS, Fast2SMS) can be plugged in via environment variables.
 *
 * If credentials are not present, it strictly does NOT pretend that an SMS was sent,
 * does NOT create fake SMS logs, and clearly identifies the missing provider configuration.
 */

export interface SmsProviderConfig {
  providerName: string;
  isConfigured: boolean;
  missingConfig?: string[];
}

export interface SmsDeliveryResult {
  sent: boolean;
  provider: string;
  status: 'DELIVERED_TO_CARRIER' | 'PROVIDER_NOT_CONFIGURED' | 'FAILED';
  carrierMessageId?: string;
  message: string;
}

export interface SmsProvider {
  getConfig(): SmsProviderConfig;
  sendOtp(recipientPhone: string, otp: string, orderId: string): Promise<SmsDeliveryResult>;
}

/**
 * Checks environment variables for real SMS provider credentials.
 */
export function getSmsProviderConfig(): SmsProviderConfig {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  const missing: string[] = [];
  if (!twilioSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!twilioAuthToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!twilioPhone) missing.push('TWILIO_PHONE_NUMBER');

  const isConfigured = missing.length === 0;

  return {
    providerName: isConfigured ? 'Twilio' : 'Unconfigured SMS Provider',
    isConfigured,
    missingConfig: isConfigured ? undefined : missing,
  };
}

/**
 * Dispatches an OTP via the configured live SMS provider.
 * If unconfigured, cleanly returns unconfigured status without faking delivery.
 */
export async function dispatchOtpSms(
  recipientPhone: string,
  otp: string,
  orderId: string
): Promise<SmsDeliveryResult> {
  const config = getSmsProviderConfig();

  // If real Twilio credentials are configured in .env, dispatch live carrier SMS
  if (config.isConfigured) {
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID!;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN!;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER!;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');

      const params = new URLSearchParams();
      params.append('To', recipientPhone);
      params.append('From', twilioPhone);
      params.append('Body', `Your FreshCart verification code for order ${orderId} is ${otp}. Valid for 10 minutes. Keep this confidential until order handover.`);

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await response.json();
      if (response.ok && data.sid) {
        return {
          sent: true,
          provider: 'Twilio',
          status: 'DELIVERED_TO_CARRIER',
          carrierMessageId: data.sid,
          message: 'OTP SMS delivered to carrier route.',
        };
      } else {
        return {
          sent: false,
          provider: 'Twilio',
          status: 'FAILED',
          message: data.message || 'Twilio carrier dispatch failed.',
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

  // Provider not configured in environment:
  // Strictly do NOT fake an SMS and do NOT pretend delivery succeeded.
  return {
    sent: false,
    provider: 'None (Unconfigured)',
    status: 'PROVIDER_NOT_CONFIGURED',
    message: `SMS provider is not configured. Missing environment variables: ${config.missingConfig?.join(', ')}. Backend OTP architecture is ready for live delivery once credentials are provided in .env.`,
  };
}
