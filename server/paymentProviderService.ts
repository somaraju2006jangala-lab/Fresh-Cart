import crypto from 'crypto';
import { findOrderInDb, getPaymentSettingsFromDb, verifyPaymentProofInDb } from './db.js';
import { buildCustomerPaymentUpiUri } from '../src/utils/qrCodeGenerator.js';

export interface PhonePeConfig {
  isConfigured: boolean;
  env: 'SANDBOX' | 'PRODUCTION';
  merchantId: string;
  saltKey: string;
  saltIndex: string;
  callbackUrl?: string;
  missingKeys: string[];
  apiBaseUrl: string;
}

export interface CreateUpiIntentParams {
  orderId: string;
  amount: number;
  customerId?: string;
  customerPhone?: string;
  targetApp?: 'phonepe' | 'gpay' | 'paytm' | 'generic';
}

export interface CreateUpiIntentResult {
  success: boolean;
  isGatewayConfigured: boolean;
  provider: 'PHONEPE_PG';
  transactionId: string;
  intentUri: string;
  targetApp: string;
  requiresAdminVerification: boolean;
  message?: string;
  error?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  isGatewayConfigured: boolean;
  verified: boolean;
  paymentStatus: 'PAID' | 'PENDING' | 'FAILED' | 'REJECTED';
  orderStatus?: string;
  transactionId: string;
  message?: string;
  error?: string;
}

/**
 * Reads and inspects PhonePe Payment Gateway configuration from environment variables.
 * Strictly checks for real provider credentials without inventing mock secrets.
 */
export function getPhonePeConfig(): PhonePeConfig {
  const env = (process.env.PHONEPE_ENV || 'SANDBOX').toUpperCase() === 'PRODUCTION'
    ? 'PRODUCTION'
    : 'SANDBOX';

  const merchantId = (process.env.PHONEPE_MERCHANT_ID || '').trim();
  const saltKey = (process.env.PHONEPE_SALT_KEY || '').trim();
  const saltIndex = (process.env.PHONEPE_SALT_INDEX || '1').trim();
  const callbackUrl = (process.env.PHONEPE_CALLBACK_URL || '').trim();

  const missingKeys: string[] = [];
  if (!merchantId) missingKeys.push('PHONEPE_MERCHANT_ID');
  if (!saltKey) missingKeys.push('PHONEPE_SALT_KEY');

  const isConfigured = missingKeys.length === 0;

  const apiBaseUrl = env === 'PRODUCTION'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

  return {
    isConfigured,
    env,
    merchantId,
    saltKey,
    saltIndex,
    callbackUrl: callbackUrl || undefined,
    missingKeys,
    apiBaseUrl,
  };
}

/**
 * Creates a server-generated UPI Payment Intent.
 *
 * ARCHITECTURE:
 * FreshCart Client
 *   ↓
 * Create payment/order on backend
 *   ↓
 * Generate unique merchant transaction ID
 *   ↓
 * If PhonePe PG credentials configured:
 *   Call PhonePe PG /pg/v1/pay (Signed UPI Intent)
 *   Return PhonePe provider-signed intentUrl
 * Else:
 *   Return standard NPCI UPI URI with development fallback flag
 *   Payment remains PENDING; Screenshot & Admin verification required.
 */
