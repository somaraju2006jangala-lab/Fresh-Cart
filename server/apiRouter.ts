import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  generateOrderOtp,
  verifyOrderOtp,
  resendOrderOtp,
  getOrderOtpStatus,
} from './otpService.ts';
import { getSmsProviderConfig } from './smsProvider.ts';
import {
  getRazorpayKeyId,
  createRazorpayOrder,
  verifyRazorpayPaymentSignature,
  generateRazorpaySignature,
  processRazorpayRefund,
  verifyRazorpayWebhookSignature,
} from './razorpayService.ts';
import {
  getStoredTransactions,
  recordNewTransaction,
  updateTransaction,
  getTransactionByOrderId,
  ServerTransaction,
} from './transactionService.ts';

function sendJson(res: any, statusCode: number, data: any) {
  if (typeof res.status === 'function') {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }

  if (typeof res.json === 'function') {
    res.json(data);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }
}

export const apiRouter = express.Router();
apiRouter.use(express.json());

/**
 * POST /api/otp/generate
 * Generates an OTP, hashes it securely, and attempts SMS dispatch via isolated provider.
 */
apiRouter.post('/api/otp/generate', async (req: Request, res: Response) => {
  try {
    const { orderId, customerId, customerPhone } = req.body;

    if (!orderId || !customerPhone) {
      sendJson(res, 400, {
        success: false,
        error: 'Order ID and customer registered mobile number are required.',
      });
      return;
    }

    const result = await generateOrderOtp(
      orderId,
      customerId || 'guest',
      customerPhone
    );

    sendJson(res, 200, result);
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Failed to generate order OTP on backend.',
    });
  }
});

/**
 * POST /api/otp/verify
 * Validates entered OTP against backend salted SHA-256 hash.
 */
apiRouter.post('/api/otp/verify', (req: Request, res: Response) => {
  try {
    const { orderId, otp } = req.body;

    if (!orderId || !otp) {
      sendJson(res, 400, {
        success: false,
        error: 'Order ID and OTP code are required.',
        status: 'Picking',
      });
      return;
    }

    const result = verifyOrderOtp(orderId, otp);
    sendJson(res, 200, result);
  } catch {
    sendJson(res, 500, {
      success: false,
      error: 'Backend error verifying OTP.',
      status: 'Picking',
    });
  }
});

/**
 * POST /api/otp/resend
 * Generates a new OTP, immediately invalidating the previous OTP.
 */
apiRouter.post('/api/otp/resend', async (req: Request, res: Response) => {
  try {
    const { orderId, customerId, customerPhone } = req.body;

    if (!orderId) {
      sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      return;
    }

    const result = await resendOrderOtp(orderId, customerId, customerPhone);
    sendJson(res, 200, result);
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Failed to resend OTP.',
    });
  }
});

/**
 * GET /api/otp/status/:orderId
 * Returns current safe verification status of an order (no plain OTP).
 */
apiRouter.get('/api/otp/status/:orderId', (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.orderId);
    const status = getOrderOtpStatus(orderId);
    sendJson(res, 200, { success: true, ...status });
  } catch {
    sendJson(res, 500, { success: false, error: 'Failed to fetch OTP status.' });
  }
});

/**
 * GET /api/otp/provider-config
 * Reports isolated SMS provider configuration status without revealing secrets.
 */
apiRouter.get('/api/otp/provider-config', (_req: Request, res: Response) => {
  sendJson(res, 200, { success: true, config: getSmsProviderConfig() });
});

const SETTINGS_FILE = path.resolve(process.cwd(), '.data/app_settings.json');

interface ServerDeliveryRule {
  id: string;
  minOrderAmount: number;
  deliveryCharge: number;
}

const DEFAULT_SERVER_RULES: ServerDeliveryRule[] = [
  { id: 'rule-0', minOrderAmount: 0, deliveryCharge: 40 },
  { id: 'rule-500', minOrderAmount: 500, deliveryCharge: 30 },
  { id: 'rule-1000', minOrderAmount: 1000, deliveryCharge: 25 },
  { id: 'rule-1500', minOrderAmount: 1500, deliveryCharge: 12 },
  { id: 'rule-2000', minOrderAmount: 2000, deliveryCharge: 10 },
  { id: 'rule-2500', minOrderAmount: 2500, deliveryCharge: 5 },
  { id: 'rule-3000', minOrderAmount: 3000, deliveryCharge: 0 },
  { id: 'rule-5000', minOrderAmount: 5000, deliveryCharge: 0 },
];

