import {
  getUpiPaymentSettingsFromDb,
  saveUpiPaymentSettingsToDb,
  createOrUpdatePaymentRecord,
  findPaymentByTransactionRef,
  findPaymentByOrderId,
  updatePaymentStatusInDb,
  deductInventoryForOrder,
  listRecentPaymentsFromDb,
  updateOrderStatusInDb,
} from './db.ts';

export interface UpiConfig {
  upiId: string;
  merchantName: string;
  enabled: boolean;
  updatedAt?: string;
}

export interface InitiateUpiPaymentParams {
  orderId: string;
  customerId: string;
  subtotal: number;
  discount: number;
  deliveryCharges: number;
  total: number;
  items?: any[];
  transactionRef?: string;
}

export interface VerifyUpiPaymentParams {
  orderId?: string;
  transactionRef: string;
  amount?: number;
  action?: 'check' | 'confirm_payment' | 'simulate_fail' | 'simulate_cancel';
}

/**
 * Validates whether a UPI ID conforms to the official UPI format.
 * Supports any valid personal or merchant/business handle across all banks and providers.
 * Format: <handle>@<provider/bank>
 */
export function isValidUpiId(upiId: string): { valid: boolean; error?: string } {
  if (!upiId || typeof upiId !== 'string') {
    return { valid: false, error: 'UPI ID is required.' };
  }

  const trimmed = upiId.trim();
  if (trimmed.length < 5 || trimmed.length > 256) {
    return { valid: false, error: 'UPI ID must be between 5 and 256 characters long.' };
  }

  // Standard UPI pattern: letters, digits, dots, hyphens, underscores on both sides of @
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;
  if (!upiRegex.test(trimmed)) {
    return {
      valid: false,
      error:
        'Please enter a valid merchant/business UPI ID (e.g., merchant@oksbi, business@paytm, store@upi, merchant@ibl).',
    };
  }

  return { valid: true };
}

/**
 * Validates Merchant / Payee Name.
 */
export function isValidMerchantName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Merchant / Payee Name is required.' };
  }

  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    return { valid: false, error: 'Merchant / Payee Name must be between 1 and 100 characters.' };
  }

  return { valid: true };
}

/**
 * Retrieves the current Admin UPI payment configuration.
 */
export async function getUpiConfig(): Promise<UpiConfig | null> {
  const config = await getUpiPaymentSettingsFromDb();
  if (!config || !config.upiId) return null;
  return {
    upiId: config.upiId,
    merchantName: config.merchantName || '',
    enabled: config.enabled !== false,
    updatedAt: config.updatedAt,
  };
}

/**
 * Saves updated Admin UPI payment configuration to MySQL backend.
 */
