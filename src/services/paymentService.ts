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
  amount: number | string;
  transactionRef?: string;
}): string {
  const pa = encodeURIComponent((params.upiId || '').trim());
  const pn = encodeURIComponent((params.merchantName || '').trim());
  const formattedAmount = Number(params.amount || 0).toFixed(2);
  const am = encodeURIComponent(formattedAmount);
  const cu = 'INR';

  let uri = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}`;

  if (params.transactionRef && params.transactionRef.trim().length > 0) {
    uri += `&tr=${encodeURIComponent(params.transactionRef.trim())}`;
  }

  return uri;
}

/**
 * Fetches current Admin UPI configuration from backend.
 */
export async function fetchUpiSettings(): Promise<UpiPaymentSettings> {
  try {
    const res = await fetch('/api/payment-settings/upi', {
      headers: { credentials: 'omit', 'Cache-Control': 'no-cache' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.settings) {
        return data.settings;
      }
    }
  } catch (err) {
    console.warn('[UPI] Error fetching UPI settings from API, using defaults:', err);
  }

  return {
    upiId: 'riya.bakery@sbi',
    merchantName: 'Riya Bakery',
    enabled: true,
  };
}

/**
 * Saves updated UPI configuration to backend (Admin).
 */
export async function saveUpiSettings(settings: {
  upiId: string;
  merchantName: string;
  enabled?: boolean;
}): Promise<{ success: boolean; settings?: UpiPaymentSettings; error?: string }> {
  try {
    const res = await fetch('/api/payment-settings/upi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (res.ok && data?.success) {
      return { success: true, settings: data.settings };
    }
    return { success: false, error: data?.error || 'Failed to save UPI settings.' };
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