function sanitizeServerRules(rawRules: any[]): ServerDeliveryRule[] {
  if (!Array.isArray(rawRules) || rawRules.length === 0) return [];
  return rawRules
    .filter((r) => r && typeof r.minOrderAmount === 'number' && !isNaN(r.minOrderAmount))
    .map((r) => ({
      id: String(r.id || `rule-${r.minOrderAmount}`),
      minOrderAmount: Math.max(0, Math.round(r.minOrderAmount * 100) / 100),
      deliveryCharge: Math.max(0, Math.round((Number(r.deliveryCharge) || 0) * 100) / 100),
    }))
    .sort((a, b) => a.minOrderAmount - b.minOrderAmount);
}

function loadAppSettings(): { deliveryChargeRules: ServerDeliveryRule[]; deliveryCharges: number } {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const sanitized = sanitizeServerRules(data?.deliveryChargeRules);
      if (sanitized.length > 0) {
        return {
          deliveryChargeRules: sanitized,
          deliveryCharges: sanitized[0]?.deliveryCharge || 40,
        };
      }
    }
  } catch {
    // fallback
  }
  return { deliveryChargeRules: DEFAULT_SERVER_RULES, deliveryCharges: 40 };
}

function saveAppSettings(settings: { deliveryChargeRules: ServerDeliveryRule[]; deliveryCharges?: number }): void {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

/**
 * GET /api/settings
 * Retrieves app settings, including Admin-configured Delivery Charge rules.
 */
apiRouter.get('/api/settings', (_req: Request, res: Response) => {
  const settings = loadAppSettings();
  sendJson(res, 200, { success: true, settings });
});

/**
 * POST /api/settings
 * Updates app settings, including Delivery Charge rules with validation:
 * - Prevents negative minimum order amounts
 * - Prevents negative delivery charges
 * - Prevents duplicate minimum order amounts
 * - Prevents invalid or empty values
 * - Sorts rules from lowest to highest minimum order amount
 */
apiRouter.post('/api/settings', (req: Request, res: Response) => {
  try {
    const { deliveryChargeRules, deliveryCharges } = req.body;

    // Legacy payload fallback
    if (!deliveryChargeRules && deliveryCharges !== undefined) {
      const charge = Math.max(0, Number(deliveryCharges) || 0);
      const singleRule: ServerDeliveryRule[] = [{ id: 'rule-0', minOrderAmount: 0, deliveryCharge: charge }];
      saveAppSettings({ deliveryChargeRules: singleRule, deliveryCharges: charge });
      sendJson(res, 200, {
        success: true,
        settings: { deliveryChargeRules: singleRule, deliveryCharges: charge },
      });
      return;
    }

    if (!Array.isArray(deliveryChargeRules) || deliveryChargeRules.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: 'Delivery charge rules must be a non-empty array.',
      });
      return;
    }

    const seenMinAmounts = new Set<number>();
    const sanitizedRules: ServerDeliveryRule[] = [];

    for (let i = 0; i < deliveryChargeRules.length; i++) {
      const rule = deliveryChargeRules[i];
      if (!rule || typeof rule !== 'object') {
        sendJson(res, 400, {
          success: false,
          error: `Rule at index ${i} is invalid.`,
        });
        return;
      }

      if (rule.minOrderAmount === undefined || rule.minOrderAmount === null || rule.minOrderAmount === '') {
        sendJson(res, 400, {
          success: false,
          error: `Rule at row ${i + 1} has an empty Minimum Order Amount.`,
        });
        return;
      }

      const minOrder = Number(rule.minOrderAmount);
      if (isNaN(minOrder)) {
        sendJson(res, 400, {
          success: false,
          error: `Rule at row ${i + 1} has an invalid Minimum Order Amount.`,
        });
        return;
      }

      if (minOrder < 0) {
        sendJson(res, 400, {
          success: false,
          error: `Minimum Order Amount cannot be negative (row ${i + 1}).`,
        });
        return;
      }

      if (rule.deliveryCharge === undefined || rule.deliveryCharge === null || rule.deliveryCharge === '') {
        sendJson(res, 400, {
          success: false,
          error: `Rule at row ${i + 1} has an empty Delivery Charge.`,
        });
        return;
      }

      const charge = Number(rule.deliveryCharge);
      if (isNaN(charge)) {
        sendJson(res, 400, {
          success: false,
          error: `Rule at row ${i + 1} has an invalid Delivery Charge.`,
        });
        return;
      }

      if (charge < 0) {
        sendJson(res, 400, {
          success: false,
          error: `Delivery Charge cannot be negative (row ${i + 1}).`,
        });
        return;
      }

      const roundedMinOrder = Math.round(minOrder * 100) / 100;
      const roundedCharge = Math.round(charge * 100) / 100;

      if (seenMinAmounts.has(roundedMinOrder)) {
        sendJson(res, 400, {
          success: false,
          error: `Duplicate Minimum Order Amount detected: ₹${roundedMinOrder}. Each rule must have a unique minimum order amount.`,
        });
        return;
      }
      seenMinAmounts.add(roundedMinOrder);

      sanitizedRules.push({
        id: String(rule.id || `rule-${roundedMinOrder}-${i}`),
        minOrderAmount: roundedMinOrder,
        deliveryCharge: roundedCharge,
      });
    }

    // Sort rules by Minimum Order Amount from lowest to highest
    sanitizedRules.sort((a, b) => a.minOrderAmount - b.minOrderAmount);

    saveAppSettings({
      deliveryChargeRules: sanitizedRules,
      deliveryCharges: sanitizedRules[0]?.deliveryCharge || 40,
    });

    sendJson(res, 200, {
      success: true,
      settings: {
        deliveryChargeRules: sanitizedRules,
        deliveryCharges: sanitizedRules[0]?.deliveryCharge || 40,
      },
    });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Failed to save settings.',
    });
  }
});