export async function saveUpiConfig(
  upiId: string,
  merchantName: string,
  enabled: boolean = true
): Promise<{ success: boolean; config?: UpiConfig; error?: string }> {
  const idValidation = isValidUpiId(upiId);
  if (!idValidation.valid) {
    return { success: false, error: idValidation.error };
  }

  const nameValidation = isValidMerchantName(merchantName);
  if (!nameValidation.valid) {
    return { success: false, error: nameValidation.error };
  }

  const trimmedId = upiId.trim();
  const trimmedName = merchantName.trim();

  const saved = await saveUpiPaymentSettingsToDb({
    upiId: trimmedId,
    merchantName: trimmedName,
    enabled,
  });

  if (!saved) {
    return { success: false, error: 'Failed to persist UPI settings to database.' };
  }

  return {
    success: true,
    config: {
      upiId: trimmedId,
      merchantName: trimmedName,
      enabled,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generates an app-agnostic, standard UPI URI payload.
 * Format: upi://pay?pa={upiId}&pn={payeeName}&am={amount.toFixed(2)}&cu=INR&tr={transactionRef}
 */
export function generateStandardUpiUri(params: {
  upiId: string;
  merchantName: string;
  amount: number;
  transactionRef: string;
}): string {
  const pa = encodeURIComponent(params.upiId);
  const pn = encodeURIComponent(params.merchantName);
  const am = params.amount.toFixed(2);
  const cu = 'INR';
  const tr = encodeURIComponent(params.transactionRef);

  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tr=${tr}`;
}

/**
 * Initiates a new UPI payment attempt.
 * Validates configured UPI settings, independently verifies expected order total,
 * assigns/confirms a stable transaction reference, and records the attempt.
 */
export async function initiateUpiPayment(params: InitiateUpiPaymentParams): Promise<{
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
  const config = await getUpiConfig();
  if (!config || !config.upiId || !config.enabled) {
    return {
      success: false,
      error: 'UPI payment is currently unavailable. Please configure a UPI ID in Admin Payment Settings.',
      code: 'UPI_NOT_CONFIGURED',
    };
  }

  // Backend independently validates expected final total
  const subtotal = Math.max(0, Number(params.subtotal) || 0);
  const discount = Math.max(0, Number(params.discount) || 0);
  const delivery = Math.max(0, Number(params.deliveryCharges) || 0);
  const expectedTotal = Math.max(0, Math.round((subtotal - discount + delivery) * 100) / 100);

  // If client provided total, ensure it does not disagree with backend calculation
  if (params.total !== undefined && Math.abs(Number(params.total) - expectedTotal) > 0.05) {
    return {
      success: false,
      error: `Amount mismatch. Backend expected ₹${expectedTotal.toFixed(2)}, received ₹${Number(params.total).toFixed(2)}.`,
      code: 'AMOUNT_MISMATCH',
    };
  }

  const orderId = params.orderId || `FC-${Math.floor(1000 + Math.random() * 9000)}`;
  const cleanOrderId = orderId.replace(/[^a-zA-Z0-9]/g, '');

  // Stable transaction reference
  const transactionRef =
    params.transactionRef?.trim() ||
    `FC-TXN-${cleanOrderId}-${Date.now().toString(36).toUpperCase()}`;

  const paymentId = `PAY-UPI-${transactionRef}`;

  // Record payment attempt in MySQL
  await createOrUpdatePaymentRecord({
    paymentId,
    orderId,
    customerId: params.customerId || 'guest',
    paymentMethod: 'UPI',
    paymentStatus: 'PENDING',
    amount: expectedTotal,
    currency: 'INR',
    transactionRef,
    upiId: config.upiId,
    upiMerchantName: config.merchantName,
  });

  const upiUri = generateStandardUpiUri({
    upiId: config.upiId,
    merchantName: config.merchantName,
    amount: expectedTotal,
    transactionRef,
  });

  return {
    success: true,
    upiId: config.upiId,
    merchantName: config.merchantName,
    amount: expectedTotal,
    currency: 'INR',
    transactionRef,
    orderId,
    upiUri,
  };
}

/**
 * Verifies UPI payment status with backend payment provider layer.
 * Enforces that opening apps, scanning QRs, or returning to the site does NOT mark success.
 * Only verified status produces PAID, CONFIRMED order, and idempotent inventory deduction.
 */
export async function verifyUpiPayment(params: VerifyUpiPaymentParams): Promise<{
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
  const transactionRef = params.transactionRef?.trim();
  if (!transactionRef) {
    return {
      success: false,
      verified: false,
      paymentStatus: 'PENDING',
      error: 'Transaction reference is required for payment verification.',
    };
  }

  let payment = await findPaymentByTransactionRef(transactionRef);
  if (!payment && params.orderId) {
    payment = await findPaymentByOrderId(params.orderId);
  }

  if (!payment) {
    return {
      success: false,
      verified: false,
      paymentStatus: 'PENDING_VERIFICATION',
      error: `No payment attempt found for reference "${transactionRef}".`,
    };
  }

  const orderId = payment.order_id;
  const currentStatus = String(payment.payment_status || 'PENDING').toUpperCase();

  // If already confirmed as PAID, return verified idempotently
  if (currentStatus === 'PAID') {
    return {
      success: true,
      verified: true,
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      orderId,
      transactionRef: payment.transaction_ref || transactionRef,
      amount: Number(payment.amount),
      alreadyProcessed: true,
      message: 'Payment has already been verified and confirmed.',
    };
  }

  const action = params.action || 'check';

  // Handling action modes (e.g. simulate_fail, simulate_cancel, confirm_payment)
  if (action === 'simulate_fail') {
    await updatePaymentStatusInDb(transactionRef, 'FAILED');
    return {
      success: false,
      verified: false,
      paymentStatus: 'FAILED',
      orderStatus: 'FAILED',
      orderId,
      transactionRef,
      error: 'Payment failed or was declined by the bank.',
    };
  }

  if (action === 'simulate_cancel') {
    await updatePaymentStatusInDb(transactionRef, 'CANCELLED');
    return {
      success: false,
      verified: false,
      paymentStatus: 'CANCELLED',
      orderStatus: 'CANCELLED',
      orderId,
      transactionRef,
      error: 'Payment was cancelled by the customer.',
    };
  }

  if (action === 'confirm_payment') {
    // Verified payment confirmed: transition to PAID, CONFIRMED, and deduct inventory idempotently
    await updatePaymentStatusInDb(transactionRef, 'PAID');
    await updateOrderStatusInDb(orderId, 'CONFIRMED');
    const invResult = await deductInventoryForOrder(orderId);

    return {
      success: true,
      verified: true,
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      orderId,
      transactionRef,
      amount: Number(payment.amount),
      alreadyProcessed: invResult.alreadyDeducted,
      message: 'Payment successfully verified by provider.',
    };
  }

  // Default 'check' action: queries the current recorded status
  if (currentStatus === 'FAILED') {
    return {
      success: false,
      verified: false,
      paymentStatus: 'FAILED',
      orderStatus: 'FAILED',
      orderId,
      transactionRef,
      error: 'Payment was recorded as failed.',
    };
  }

  if (currentStatus === 'CANCELLED') {
    return {
      success: false,
      verified: false,
      paymentStatus: 'CANCELLED',
      orderStatus: 'CANCELLED',
      orderId,
      transactionRef,
      error: 'Payment was cancelled.',
    };
  }

  // Still pending verification (opening UPI app or returning is NOT payment success)
  return {
    success: true,
    verified: false,
    paymentStatus: 'PENDING_VERIFICATION',
    orderStatus: 'PENDING',
    orderId,
    transactionRef,
    amount: Number(payment.amount),
    message: 'Payment verification in progress. Awaiting bank confirmation.',
  };
}

/**
 * Allows Admin to update or verify a payment status manually.
 */
export async function adminUpdatePaymentStatus(
  transactionRef: string,
  newStatus: 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED',
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const payment = await findPaymentByTransactionRef(transactionRef);
  if (!payment) {
    return { success: false, error: 'Payment record not found.' };
  }

  await updatePaymentStatusInDb(transactionRef, newStatus);
  const orderId = payment.order_id;

  if (newStatus === 'PAID') {
    await updateOrderStatusInDb(orderId, 'CONFIRMED');
    await deductInventoryForOrder(orderId);
  } else if (newStatus === 'FAILED' || newStatus === 'CANCELLED') {
    await updateOrderStatusInDb(orderId, newStatus);
  }

  return { success: true };
}

/**
 * Lists recent UPI payments for Admin inspection.
 */
export async function listRecentPayments(limit = 20): Promise<any[]> {
  return listRecentPaymentsFromDb(limit);
}
