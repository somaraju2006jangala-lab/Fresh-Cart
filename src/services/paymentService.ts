import { Transaction, ReturnDetails, ReturnStatus, PaymentStatus } from '../types';

export interface PaymentConfig {
  success: boolean;
  keyId: string;
  currency: string;
}

export interface CreateOrderResult {
  success: boolean;
  orderId: string;
  amount: number; // in paise
  amountInINR: number;
  currency: string;
  keyId: string;
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  total: number;
  error?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  verified: boolean;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  transactionId?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  returnStatus: ReturnStatus;
  paymentStatus: PaymentStatus;
  refundAmount?: number;
  razorpayRefundId?: string;
  razorpayPaymentId?: string;
  refundDate?: string;
  error?: string;
}

/**
 * Fetches public Razorpay key ID from backend
 */
export async function fetchPaymentConfig(): Promise<PaymentConfig> {
  try {
    const res = await fetch('/api/payment/config');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }
  return {
    success: true,
    keyId: 'rzp_test_freshcart2026',
    currency: 'INR',
  };
}

/**
 * Initiates Razorpay order creation on the server
 */
export async function createServerRazorpayOrder(payload: {
  items: any[];
  couponDiscount?: number;
  customerId?: string;
  customerName?: string;
  receipt?: string;
  subtotal?: number;
}): Promise<CreateOrderResult> {
  try {
    const res = await fetch('/api/payment/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      orderId: '',
      amount: 0,
      amountInINR: 0,
      currency: 'INR',
      keyId: '',
      subtotal: 0,
      discount: 0,
      deliveryCharge: 0,
      total: 0,
      error: err.message || 'Network error creating payment order',
    };
  }
}

/**
 * Verifies Razorpay payment signature on the backend
 */
export async function verifyServerPayment(payload: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  orderId: string;
  customerId?: string;
  customerName?: string;
  amount: number;
}): Promise<VerifyPaymentResult> {
  try {
    const res = await fetch('/api/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      verified: false,
      paymentStatus: 'FAILED',
      paymentMethod: 'UPI',
      error: err.message || 'Payment verification failed',
    };
  }
}

/**
 * Records cancelled payment
 */
export async function recordPaymentCancellation(payload: {
  razorpayOrderId?: string;
  orderId?: string;
  customerName?: string;
  userId?: string;
  amount?: number;
}): Promise<void> {
  try {
    await fetch('/api/payment/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }
}

/**
 * Fetches verified Razorpay transactions for Admin Portal
 */
export async function fetchServerTransactions(): Promise<Transaction[]> {
  try {
    const res = await fetch('/api/transactions');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.transactions)) {
        return data.transactions;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

/**
 * Customer submits return request for delivered order
 */
export async function requestOrderReturn(payload: {
  orderId: string;
  productId?: string;
  productTitle?: string;
  quantity?: number;
  unit?: string;
  price?: number;
  reason: string;
  reasonDescription?: string;
  originalOrderAmount: number;
}): Promise<{ success: boolean; returnStatus?: ReturnStatus; returnDetails?: ReturnDetails; error?: string }> {
  try {
    const res = await fetch('/api/payment/return/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit return request' };
  }
}

/**
 * Admin accepts return request
 */
export async function acceptOrderReturn(payload: {
  orderId: string;
  adminName?: string;
}): Promise<{ success: boolean; returnStatus?: ReturnStatus; error?: string }> {
  try {
    const res = await fetch('/api/payment/return/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to accept return' };
  }
}

/**
 * Admin marks returned product collected
 */
export async function markProductCollected(payload: {
  orderId: string;
  adminName?: string;
  returnedQuantity?: number;
}): Promise<{ success: boolean; returnStatus?: ReturnStatus; error?: string }> {
  try {
    const res = await fetch('/api/payment/return/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record product collection' };
  }
}

/**
 * Admin processes Razorpay refund on backend
 */
export async function processOrderRefund(payload: {
  orderId: string;
  returnDetails?: ReturnDetails;
  paymentId?: string;
}): Promise<RefundResult> {
  try {
    const res = await fetch('/api/payment/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      returnStatus: 'PRODUCT COLLECTED',
      paymentStatus: 'PAID',
      error: err.message || 'Failed to process refund',
    };
  }
}

/**
 * Helper to obtain authentic cryptographic signature for developer test mode
 */
export async function generateDevSignature(razorpayOrderId: string, razorpayPaymentId: string): Promise<string> {
  try {
    const res = await fetch('/api/payment/dev-create-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razorpayOrderId, razorpayPaymentId }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.signature;
    }
  } catch {
    // fallback
  }
  return '';
}