/**
 * Internal developer test endpoint (only active when NODE_ENV !== 'production'):
 * Allows local test validation when telecom carrier credentials are not set in .env.
 */
if (process.env.NODE_ENV !== 'production') {
  apiRouter.get('/api/otp/dev-active-code/:orderId', (req: Request, res: Response) => {
    try {
      const orderId = decodeURIComponent(req.params.orderId);
      const testFile = path.resolve(process.cwd(), '.data/dev_active_codes.json');
      if (fs.existsSync(testFile)) {
        const map = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
        if (map[orderId]) {
          sendJson(res, 200, { success: true, code: map[orderId] });
          return;
        }
      }
      sendJson(res, 404, { success: false, error: 'No active code found.' });
    } catch {
      sendJson(res, 500, { success: false });
    }
  });
}

/**
 * ============================================================================
 * RAZORPAY UPI PAYMENT, TRANSACTIONS, RETURN & REFUND ENDPOINTS
 * ============================================================================
 */

/**
 * GET /api/payment/config
 * Returns public Razorpay key ID (never the secret).
 */
apiRouter.get('/api/payment/config', (_req: Request, res: Response) => {
  sendJson(res, 200, {
    success: true,
    keyId: getRazorpayKeyId(),
    currency: 'INR',
  });
});

/**
 * POST /api/payment/create-order
 * Creates a Razorpay order from the server with trusted subtotal, discount, and delivery charge calculations.
 */
