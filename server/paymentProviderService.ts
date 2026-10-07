import crypto from 'crypto';
import {
  findOrderInDb,
  findOrderByPaymentOrTransactionIdInDb,
  getPaymentSettingsFromDb,
  verifyPaymentProofInDb,
} from './db.js';
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
  paymentStatus: 'PAID' | 'PENDING' | 'PAYMENT_PROCESSING' | 'FAILED' | 'REJECTED' | 'PENDING_VERIFICATION';
  orderStatus?: string;
  transactionId: string;
  message?: string;
  error?: string;
}

export interface WebhookResult {
  success: boolean;
  statusCode: number;
  message?: string;
  error?: string;
  orderId?: string;
  paymentStatus?: string;
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
 * - Enforces exact amount match with order total (e.g. ₹239 order -> ₹239 verified).
 * - If real provider verifies payment -> mark PAID, confirm order, update inventory idempotently.
 * - If amount mismatch -> mark REJECTED / VERIFICATION_FAILED, do not confirm order.
 * - If no real provider or unverified -> keep PENDING / PENDING_VERIFICATION.
 */
export async function verifyUpiPaymentWithProvider(orderId: string, transactionId: string): Promise<VerifyPaymentResult> {
  const config = getPhonePeConfig();

  // Find order in DB by ID or transaction ID
  const order = (await findOrderInDb(orderId)) ||
    (transactionId ? await findOrderByPaymentOrTransactionIdInDb(transactionId) : null);

  if (!order) {
    return {
      success: false,
      isGatewayConfigured: config.isConfigured,
      verified: false,
      paymentStatus: 'PENDING',
      transactionId,
      error: `Order '${orderId}' not found.`,
    };
  }

  const effectiveOrderId = order.id || order.order_id || orderId;
  const currentPaymentStatus = (order.payment_status || order.paymentStatus || 'PENDING') as string;

  // If already marked PAID in DB, return verified status idempotently
  if (currentPaymentStatus === 'PAID') {
    return {
      success: true,
      isGatewayConfigured: config.isConfigured,
      verified: true,
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      transactionId: transactionId || order.payment_id || order.paymentId || '',
      message: 'Payment verified and order confirmed.',
    };
  }

  // If gateway credentials are configured, query PhonePe PG Status API
  if (config.isConfigured && (transactionId || order.payment_id || order.paymentId)) {
    const txnToQuery = transactionId || order.payment_id || order.paymentId;
    try {
      const endpointPath = `/pg/v1/status/${config.merchantId}/${txnToQuery}`;
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

      if (data?.code === 'PAYMENT_SUCCESS' || data?.data?.responseCode === 'SUCCESS') {
        // Enforce exact payment amount verification (Paise comparison)
        const expectedPaise = Math.round(Number(order.total) * 100);
        const paidPaise = Number(data?.data?.amount);

        if (paidPaise !== expectedPaise) {
          // Reject transaction due to amount mismatch
          await verifyPaymentProofInDb(
            effectiveOrderId,
            'REJECT',
            'PhonePe Status Check',
            `Amount mismatch: expected ₹${order.total} (${expectedPaise} paise), received ${paidPaise} paise.`
          );

          return {
            success: false,
            isGatewayConfigured: true,
            verified: false,
            paymentStatus: 'REJECTED',
            orderStatus: 'REJECTED',
            transactionId: txnToQuery,
            error: `Payment amount mismatch: expected ₹${order.total}, but received ₹${(paidPaise / 100).toFixed(2)}.`,
          };
        }

        // Formally verify order, update payment to PAID, and deduct stock in MySQL/Memory idempotently
        await verifyPaymentProofInDb(
          effectiveOrderId,
          'VERIFY',
          'PhonePe PG Auto-Verify',
          `Verified via PhonePe PG Status API (Txn: ${data?.data?.transactionId || txnToQuery})`
        );

        return {
          success: true,
          isGatewayConfigured: true,
          verified: true,
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          transactionId: txnToQuery,
          message: 'Payment verified successfully via PhonePe Payment Gateway.',
        };
      }

      if (data?.code === 'PAYMENT_PENDING') {
        return {
          success: true,
          isGatewayConfigured: true,
          verified: false,
          paymentStatus: 'PAYMENT_PROCESSING',
          orderStatus: 'PAYMENT_PROCESSING',
          transactionId: txnToQuery,
          message: 'Payment is being processed by bank/gateway.',
        };
      }

      if (data?.code === 'PAYMENT_ERROR' || data?.code === 'PAYMENT_DECLINED') {
        return {
          success: false,
          isGatewayConfigured: true,
          verified: false,
          paymentStatus: 'FAILED',
          orderStatus: 'PAYMENT_FAILED',
          transactionId: txnToQuery,
          message: 'Payment failed or declined at gateway.',
        };
      }
    } catch (err: any) {
      console.warn('[PhonePe PG] Error querying payment status:', err?.message);
    }
  }

  // Without verified gateway confirmation, payment remains PENDING_VERIFICATION
  return {
    success: true,
    isGatewayConfigured: config.isConfigured,
    verified: false,
    paymentStatus: currentPaymentStatus === 'PAID' ? 'PAID' : 'PENDING_VERIFICATION',
    orderStatus: order?.status || 'PAYMENT VERIFICATION PENDING',
    transactionId: transactionId || order.payment_id || order.paymentId || '',
    message: config.isConfigured
      ? 'Payment has not been confirmed by PhonePe Gateway yet.'
      : 'PhonePe PG live credentials not configured. Screenshot upload and Admin verification are required.',
  };
}

/**
 * Handles official asynchronous PhonePe webhook / callback notifications.
 *
 * Rules:
 * 1. Verifies SHA256 signature against PHONEPE_SALT_KEY.
 * 2. Decodes Base64 payload.
 * 3. Identifies the FreshCart order and verifies transaction reference.
 * 4. Strictly checks paid amount against order total (rejects if mismatch).
 * 5. Idempotently marks payment PAID, confirms order, and deducts inventory exactly once.
 */
export async function handlePhonePeWebhook(
  rawBody: any,
  headers: Record<string, any>
): Promise<WebhookResult> {
  const config = getPhonePeConfig();

  // 1. Extract base64 response string
  let responseBase64 = '';
  if (typeof rawBody === 'string') {
    try {
      const parsed = JSON.parse(rawBody);
      responseBase64 = parsed.response || '';
    } catch {
      responseBase64 = rawBody;
    }
  } else if (rawBody && typeof rawBody === 'object') {
    responseBase64 = rawBody.response || '';
  }

  if (!responseBase64) {
    return {
      success: false,
      statusCode: 400,
      error: 'Missing response payload in webhook request.',
    };
  }

  // 2. Verify signature if PhonePe PG credentials are configured
  const xVerify = (headers['x-verify'] || headers['X-VERIFY'] || '') as string;
  if (config.isConfigured) {
    const checksumString = `${responseBase64}${config.saltKey}`;
    const sha256Hash = crypto.createHash('sha256').update(checksumString).digest('hex');
    const expectedChecksum = `${sha256Hash}###${config.saltIndex}`;

    if (xVerify !== expectedChecksum) {
      console.warn('[PhonePe Webhook] Invalid X-VERIFY signature:', { received: xVerify, expected: expectedChecksum });
      return {
        success: false,
        statusCode: 401,
        error: 'Invalid webhook signature (X-VERIFY verification failed).',
      };
    }
  }

  // 3. Decode base64 payload to JSON
  let payload: any = null;
  try {
    const jsonStr = Buffer.from(responseBase64, 'base64').toString('utf-8');
    payload = JSON.parse(jsonStr);
  } catch (err: any) {
    return {
      success: false,
      statusCode: 400,
      error: `Failed to decode webhook payload: ${err?.message}`,
    };
  }

  const merchantTxnId = payload?.data?.merchantTransactionId || '';
  if (!merchantTxnId) {
    return {
      success: false,
      statusCode: 400,
      error: 'Missing merchantTransactionId in webhook payload.',
    };
  }

  // 4. Locate order in FreshCart DB
  const order = await findOrderByPaymentOrTransactionIdInDb(merchantTxnId);
  if (!order) {
    return {
      success: false,
      statusCode: 404,
      error: `Order for transaction '${merchantTxnId}' not found.`,
    };
  }

  const orderId = order.id || order.order_id;
  const isPaymentSuccess = payload?.code === 'PAYMENT_SUCCESS' || payload?.data?.responseCode === 'SUCCESS';

  if (!isPaymentSuccess) {
    await verifyPaymentProofInDb(
      orderId,
      'REJECT',
      'PhonePe Webhook',
      `Payment failed at gateway with code: ${payload?.code || 'UNKNOWN'}`
    );
    return {
      success: true,
      statusCode: 200,
      orderId,
      paymentStatus: 'FAILED',
      message: 'Webhook processed; payment marked FAILED.',
    };
  }

  // 5. Strict Amount Verification: Amount in paise must match order total exactly
  const expectedPaise = Math.round(Number(order.total) * 100);
  const receivedPaise = Number(payload?.data?.amount);

  if (receivedPaise !== expectedPaise) {
    console.warn('[PhonePe Webhook] Amount mismatch:', {
      orderId,
      expectedPaise,
      receivedPaise,
    });
    await verifyPaymentProofInDb(
      orderId,
      'REJECT',
      'PhonePe Webhook',
      `Amount mismatch: expected ₹${order.total} (${expectedPaise} paise), received ${receivedPaise} paise.`
    );
    return {
      success: false,
      statusCode: 400,
      orderId,
      paymentStatus: 'REJECTED',
      error: 'Payment amount mismatch. Order rejected.',
    };
  }

  // 6. Update payment to PAID, confirm order, and deduct inventory (idempotently handled in verifyPaymentProofInDb)
  await verifyPaymentProofInDb(
    orderId,
    'VERIFY',
    'PhonePe Webhook',
    `Verified via PhonePe Webhook (Provider Txn: ${payload?.data?.transactionId || merchantTxnId})`
  );

  return {
    success: true,
    statusCode: 200,
    orderId,
    paymentStatus: 'PAID',
    message: 'Webhook processed successfully; payment verified and order confirmed.',
  };
}

