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

function loadAppSettings(): { taxAndPackingPercentage: number } {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (typeof data?.taxAndPackingPercentage === 'number' && !isNaN(data.taxAndPackingPercentage)) {
        return {
          taxAndPackingPercentage: Math.max(0, Math.min(100, data.taxAndPackingPercentage)),
        };
      }
    }
  } catch {
    // fallback
  }
  return { taxAndPackingPercentage: 0 };
}

function saveAppSettings(settings: { taxAndPackingPercentage: number }): void {
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
 * Retrieves app settings, including Admin-configured Tax & Packing percentage.
 */
apiRouter.get('/api/settings', (_req: Request, res: Response) => {
  const settings = loadAppSettings();
  sendJson(res, 200, { success: true, settings });
});

/**
 * POST /api/settings
 * Updates app settings, including Tax & Packing percentage with validation.
 */
apiRouter.post('/api/settings', (req: Request, res: Response) => {
  try {
    const { taxAndPackingPercentage } = req.body;

    if (taxAndPackingPercentage === undefined || taxAndPackingPercentage === null) {
      sendJson(res, 400, {
        success: false,
        error: 'taxAndPackingPercentage is required.',
      });
      return;
    }

    const num = Number(taxAndPackingPercentage);
    if (isNaN(num)) {
      sendJson(res, 400, {
        success: false,
        error: 'Tax & packing percentage must be a valid number.',
      });
      return;
    }

    if (num < 0) {
      sendJson(res, 400, {
        success: false,
        error: 'Percentage cannot be negative.',
      });
      return;
    }

    if (num > 100) {
      sendJson(res, 400, {
        success: false,
        error: 'Percentage cannot exceed 100%.',
      });
      return;
    }

    const sanitized = Math.round(num * 100) / 100;
    saveAppSettings({ taxAndPackingPercentage: sanitized });

    sendJson(res, 200, {
      success: true,
      settings: { taxAndPackingPercentage: sanitized },
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