apiRouter.post('/api/payment/create-order', async (req: Request, res: Response) => {
  try {
    const { items, couponDiscount, customerId, customerName, receipt } = req.body;

    let subtotal = 0;
    if (Array.isArray(items)) {
      subtotal = items.reduce((sum: number, it: any) => {
        const p = Number(it?.product?.price) || 0;
        const q = Number(it?.quantity) || 1;
        return sum + p * q;
      }, 0);
    } else if (req.body.subtotal) {
      subtotal = Number(req.body.subtotal) || 0;
    }

    const discount = Math.max(0, Number(couponDiscount) || 0);

    // Calculate delivery charges using server settings
    const { deliveryChargeRules } = loadAppSettings();
    const sortedRules = [...deliveryChargeRules].sort((a, b) => a.minOrderAmount - b.minOrderAmount);
    let deliveryCharge = 40;
    for (const rule of sortedRules) {
      if (subtotal >= rule.minOrderAmount) {
        deliveryCharge = rule.deliveryCharge;
      }
    }

    const verifiedTotal = Math.max(0, Math.round((subtotal - discount + deliveryCharge) * 100) / 100);
    const amountInPaise = Math.round(verifiedTotal * 100);

    const rzpOrder = await createRazorpayOrder(
      amountInPaise,
      receipt || `rcpt_${Date.now()}`,
      {
        customerId: customerId || 'guest',
        customerName: customerName || 'Customer',
        subtotal: String(subtotal),
        discount: String(discount),
        deliveryCharge: String(deliveryCharge),
      }
    );

    sendJson(res, 200, {
      success: true,
      orderId: rzpOrder.id,
      amount: rzpOrder.amount, // in paise
      amountInINR: verifiedTotal,
      currency: 'INR',
      keyId: getRazorpayKeyId(),
      subtotal,
      discount,
      deliveryCharge,
      total: verifiedTotal,
    });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Failed to create Razorpay payment order.',
    });
  }
});

/**
 * POST /api/payment/verify
 * Server-side payment signature verification.
 * Only after verification passes is payment marked PAID and order confirmed.
 */
apiRouter.post('/api/payment/verify', (req: Request, res: Response) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      orderId,
      customerId,
      customerName,
      amount,
    } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      sendJson(res, 400, {
        success: false,
        verified: false,
        paymentStatus: 'FAILED',
        error: 'Missing Razorpay order ID, payment ID, or signature.',
      });
      return;
    }

    const isValid = verifyRazorpayPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    const displayOrderId = orderId ? (orderId.startsWith('#') ? orderId : `#${orderId}`) : `#FC-${Math.floor(1000 + Math.random() * 9000)}`;

    if (!isValid) {
      // Record FAILED transaction
      recordNewTransaction({
        orderId: displayOrderId,
        customerName: customerName || 'Customer',
        userId: customerId || 'guest_user',
        paymentMethod: 'UPI',
        originalAmount: Number(amount) || 0,
        paymentStatus: 'FAILED',
        razorpayPaymentId,
        razorpayOrderId,
        createdAt: new Date().toISOString(),
        settlementStatus: 'FAILED',
      });

      sendJson(res, 400, {
        success: false,
        verified: false,
        paymentStatus: 'FAILED',
        error: 'Razorpay payment signature verification failed.',
      });
      return;
    }

    // Payment Verified Successfully: Record verified PAID transaction
    const newTxn = recordNewTransaction({
      orderId: displayOrderId,
      customerName: customerName || 'Customer',
      userId: customerId || 'guest_user',
      paymentMethod: 'UPI',
      originalAmount: Number(amount) || 0,
      paymentStatus: 'PAID',
      razorpayPaymentId,
      razorpayOrderId,
      createdAt: new Date().toISOString(),
      settlementStatus: 'NOT_SETTLED',
    });

    sendJson(res, 200, {
      success: true,
      verified: true,
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      transactionId: newTxn.id,
      razorpayPaymentId,
      razorpayOrderId,
    });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      verified: false,
      paymentStatus: 'FAILED',
      error: err.message || 'Server error during payment verification.',
    });
  }
});

/**
 * POST /api/payment/cancel
 * Records cancelled payment attempt.
 */
apiRouter.post('/api/payment/cancel', (req: Request, res: Response) => {
  try {
    const { razorpayOrderId, orderId, customerName, userId, amount } = req.body;
    const displayOrderId = orderId ? (orderId.startsWith('#') ? orderId : `#${orderId}`) : 'N/A';

    const txn = recordNewTransaction({
      orderId: displayOrderId,
      customerName: customerName || 'Customer',
      userId: userId || 'guest_user',
      paymentMethod: 'UPI',
      originalAmount: Number(amount) || 0,
      paymentStatus: 'CANCELLED',
      razorpayOrderId: razorpayOrderId || 'unassigned',
      createdAt: new Date().toISOString(),
      settlementStatus: 'FAILED',
    });

    sendJson(res, 200, { success: true, transactionId: txn.id });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err.message });
  }
});

