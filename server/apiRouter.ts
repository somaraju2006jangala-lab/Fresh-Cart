import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  generateOrderOtp,
  verifyOrderOtp,
  resendOrderOtp,
  getOrderOtpStatus,
  getCustomerOrderOtp,
  maskMobileNumber,
  normalizeAndValidateIndianMobile,
} from './otpService.ts';
import { ensureEnvLoaded, getSmsProviderConfig } from './smsProvider.ts';
import { signCustomerToken, verifyCustomerToken } from './jwtHelper.ts';
import {
  checkDatabaseAvailability,
  isProductionEnv,
  upsertOrderInDb,
  findOrdersForCustomerInDb,
  upsertCustomerInDb,
  findCustomerInDb,
} from './db.ts';

ensureEnvLoaded();

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

// Safe body parser: if req.body is already parsed (as on Vercel), do not re-read stream
apiRouter.use((req, res, next) => {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return next();
  }
  express.json()(req, res, next);
});

/**
 * POST /api/otp/generate
 * Generates an OTP, hashes it securely, and stores it on the backend.
 */
apiRouter.post(['/api/otp/generate', '/otp/generate', '/generate'], async (req: Request, res: Response) => {
  try {
    const { orderId, customerId, customerPhone } = req.body || {};

    if (!orderId) {
      sendJson(res, 400, {
        success: false,
        error: 'Order ID is required.',
        message: 'Order ID is required.',
      });
      return;
    }

    const result = await generateOrderOtp(
      orderId,
      customerId || 'guest',
      customerPhone || ''
    );

    sendJson(res, 200, result);
  } catch (err: any) {
    console.error(`[OTP Server] Exception in /api/otp/generate:`, err?.message);
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Failed to generate order OTP on backend.',
    });
  }
});

/**
 * POST /api/otp/verify
 * Validates entered OTP against backend stored Order Handover OTP.
 */
