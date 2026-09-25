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