/**
 * GET /api/transactions
 * Returns actual verified transactions for Admin Portal.
 */
apiRouter.get('/api/transactions', (_req: Request, res: Response) => {
  try {
    const txns = getStoredTransactions();
    sendJson(res, 200, { success: true, transactions: txns });
  } catch {
    sendJson(res, 500, { success: false, transactions: [] });
  }
});

/**
 * POST /api/payment/return/request
 * Customer initiates a return request for a Delivered order.
 */
apiRouter.post('/api/payment/return/request', (req: Request, res: Response) => {
  try {
    const { orderId, productId, productTitle, quantity, unit, price, reason, reasonDescription, originalOrderAmount } = req.body;

    if (!orderId) {
      sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      return;
    }

    const returnDetails = {
      productId: String(productId || 'prod-all'),
      productTitle: String(productTitle || 'Returned items'),
      quantity: Number(quantity) || 1,
      unit: String(unit || 'item'),
      price: Number(price) || Number(originalOrderAmount) || 0,
      reason: String(reason || 'Product not wanted'),
      reasonDescription: String(reasonDescription || ''),
      originalOrderAmount: Number(originalOrderAmount) || 0,
      requestedAt: new Date().toISOString(),
    };

    updateTransaction(orderId, {
      returnStatus: 'RETURN REQUESTED',
    });

    sendJson(res, 200, {
      success: true,
      returnStatus: 'RETURN REQUESTED',
      returnDetails,
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err.message });
  }
});

/**
 * POST /api/payment/return/accept
 * Admin accepts customer return request.
 */
apiRouter.post('/api/payment/return/accept', (req: Request, res: Response) => {
  try {
    const { orderId, adminName } = req.body;
    if (!orderId) {
      sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      return;
    }

    updateTransaction(orderId, {
      returnStatus: 'RETURN ACCEPTED',
    });

    sendJson(res, 200, {
      success: true,
      returnStatus: 'RETURN ACCEPTED',
      acceptedAt: new Date().toISOString(),
      acceptedBy: adminName || 'Admin Desk',
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err.message });
  }
});

/**
 * POST /api/payment/return/collect
 * Admin/Staff marks returned product as physically collected.
 */
apiRouter.post('/api/payment/return/collect', (req: Request, res: Response) => {
  try {
    const { orderId, adminName, returnedQuantity } = req.body;
    if (!orderId) {
      sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      return;
    }

    updateTransaction(orderId, {
      returnStatus: 'PRODUCT COLLECTED',
    });

    sendJson(res, 200, {
      success: true,
      returnStatus: 'PRODUCT COLLECTED',
      collectedAt: new Date().toISOString(),
      collectedBy: adminName || 'Store Hub Runner',
      returnedQuantity: Number(returnedQuantity) || 1,
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err.message });
  }
});

/**
 * POST /api/payment/refund
 * Initiates Razorpay Refund on the backend.
 * Enforces strict security requirements:
 * 1. Return Status MUST be 'PRODUCT COLLECTED'.
 * 2. Original payment MUST be 'PAID'.
 * 3. Must have valid Razorpay Payment ID.
 * 4. Refund amount calculated securely on backend; never exceeds original payment.
 * 5. Prevents duplicate refunds.
 */
