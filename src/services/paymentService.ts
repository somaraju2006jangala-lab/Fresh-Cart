import { UpiPaymentSettings, UpiPaymentRecord } from '../types';

export const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

/**
 * Validates a UPI ID against standard merchant/personal handle formats.
 * Format: <identifier>@<bank/provider>
 */
export function isValidUpiId(upiId: string | undefined | null): boolean {
  if (!upiId || typeof upiId !== 'string') return false;
  return UPI_ID_REGEX.test(upiId.trim());
}

/**
 * Builds a standardized, fully URL-encoded UPI payment URI.
 * Scheme: upi://pay?pa=<UPI_ID>&pn=<MERCHANT_NAME>&am=<FINAL_AMOUNT>&cu=INR&tr=<TRANSACTION_REF>
 */
export function buildUpiUri(params: {
  upiId: string;
  merchantName: string;
  amount?: number | string;
  transactionRef?: string;
}): string {
  const pa = encodeURIComponent((params.upiId || '').trim());
  const pn = encodeURIComponent((params.merchantName || '').trim());
  const cu = 'INR';

  let uri = `upi://pay?pa=${pa}&pn=${pn}`;

  if (params.amount !== undefined && params.amount !== null && Number(params.amount) > 0) {
    const formattedAmount = Number(params.amount).toFixed(2);
    uri += `&am=${encodeURIComponent(formattedAmount)}`;
  }

  uri += `&cu=${cu}`;

  if (params.transactionRef && params.transactionRef.trim().length > 0) {
    uri += `&tr=${encodeURIComponent(params.transactionRef.trim())}`;
  }

  return uri;
}

/**
 * Fetches current Admin UPI configuration from backend.
 */
export async function fetchUpiSettings(): Promise<UpiPaymentSettings | null> {
  try {
    const res = await fetch('/api/payment-settings/upi', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[UPI API Error] Failed to fetch UPI settings from backend (HTTP ${res.status}):`, errText);
      return null;
    }

    const data = await res.json();
    if (!data || data.success === false) {
      console.error('[UPI API Error] Backend returned unsuccessful response:', data?.error || data);
      return null;
    }

    const raw = data.settings || data.data || data;
    if (!raw) {
      console.warn('[UPI API] Empty settings returned from backend.');
      return null;
    }

    const upiId = String(raw.upiId || raw.upi_id || '').trim();
    const merchantName = String(raw.merchantName || raw.merchant_name || 'FreshCart Store').trim();
    const isEnabled = raw.enabled !== false && raw.enabled !== 0 && raw.enabled !== 'false' && raw.enabled !== '0';

    if (!upiId) {
      console.warn('[UPI API] No active UPI ID found in database settings.');
      return null;
    }

    return {
      upiId,
      upi_id: upiId,
      merchantName,
      merchant_name: merchantName,
      enabled: isEnabled,
      qrCodeUrl: raw.qrCodeUrl || raw.qr_code_url,
      qr_code_url: raw.qrCodeUrl || raw.qr_code_url,
      updatedAt: raw.updatedAt || raw.updated_at,
      updated_at: raw.updatedAt || raw.updated_at,
    };
  } catch (err: any) {
    console.error('[UPI API Error] Network or runtime exception while fetching UPI settings:', err?.message || err);
    return null;
  }
}

/**
 * Saves updated UPI configuration to backend (Admin).
 */
export async function saveUpiSettings(settings: {
  upiId: string;
  merchantName: string;
  enabled?: boolean;
  qrCodeUrl?: string;
}): Promise<{ success: boolean; settings?: UpiPaymentSettings; error?: string }> {
  try {
    const res = await fetch('/api/payment-settings/upi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // response might not be JSON
    }
    if (res.ok && data?.success) {
      return { success: true, settings: data.settings };
    }
    return {
      success: false,
      error: data?.error || (res.status !== 200 ? `Failed to save UPI settings (Status ${res.status}).` : 'Failed to save UPI settings.'),
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error saving UPI settings.' };
  }
}

/**
 * Creates/stores the payment attempt in the database before opening UPI.
 */
export async function initiateUpiPayment(params: {
  orderId: string;
  customerId: string;
  amount: number;
  upiId: string;
  merchantName: string;
  transactionRef: string;
}): Promise<{ success: boolean; payment?: UpiPaymentRecord; upiUri?: string; error?: string }> {
  try {
    const res = await fetch('/api/payments/initiate-upi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (res.ok && data?.success) {
      return {
        success: true,
        payment: data.payment,
        upiUri: data.upiUri,
      };
    }
    return {
      success: false,
      error: data?.error || 'Failed to initiate UPI payment attempt.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error initiating UPI payment.',
    };
  }
}