export async function createUpiPaymentIntent(params: CreateUpiIntentParams): Promise<CreateUpiIntentResult> {
  const { orderId, amount, customerId, customerPhone, targetApp = 'phonepe' } = params;
  const config = getPhonePeConfig();

  // 1. Generate unique, stable transaction reference
  const cleanOrderNum = orderId.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '');
  const transactionId = `FC-${cleanOrderNum}-${Date.now().toString(36).slice(-5).toUpperCase()}`;

  // 2. If real PhonePe PG credentials are configured, obtain live server-signed UPI Intent from PhonePe
  if (config.isConfigured) {
    try {
      const amountPaise = Math.round(Math.max(0, amount) * 100);
      const paymentPayload = {
        merchantId: config.merchantId,
        merchantTransactionId: transactionId,
        merchantUserId: customerId || 'GUEST_USER',
        amount: amountPaise,
        redirectUrl: config.callbackUrl || undefined,
        redirectMode: 'POST',
        callbackUrl: config.callbackUrl || undefined,
        mobileNumber: customerPhone ? customerPhone.replace(/\D/g, '').slice(-10) : undefined,
        paymentInstrument: {
          type: 'UPI_INTENT',
          targetApp: targetApp === 'phonepe' ? 'com.phonepe.app' : undefined,
        },
      };

      const base64Payload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
      const checksumString = `${base64Payload}/pg/v1/pay${config.saltKey}`;
      const sha256Hash = crypto.createHash('sha256').update(checksumString).digest('hex');
      const xVerifyHeader = `${sha256Hash}###${config.saltIndex}`;

      const response = await fetch(`${config.apiBaseUrl}/pg/v1/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerifyHeader,
        },
        body: JSON.stringify({ request: base64Payload }),
      });

      const responseData = (await response.json()) as any;

      if (responseData?.success && responseData?.data?.instrumentResponse?.intentUrl) {
        const providerIntentUrl = responseData.data.instrumentResponse.intentUrl;
        return {
          success: true,
          isGatewayConfigured: true,
          provider: 'PHONEPE_PG',
          transactionId,
          intentUri: providerIntentUrl,
          targetApp,
          requiresAdminVerification: false,
          message: 'Server-signed PhonePe UPI intent generated successfully via PhonePe PG.',
        };
      }

      console.warn('[PhonePe PG] API returned non-success response:', responseData);
    } catch (err: any) {
      console.error('[PhonePe PG] Failed to communicate with PhonePe API:', err?.message);
    }
  }

  // 3. Fallback when PhonePe PG credentials are not configured or request failed
  const paymentSettings = await getPaymentSettingsFromDb();
  const fallbackUri = buildCustomerPaymentUpiUri(
    paymentSettings.upiId || 'freshcart@upi',
    paymentSettings.payeeName || 'FreshCart Grocery Store',
    amount,
    transactionId
  );

  return {
    success: true,
    isGatewayConfigured: false,
    provider: 'PHONEPE_PG',
    transactionId,
    intentUri: fallbackUri,
    targetApp,
    requiresAdminVerification: true,
    message: config.missingKeys.length > 0
      ? `PhonePe PG credentials not configured (${config.missingKeys.join(', ')}). Using development fallback URI. Payment requires manual screenshot/admin verification.`
      : 'PhonePe PG live intent failed. Using development fallback URI.',
  };
}

/**
 * Verifies UPI payment status with backend/provider.
 * 
 * Rules:
 * - Never trust client-side redirect alone.
 * - If real provider verifies payment -> mark PAID, confirm order, update inventory.
 * - If no real provider or unverified -> keep PENDING / PENDING_VERIFICATION.
 */
export async function verifyUpiPaymentWithProvider(orderId: string, transactionId: string): Promise<VerifyPaymentResult> {
  const config = getPhonePeConfig();

  // If gateway credentials are configured, query PhonePe PG Status API
  if (config.isConfigured && transactionId) {
    try {
      const endpointPath = `/pg/v1/status/${config.merchantId}/${transactionId}`;
      const checksumString = `${endpointPath}${config.saltKey}`;
      const sha256Hash = crypto.createHash('sha256').update(checksumString).digest('hex');
      const xVerifyHeader = `${sha256Hash}###${config.saltIndex}`;

      const res = await fetch(`${config.apiBaseUrl}${endpointPath}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerifyHeader,
          'X-MERCHANT-ID': config.merchantId,
        },
      });

      const data = (await res.json()) as any;
      if (data?.success && data?.code === 'PAYMENT_SUCCESS') {
        // Formally verify order, update payment to PAID, and deduct stock in MySQL/Memory
        await verifyPaymentProofInDb(orderId, 'VERIFY', 'PhonePe PG Auto-Verify', 'Verified via PhonePe PG Status API');
        return {
          success: true,
          isGatewayConfigured: true,
          verified: true,
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          transactionId,
          message: 'Payment verified successfully via PhonePe Payment Gateway.',
        };
      }
    } catch (err: any) {
      console.warn('[PhonePe PG] Error querying payment status:', err?.message);
    }
  }

  // Without verified gateway confirmation, payment remains PENDING
  const order = await findOrderInDb(orderId);
  const currentPaymentStatus = (order?.payment_status || order?.paymentStatus || 'PENDING') as any;

  return {
    success: true,
    isGatewayConfigured: config.isConfigured,
    verified: currentPaymentStatus === 'PAID',
    paymentStatus: currentPaymentStatus === 'PAID' ? 'PAID' : 'PENDING',
    orderStatus: order?.status || 'PAYMENT VERIFICATION PENDING',
    transactionId,
    message: config.isConfigured
      ? 'Payment has not been confirmed by PhonePe Gateway yet.'
      : 'PhonePe PG live credentials not configured. Screenshot upload and Admin verification are required.',
  };
}
