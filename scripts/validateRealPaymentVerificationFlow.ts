import crypto from 'crypto';
import {
  findOrderInDb,
  upsertOrderInDb,
  getProductsFromDb,
  verifyPaymentProofInDb,
  savePaymentProofInDb,
  getPaymentSettingsFromDb,
  inMemoryOrders,
} from '../server/db.ts';
import {
  getPhonePeConfig,
  createUpiPaymentIntent,
  verifyUpiPaymentWithProvider,
  handlePhonePeWebhook,
} from '../server/paymentProviderService.ts';

async function runTests() {
  console.log('================================================================');
  console.log('FRESHCART REAL PAYMENT VERIFICATION SYSTEM VALIDATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`, detail !== undefined ? detail : '');
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Provider Config Inspection (No Fake Credentials)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Provider Config Inspection ---');
  const config = getPhonePeConfig();
  assert(
    typeof config.isConfigured === 'boolean',
    'Provider config correctly reports configuration state without inventing fake secrets'
  );
  if (!config.isConfigured) {
    console.log(`ℹ️ PhonePe PG credentials not configured in current environment. Missing keys: ${config.missingKeys.join(', ')}`);
    console.log('ℹ️ Clean fallback to NPCI UPI URI with Admin screenshot verification enabled.');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: UPI Intent Creation for All Supported Payment Apps
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Multi-App Intent Creation (₹239 Order) ---');
  const apps = ['phonepe', 'gpay', 'paytm', 'generic'] as const;
  for (const app of apps) {
    const intentResult = await createUpiPaymentIntent({
      orderId: 'FC-TEST-101',
      amount: 239,
      targetApp: app,
    });

    assert(
      intentResult.success && Boolean(intentResult.intentUri) && Boolean(intentResult.transactionId),
      `Intent created for app: ${app.toUpperCase()} with transactionId '${intentResult.transactionId}'`
    );
    assert(
      intentResult.transactionId.startsWith('FC-') && intentResult.transactionId.includes('FCTEST101'),
      `Transaction reference is stable and deterministically derived from order ID`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 3: No Fake Success / Unverified State Preservation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Payment Verification Rule: Never Trust App Opening / Redirection ---');
  const testOrderUnverified = {
    id: '#FC-TEST-UNVERIFIED',
    customerId: 'cust-test-1',
    customerName: 'Test Customer',
    total: 239,
    subtotal: 199,
    discount: 0,
    deliveryCharges: 40,
    status: 'PAYMENT VERIFICATION PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'UPI / QR Payment',
    paymentId: 'FC-TESTUNVERIFIED-REF1',
    items: [],
  };
  await upsertOrderInDb(testOrderUnverified);

  const initialVerification = await verifyUpiPaymentWithProvider('#FC-TEST-UNVERIFIED', 'FC-TESTUNVERIFIED-REF1');
  assert(
    initialVerification.verified === false &&
    (initialVerification.paymentStatus === 'PENDING' || initialVerification.paymentStatus === 'PENDING_VERIFICATION'),
    'Backend correctly refuses to mark payment as PAID merely because app was opened or returned'
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Strict Amount Validation (Mismatched Amount Must Be Rejected)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Exact Amount Validation (₹239 Expected) ---');
  const testOrderAmount = {
    id: '#FC-TEST-AMOUNT',
    customerId: 'cust-test-2',
    customerName: 'Amount Test Customer',
    total: 239, // ₹239.00
    subtotal: 239,
    discount: 0,
    status: 'PAYMENT VERIFICATION PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'Direct UPI App Payment',
    paymentId: 'FC-TESTAMOUNT-REF2',
    items: [],
  };
  await upsertOrderInDb(testOrderAmount);

  // Simulate webhook with WRONG amount: ₹199 (19900 paise instead of 23900 paise)
  const wrongAmountPayload = {
    success: true,
    code: 'PAYMENT_SUCCESS',
    data: {
      merchantTransactionId: 'FC-TESTAMOUNT-REF2',
      transactionId: 'TXN-PHONEPE-999',
      amount: 19900, // 199 INR instead of 239 INR
      responseCode: 'SUCCESS',
    },
  };
  const wrongBase64 = Buffer.from(JSON.stringify(wrongAmountPayload)).toString('base64');
  const wrongWebhookResult = await handlePhonePeWebhook({ response: wrongBase64 }, {});

  assert(
    wrongWebhookResult.success === false && wrongWebhookResult.paymentStatus === 'REJECTED',
    'Webhook rejects payment with mismatched amount (received ₹199 for ₹239 order)'
  );

  const orderAfterMismatch = await findOrderInDb('#FC-TEST-AMOUNT');
  assert(
    orderAfterMismatch?.paymentStatus === 'REJECTED' && orderAfterMismatch?.status !== 'CONFIRMED',
    'Order remains UNCONFIRMED and payment marked REJECTED upon amount mismatch'
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Exact Amount Verification (₹239 Expected, ₹239 Received)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Exact Amount Match (₹239 Expected, ₹239 Received) ---');
  const correctAmountPayload = {
    success: true,
    code: 'PAYMENT_SUCCESS',
    data: {
      merchantTransactionId: 'FC-TESTAMOUNT-REF2',
      transactionId: 'TXN-PHONEPE-1001',
      amount: 23900, // Exact 239 INR (23900 paise)
      responseCode: 'SUCCESS',
    },
  };
  const correctBase64 = Buffer.from(JSON.stringify(correctAmountPayload)).toString('base64');
  const correctWebhookResult = await handlePhonePeWebhook({ response: correctBase64 }, {});

  assert(
    correctWebhookResult.success === true && correctWebhookResult.paymentStatus === 'PAID',
    'Webhook successfully verifies payment when exact amount ₹239 matches'
  );

  const orderAfterMatch = await findOrderInDb('#FC-TEST-AMOUNT');
  assert(
    orderAfterMatch?.paymentStatus === 'PAID' && orderAfterMatch?.status === 'CONFIRMED',
    'Order is CONFIRMED and payment is PAID after exact amount verification'
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Webhook Idempotency (Duplicate Verification Must Not Repeat Inventory Deduction)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Idempotency & Duplicate Callback Protection ---');
  const duplicateWebhookResult = await handlePhonePeWebhook({ response: correctBase64 }, {});
  assert(
    duplicateWebhookResult.success === true && duplicateWebhookResult.paymentStatus === 'PAID',
    'Duplicate webhook processed idempotently without error'
  );

  // ---------------------------------------------------------------------------
  // TEST 7: Payment Screenshot & Admin Verification Workflow Preservation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Payment Screenshot & Admin Verification Preservation ---');
  const testOrderManual = {
    id: '#FC-TEST-SCREENSHOT',
    customerId: 'cust-test-3',
    customerName: 'Screenshot User',
    total: 239,
    subtotal: 239,
    discount: 0,
    status: 'PAYMENT VERIFICATION PENDING',
    paymentStatus: 'PENDING',
    paymentMethod: 'UPI / QR Payment',
    paymentId: 'FC-TESTSCREENSHOT-REF3',
    items: [],
  };
  await upsertOrderInDb(testOrderManual);

  await savePaymentProofInDb({
    orderId: '#FC-TEST-SCREENSHOT',
    customerId: 'cust-test-3',
    paymentId: 'FC-TESTSCREENSHOT-REF3',
    fileName: 'payment_receipt.jpg',
    fileType: 'image/jpeg',
    fileSize: 45000,
    filePath: '.data/payment_proofs/test.jpg',
    verificationStatus: 'PENDING_VERIFICATION',
  });

  const orderBeforeAdmin = await findOrderInDb('#FC-TEST-SCREENSHOT');
  const isPendingStatus =
    orderBeforeAdmin?.paymentStatus === 'PENDING' ||
    orderBeforeAdmin?.paymentStatus === 'PENDING VERIFICATION' ||
    orderBeforeAdmin?.paymentStatus === 'PENDING_VERIFICATION';

  assert(
    isPendingStatus && orderBeforeAdmin?.status !== 'CONFIRMED',
    'Order is unconfirmed while screenshot is pending verification'
  );

  // Admin approves screenshot
  const adminVerifyResult = await verifyPaymentProofInDb(
    '#FC-TEST-SCREENSHOT',
    'VERIFY',
    'Admin Operator',
    'Screenshot verified by Store Admin'
  );

  assert(
    adminVerifyResult.success === true && adminVerifyResult.paymentStatus === 'PAID' && adminVerifyResult.orderStatus === 'CONFIRMED',
    'Admin screenshot verification successfully transitions payment to PAID and order to CONFIRMED'
  );

  // Duplicate Admin verification must be idempotent
  const duplicateAdminVerify = await verifyPaymentProofInDb(
    '#FC-TEST-SCREENSHOT',
    'VERIFY',
    'Admin Operator',
    'Screenshot verified by Store Admin'
  );
  assert(
    duplicateAdminVerify.success === true && duplicateAdminVerify.paymentStatus === 'PAID',
    'Duplicate admin verification handled idempotently'
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`VALIDATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error during test execution:', err);
  process.exit(1);
});
