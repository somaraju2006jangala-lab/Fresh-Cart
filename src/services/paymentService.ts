import { UpiPaymentSettings, UpiPaymentRecord } from '../types';

const STORAGE_UPI_SETTINGS_KEY = 'freshcart_upi_settings_v1';

export const DEFAULT_UPI_SETTINGS: UpiPaymentSettings = {
  upiId: '',
  merchantName: '',
  enabled: false,
};

/**
 * Reads local cached UPI settings for instant initial render.
 */
export function getStoredUpiSettings(): UpiPaymentSettings {
  try {
    const raw = localStorage.getItem(STORAGE_UPI_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.upiId === 'string' && parsed.upiId.trim().length > 0) {
        return {
          upiId: parsed.upiId.trim(),
          merchantName: (parsed.merchantName || '').trim(),
          enabled: parsed.enabled !== false && Boolean(parsed.upiId.trim()),
          updatedAt: parsed.updatedAt,
        };
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_UPI_SETTINGS;
}

/**
 * Saves local cached UPI settings.
 */
export function storeUpiSettingsLocally(settings: UpiPaymentSettings): void {
  try {
    localStorage.setItem(STORAGE_UPI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/**
 * Fetches authoritative UPI payment settings from the backend API.
 * Uses cache-busting to guarantee the latest MySQL configuration is retrieved.
 */
export async function fetchUpiSettings(): Promise<UpiPaymentSettings> {
  try {
    const res = await fetch(`/api/payment-settings/upi?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.settings) {
        const upiId = String(data.settings.upiId || '').trim();
        const merchantName = String(data.settings.merchantName || '').trim();
        const isConfigured = Boolean(upiId && data.settings.enabled !== false);
        const settings: UpiPaymentSettings = {
          upiId,
          merchantName,
          enabled: isConfigured,
          updatedAt: data.settings.updatedAt,
        };
        storeUpiSettingsLocally(settings);
        return settings;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch UPI settings from backend:', err);
  }
  return getStoredUpiSettings();
}

/**
 * Saves UPI settings to backend API and updates local cache.
 * Dispatches a window event so customer checkout views update immediately.
 */
export async function saveUpiSettings(params: {
  upiId: string;
  merchantName: string;
}): Promise<{ success: boolean; settings?: UpiPaymentSettings; error?: string }> {
  try {
    const res = await fetch('/api/payment-settings/upi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        upiId: params.upiId.trim(),
        merchantName: params.merchantName.trim(),
        enabled: true,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to save UPI settings.',
      };
    }

    const saved: UpiPaymentSettings = {
      upiId: String(data.settings.upiId || '').trim(),
      merchantName: String(data.settings.merchantName || '').trim(),
      enabled: data.settings.enabled !== false && Boolean(data.settings.upiId),
      updatedAt: data.settings.updatedAt,
    };
    storeUpiSettingsLocally(saved);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('freshcart_upi_settings_updated', { detail: saved })
      );
    }
    return { success: true, settings: saved };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while saving UPI settings.',
    };
  }
}

/**
 * Initiates an app-agnostic UPI payment attempt.
 */
export async function initiateUpiPayment(params: {
  orderId: string;
  customerId: string;
  subtotal: number;
  discount: number;
  deliveryCharges: number;
  total: number;
  transactionRef?: string;
  items?: any[];
}): Promise<{
  success: boolean;
  upiId?: string;
  merchantName?: string;
  amount?: number;
  currency?: string;
  transactionRef?: string;
  orderId?: string;
  upiUri?: string;
  error?: string;
  code?: string;
}> {
  try {
    const res = await fetch('/api/payments/initiate-upi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to initiate UPI payment.',
        code: data?.code,
      };
    }

    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while initiating payment.',
    };
  }
}

/**
 * Verifies UPI payment status with backend payment provider layer.
 */
export async function verifyPaymentStatus(params: {
  orderId?: string;
  transactionRef: string;
  amount?: number;
  action?: 'check' | 'confirm_payment' | 'simulate_fail' | 'simulate_cancel';
}): Promise<{
  success: boolean;
  verified: boolean;
  paymentStatus: 'PAID' | 'PENDING' | 'PENDING_VERIFICATION' | 'FAILED' | 'CANCELLED';
  orderStatus?: string;
  orderId?: string;
  transactionRef?: string;
  amount?: number;
  message?: string;
  error?: string;
  alreadyProcessed?: boolean;
}> {
  try {
    const res = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      verified: false,
      paymentStatus: 'PENDING_VERIFICATION',
      error: err?.message || 'Failed to verify payment status.',
    };
  }
}

/**
 * Queries payment status for a specific transaction reference.
 */
export async function fetchPaymentStatus(transactionRef: string): Promise<any> {
  try {
    const res = await fetch(`/api/payments/status/${encodeURIComponent(transactionRef)}`);
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch payment status:', err);
    return { success: false, verified: false, paymentStatus: 'PENDING_VERIFICATION' };
  }
}

/**
 * Fetches recent payments for Admin inspection.
 */
export async function fetchRecentPayments(limit = 20): Promise<UpiPaymentRecord[]> {
  try {
    const res = await fetch(`/api/payments/recent?limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.payments)) {
        return data.payments;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch recent payments:', err);
  }
  return [];
}

/**
 * Updates a payment status via Admin portal.
 */
export async function adminSetPaymentStatus(
  transactionRef: string,
  status: 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED',
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/payments/admin-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionRef, status, notes }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error.' };
  }
}