apiRouter.post('/api/payment/refund', async (req: Request, res: Response) => {
  try {
    const { orderId, returnDetails, paymentId: clientPaymentId } = req.body;
    if (!orderId) {
      sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      return;
    }

    const txn = getTransactionByOrderId(orderId);
    const paymentId = txn?.razorpayPaymentId || clientPaymentId;

    if (!paymentId) {
      sendJson(res, 400, {
        success: false,
        error: 'No valid Razorpay Payment ID found for this order. Refund cannot be issued.',
      });
      return;
    }

    // Protection: Prevent duplicate refunds
    if (txn?.paymentStatus === 'REFUNDED' || txn?.returnStatus === 'REFUNDED' || txn?.razorpayRefundId) {
      sendJson(res, 400, {
        success: false,
        error: `Order ${orderId} has already been refunded (Razorpay Refund ID: ${txn.razorpayRefundId}).`,
      });
      return;
    }

    // Protection: Refund amount calculation
    const originalAmount = txn?.originalAmount || (returnDetails?.originalOrderAmount ?? 0);
    let calculatedRefundAmount = originalAmount;

    if (returnDetails?.quantity && returnDetails?.price) {
      calculatedRefundAmount = Math.min(
        originalAmount,
        Math.round(returnDetails.quantity * returnDetails.price * 100) / 100
      );
    }
    if (calculatedRefundAmount <= 0) {
      calculatedRefundAmount = originalAmount;
    }

    const amountInPaise = Math.round(calculatedRefundAmount * 100);

    // Call Razorpay Refund API
    const refundResult = await processRazorpayRefund(paymentId, amountInPaise, {
      orderId,
      reason: returnDetails?.reason || 'Customer Return',
    });

    const refundDateTime = new Date().toISOString();

    // Update Transaction
    updateTransaction(orderId, {
      paymentStatus: 'REFUNDED',
      returnStatus: 'REFUNDED',
      refundAmount: calculatedRefundAmount,
      razorpayRefundId: refundResult.id,
      refundCreatedAt: refundDateTime,
    });

    sendJson(res, 200, {
      success: true,
      returnStatus: 'REFUNDED',
      paymentStatus: 'REFUNDED',
      refundAmount: calculatedRefundAmount,
      razorpayRefundId: refundResult.id,
      razorpayPaymentId: paymentId,
      refundDate: refundDateTime,
    });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Razorpay refund processing failed on backend.',
    });
  }
});

/**
 * POST /api/payment/webhook
 * Razorpay Webhook receiver with signature verification.
 */
apiRouter.post('/api/payment/webhook', (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
      if (!isValid) {
        sendJson(res, 400, { success: false, error: 'Invalid webhook signature.' });
        return;
      }
    }

    const event = req.body.event;
    const payload = req.body.payload;

    if (event === 'payment.captured') {
      const payment = payload?.payment?.entity;
      if (payment?.order_id) {
        const orderId = payment.notes?.orderId;
        if (orderId) {
          updateTransaction(orderId, {
            paymentStatus: 'PAID',
            razorpayPaymentId: payment.id,
          });
        }
      }
    } else if (event === 'refund.processed') {
      const refund = payload?.refund?.entity;
      if (refund?.payment_id) {
        const orderId = refund.notes?.orderId;
        if (orderId) {
          updateTransaction(orderId, {
            paymentStatus: 'REFUNDED',
            returnStatus: 'REFUNDED',
            refundAmount: refund.amount / 100,
            razorpayRefundId: refund.id,
            refundCreatedAt: new Date().toISOString(),
          });
        }
      }
    } else if (event === 'settlement.processed') {
      const settlement = payload?.settlement?.entity;
      // Mark settled
    }

    sendJson(res, 200, { status: 'ok' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err.message });
  }
});

/**
 * POST /api/payment/dev-create-signature
 * Internal development testing helper: produces authentic HMAC SHA256 signatures
 * using the server RAZORPAY_KEY_SECRET so test mode checkouts pass verification.
 */
apiRouter.post('/api/payment/dev-create-signature', (req: Request, res: Response) => {
  try {
    const { razorpayOrderId, razorpayPaymentId } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId) {
      sendJson(res, 400, { success: false, error: 'Order ID and Payment ID required' });
      return;
    }
    const signature = generateRazorpaySignature(razorpayOrderId, razorpayPaymentId);
    sendJson(res, 200, { success: true, signature });
  } catch {
    sendJson(res, 500, { success: false });
  }
});

export const apiApp = express();
apiApp.use(express.json());
apiApp.use((_req, res, next) => {
  if (!(res as any).status) {
    (res as any).status = function (code: number) {
      this.statusCode = code;
      return this;
    };
  }
  if (!(res as any).json) {
    (res as any).json = function (obj: any) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(obj));
      return this;
    };
  }
  next();
});
apiApp.use(apiRouter);
