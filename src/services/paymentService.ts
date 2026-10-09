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

/**
 * Uploads payment screenshot for a specific customer UPI order.
 * Accepts JPG, JPEG, and PNG files up to 10 MB.
 */
export async function uploadPaymentScreenshot(
  orderId: string,
  file: File,
  token?: string
): Promise<{
  success: boolean;
  paymentStatus?: string;
  screenshotUrl?: string;
  message?: string;
  alreadySubmitted?: boolean;
  alreadyPaid?: boolean;
  error?: string;
}> {
  // Validate file type: JPG, JPEG, PNG
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const validExts = ['.jpg', '.jpeg', '.png'];

  if (!validTypes.includes(file.type.toLowerCase()) && !validExts.includes(ext)) {
    return {
      success: false,
      error: 'Please select a valid JPG, JPEG, or PNG image file.',
    };
  }

  // Validate file size: 10 MB limit (10 * 1024 * 1024 = 10,485,760 bytes)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return {
      success: false,
      error: 'File size exceeds the 10 MB limit. Please select a smaller screenshot.',
    };
  }

  try {
    // Read file as base64 Data URL
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file from device.'));
      reader.readAsDataURL(file);
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/payments/screenshot/upload', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId,
        screenshot: base64Data,
        mimeType: file.type || (ext === '.png' ? 'image/png' : 'image/jpeg'),
        fileName: file.name,
      }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.success) {
      // Synchronize order state in localStorage
      try {
        const raw = localStorage.getItem('freshcart_customer_orders');
        if (raw) {
          const orders = JSON.parse(raw);
          const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
          const updated = orders.map((o: any) =>
            o.id === orderId || o.id === altId
              ? {
                  ...o,
                  paymentStatus: 'PENDING_VERIFICATION',
                  screenshotUrl: data.screenshotUrl,
                }
              : o
          );
          localStorage.setItem('freshcart_customer_orders', JSON.stringify(updated));
        }
      } catch {}

      return {
        success: true,
        paymentStatus: data.paymentStatus || 'PENDING_VERIFICATION',
        screenshotUrl: data.screenshotUrl,
        message: data.message || 'Payment proof submitted successfully. Please wait for admin verification.',
      };
    }

    return {
      success: false,
      alreadySubmitted: Boolean(data?.alreadySubmitted),
      alreadyPaid: Boolean(data?.alreadyPaid),
      error: data?.error || 'Failed to upload screenshot. Please try again.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error while uploading payment screenshot.',
    };
  }
}

/**
 * Represents an item in the payment verification queue.
 */
export interface PaymentVerificationItem {
  id: string;
  orderId: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  screenshotPath?: string;
  screenshotUrl?: string;
  screenshotUploadedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationNotes?: string;
  otpSent?: boolean;
  otpSentAt?: string;
  createdAt: string;
  customerName?: string;
  customerMobile?: string;
  customerEmail?: string;
  orderTotal?: number;
}

/**
 * Admin: verifies an online UPI payment screenshot as either APPROVED (PAID) or REJECTED.
 */
export async function adminVerifyPayment(
  orderId: string,
  action: 'APPROVE' | 'REJECT',
  notes?: string,
  token?: string
): Promise<{
  success: boolean;
  paymentStatus?: string;
  otpSent?: boolean;
  order?: any;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationNotes?: string;
  error?: string;
}> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-admin-role': 'admin',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/admin/payments/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId,
        action,
        notes,
      }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.success) {
      const newStatus = action === 'APPROVE' ? 'PAID' : 'REJECTED';
      // Synchronize to localStorage
      try {
        const raw = localStorage.getItem('freshcart_customer_orders');
        if (raw) {
          const orders = JSON.parse(raw);
          const updated = orders.map((o: any) =>
            o.id === orderId
              ? {
                  ...o,
                  paymentStatus: newStatus,
                  ...(action === 'APPROVE' ? { screenshotUrl: undefined } : {}),
                  verifiedAt: data.verifiedAt,
                  verifiedBy: data.verifiedBy,
                  verificationNotes: data.verificationNotes,
                }
              : o
          );
          localStorage.setItem('freshcart_customer_orders', JSON.stringify(updated));
        }
      } catch {}

      return {
        success: true,
        paymentStatus: data.paymentStatus || newStatus,
        otpSent: !!data.otpSent,
        order: data.order,
        verifiedAt: data.verifiedAt,
        verifiedBy: data.verifiedBy,
        verificationNotes: data.verificationNotes,
      };
    }

    return {
      success: false,
      error: data?.error || 'Failed to verify payment status.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error verifying payment.',
    };
  }
}

/**
 * Admin: fetches queue of UPI payments and verification records.
 */
export async function fetchPaymentVerificationQueue(
  token?: string
): Promise<{ success: boolean; payments: PaymentVerificationItem[]; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'x-admin-role': 'admin',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/admin/payments/verification-queue', {
      method: 'GET',
      headers,
    });

    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return { success: true, payments: data.payments || [] };
    }
    return { success: false, payments: [], error: data?.error || 'Failed to fetch verification queue.' };
  } catch (err: any) {
    return { success: false, payments: [], error: err?.message || 'Network error fetching verification queue.' };
  }
}