apiRouter.post(['/api/otp/verify', '/otp/verify', '/verify'], async (req: Request, res: Response) => {
  try {
    const { orderId, otp } = req.body || {};

    if (!orderId || !otp) {
      sendJson(res, 400, {
        success: false,
        error: 'Order ID and OTP code are required.',
        status: 'Picking',
      });
      return;
    }

    const result = await verifyOrderOtp(orderId, otp);
    sendJson(res, 200, result);
  } catch (err: any) {
    console.error(`[OTP Server] Exception in /api/otp/verify:`, err?.message);
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
apiRouter.post(['/api/otp/resend', '/otp/resend', '/resend'], async (req: Request, res: Response) => {
  try {
    const { orderId, customerId, customerPhone } = req.body || {};

    if (!orderId) {
      sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      return;
    }

    const result = await resendOrderOtp(orderId, customerId, customerPhone);
    sendJson(res, 200, result);
  } catch (err: any) {
    console.error(`[OTP Server] Exception in /api/otp/resend:`, err?.message);
    sendJson(res, 500, {
      success: false,
      error: err.message || 'Failed to resend OTP.',
    });
  }
});

/**
 * POST /api/auth/token
 * Issues a customer JWT token for authentication.
 */
apiRouter.post(['/api/auth/token', '/auth/token'], (req: Request, res: Response) => {
  try {
    const { customerId, email, name } = req.body || {};
    if (!customerId) {
      sendJson(res, 400, { success: false, error: 'customerId is required' });
      return;
    }
    const token = signCustomerToken({ id: customerId, customerId, email, name });
    sendJson(res, 200, { success: true, token });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Failed to generate customer token.' });
  }
});

/**
 * GET /api/otp/customer-order-otp/:orderId
 * Dedicated endpoint for authenticated customers to retrieve the Order Handover OTP for their own order.
 * - Customer must provide valid authentication (Bearer JWT token, x-customer-id header, or query param).
 * - Customer can only view their own active order OTP.
 * - Unauthorized customer queries return 403 Forbidden.
 * - Invalid/expired/missing authentication returns 401 Unauthorized.
 * - Delivered orders return status: 'USED' and do not expose active OTP.
 */
apiRouter.get(
  [
    '/api/otp/customer-order-otp/:orderId',
    '/otp/customer-order-otp/:orderId',
    '/customer-order-otp/:orderId',
  ],
  async (req: Request, res: Response) => {
    try {
      const dbCheck = checkDatabaseAvailability();
      if (!dbCheck.available) {
        sendJson(res, 503, {
          success: false,
          error: dbCheck.error,
          code: dbCheck.code,
        });
        return;
      }

      const orderId = decodeURIComponent(req.params.orderId);

      let authenticatedCustomerId = '';

      // 1. Verify Authorization Bearer token (JWT) if provided
      const authHeader = req.headers.authorization || (req.headers['authorization'] as string);
      if (authHeader && authHeader.trim().toLowerCase().startsWith('bearer ')) {
        const token = authHeader.trim().slice(7).trim();
        const verification = verifyCustomerToken(token);
        if (!verification.valid) {
          sendJson(res, 401, {
            success: false,
            error: verification.error || 'Invalid or expired authentication token.',
          });
          return;
        }
        authenticatedCustomerId = verification.decoded?.id || verification.decoded?.customerId || '';
      }

      // 2. Fall back to x-customer-id header or query param
      if (!authenticatedCustomerId) {
        authenticatedCustomerId =
          (req.headers['x-customer-id'] as string) ||
          (req.query.customerId as string) ||
          '';
      }

      if (!authenticatedCustomerId || !authenticatedCustomerId.trim()) {
        sendJson(res, 401, {
          success: false,
          error: 'Authentication required. Customer identity must be provided.',
        });
        return;
      }

      const result = await getCustomerOrderOtp(orderId, authenticatedCustomerId.trim());

      if (!result.success) {
        if (result.error?.includes('Database')) {
          sendJson(res, 503, result);
          return;
        }
        if (result.error?.includes('Access denied')) {
          sendJson(res, 403, result);
          return;
        }
        if (result.error?.includes('Authentication required')) {
          sendJson(res, 401, result);
          return;
        }
        if (result.error?.includes('not found') || result.error?.includes('Not found')) {
          sendJson(res, 404, result);
          return;
        }
        sendJson(res, 400, result);
        return;
      }

      sendJson(res, 200, result);
    } catch (err: any) {
      console.error(`[OTP Server] Error in customer-order-otp:`, err?.message);
      sendJson(res, 500, {
        success: false,
        error: 'Failed to retrieve Customer Order Handover OTP.',
      });
    }
  }
);

/**
 * POST /api/orders
 * Stores an order in MongoDB Atlas (authoritative persistent storage).
 */
apiRouter.post('/api/orders', async (req: Request, res: Response) => {
  try {
    const orderData = req.body;
    if (!orderData?.id || !orderData?.customerId) {
      sendJson(res, 400, { success: false, error: 'Order id and customerId are required.' });
      return;
    }

    const dbCheck = checkDatabaseAvailability();
    if (!dbCheck.available) {
      sendJson(res, 503, {
        success: false,
        error: dbCheck.error,
        code: dbCheck.code,
      });
      return;
    }

    await upsertOrderInDb(orderData);
    sendJson(res, 200, { success: true, order: orderData });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to save order.' });
  }
});

/**
 * GET /api/orders
 * Retrieves orders for a customer from MongoDB Atlas.
 */
apiRouter.get('/api/orders', async (req: Request, res: Response) => {
  try {
    const customerId =
      (req.query.customerId as string) ||
      (req.headers['x-customer-id'] as string) ||
      '';

    const dbCheck = checkDatabaseAvailability();
    if (!dbCheck.available) {
      sendJson(res, 503, {
        success: false,
        error: dbCheck.error,
        code: dbCheck.code,
      });
      return;
    }

    const orders = await findOrdersForCustomerInDb(customerId);
    sendJson(res, 200, { success: true, orders });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve orders.' });
  }
});

/**
 * POST /api/customers
 * Stores or updates a customer in MongoDB Atlas.
 */
apiRouter.post('/api/customers', async (req: Request, res: Response) => {
  try {
    const customerData = req.body;
    if (!customerData?.id || !customerData?.email) {
      sendJson(res, 400, { success: false, error: 'Customer id and email are required.' });
      return;
    }

    const dbCheck = checkDatabaseAvailability();
    if (!dbCheck.available) {
      sendJson(res, 503, {
        success: false,
        error: dbCheck.error,
        code: dbCheck.code,
      });
      return;
    }

    await upsertCustomerInDb(customerData);
    sendJson(res, 200, { success: true, customer: customerData });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to save customer.' });
  }
});

/**
 * GET /api/customers/:id
 * Retrieves a customer from MongoDB Atlas.
 */
apiRouter.get('/api/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const dbCheck = checkDatabaseAvailability();
    if (!dbCheck.available) {
      sendJson(res, 503, {
        success: false,
        error: dbCheck.error,
        code: dbCheck.code,
      });
      return;
    }

    const customer = await findCustomerInDb(id);
    if (!customer) {
      sendJson(res, 404, { success: false, error: 'Customer not found.' });
      return;
    }

    sendJson(res, 200, { success: true, customer });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve customer.' });
  }
});

/**
 * GET /api/otp/status/:orderId
 * Returns safe verification status of an order (no plain OTP).
 */
apiRouter.get(['/api/otp/status/:orderId', '/otp/status/:orderId', '/status/:orderId'], (req: Request, res: Response) => {
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
apiRouter.get(['/api/otp/provider-config', '/otp/provider-config', '/provider-config'], (_req: Request, res: Response) => {
  sendJson(res, 200, { success: true, config: getSmsProviderConfig() });
});

const SETTINGS_FILE = process.env.VERCEL
  ? path.join('/tmp', 'freshcart_data', 'app_settings.json')
  : path.resolve(process.cwd(), '.data/app_settings.json');

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
