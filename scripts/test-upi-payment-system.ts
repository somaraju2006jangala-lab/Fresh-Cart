/**
 * Automated Verification Script for FreshCart UPI Payment System
 */
import {
  isValidUpiId,
  isValidMerchantName,
  getUpiConfig,
  saveUpiConfig,
  generateStandardUpiUri,
  initiateUpiPayment,
  verifyUpiPayment,
} from '../server/upiPaymentService.ts';
import QRCode from 'qrcode';

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING FRESHCART UPI PAYMENT SYSTEM AUTOMATED TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Merchant / Business UPI ID Validation
  // ----------------------------------------------------
  console.log('--- TEST 1: UPI ID Validation ---');
  const validHandles = [
    'merchant@oksbi',
    'business@paytm',
    'store@upi',
    'merchant@ibl',
    'freshcart.store@icici',
    'fresh_cart-123@hdfcbank',
    'support@axl',
    'billing.team@barodampay',
  ];

  for (const handle of validHandles) {
    const res = isValidUpiId(handle);
    assert(res.valid === true, `Accept valid ecosystem handle: "${handle}"`);
  }

  const invalidHandles = [
    '',
    'invalid',
    '@bank',
    'user@',
    'user @bank',
    'user@@bank',
    'a@b', // too short
  ];

  for (const handle of invalidHandles) {
    const res = isValidUpiId(handle);
    assert(res.valid === false, `Reject invalid handle: "${handle}"`);
  }

  // ----------------------------------------------------
  // TEST 2: Merchant / Payee Name Validation
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Merchant Name Validation ---');
  assert(isValidMerchantName('FreshCart').valid === true, 'Accept valid name "FreshCart"');
  assert(isValidMerchantName('FreshCart Grocery Store').valid === true, 'Accept valid name "FreshCart Grocery Store"');
  assert(isValidMerchantName('').valid === false, 'Reject empty merchant name');
  assert(isValidMerchantName('   ').valid === false, 'Reject whitespace-only merchant name');

  // ----------------------------------------------------
  // TEST 3: Admin UPI Settings Save & Read
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Admin Payment Settings Persistence ---');
  const initialSave = await saveUpiConfig('merchant1@bank', 'FreshCart Store');
  assert(initialSave.success === true, 'Save merchant1@bank to backend');
  assert(initialSave.config?.upiId === 'merchant1@bank', 'Config contains merchant1@bank');
  assert(initialSave.config?.merchantName === 'FreshCart Store', 'Config contains FreshCart Store');

  const retrieved1 = await getUpiConfig();
  assert(retrieved1 !== null, 'Retrieve saved settings from backend');
  assert(retrieved1?.upiId === 'merchant1@bank', 'Retrieved UPI ID matches merchant1@bank');
  assert(retrieved1?.merchantName === 'FreshCart Store', 'Retrieved Merchant Name matches FreshCart Store');

  // ----------------------------------------------------
  // TEST 4: Final Amount Calculation (₹427 Example)
  // Subtotal = ₹450, Discount = ₹50, Delivery = ₹27 -> Final: ₹427.00
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Final Order Amount Calculation (₹427) ---');
  const subtotal = 450;
  const discount = 50;
  const delivery = 27;
  const expectedTotal = 427;

  const initPayment1 = await initiateUpiPayment({
    orderId: 'FC-TEST-427',
    customerId: 'cust_test_1',
    subtotal,
    discount,
    deliveryCharges: delivery,
    total: expectedTotal,
  });

  assert(initPayment1.success === true, 'Initiate UPI payment attempt');
  assert(initPayment1.amount === 427, `Exact final amount is ₹427 (received: ${initPayment1.amount})`);
  assert(initPayment1.currency === 'INR', 'Currency is INR');
  assert(initPayment1.upiId === 'merchant1@bank', 'Uses configured UPI ID merchant1@bank');
  assert(initPayment1.merchantName === 'FreshCart Store', 'Uses configured merchant name');
  assert(Boolean(initPayment1.transactionRef), 'Stable transaction reference generated');

  const stableRef1 = initPayment1.transactionRef!;
  const expectedUri1 = `upi://pay?pa=merchant1%40bank&pn=FreshCart%20Store&am=427.00&cu=INR&tr=${encodeURIComponent(stableRef1)}`;
  assert(initPayment1.upiUri === expectedUri1, 'Generated UPI URI is app-agnostic and matches exact parameters');
  assert(!initPayment1.upiUri?.includes('phonepe://'), 'Does NOT use phonepe:// prefix');
  assert(!initPayment1.upiUri?.includes('gpay://'), 'Does NOT use gpay-specific URI');
  assert(!initPayment1.upiUri?.includes('paytm://'), 'Does NOT use paytm-specific URI');

  // ----------------------------------------------------
  // TEST 5: QR Code Generation
  // ----------------------------------------------------
  console.log('\n--- TEST 5: QR Code Generation ---');
  const qrDataUrl = await QRCode.toDataURL(initPayment1.upiUri!, { width: 256 });
  assert(qrDataUrl.startsWith('data:image/png;base64,'), 'QR Code generated as standard data URL image');
  assert(qrDataUrl.length > 500, 'QR Code image contains valid encoded raster data');

  // ----------------------------------------------------
  // TEST 6: Admin Merchant ID Change Test
  // Change merchant1@bank -> merchant2@bank
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Admin Merchant ID Change ---');
  const updateSave = await saveUpiConfig('merchant2@bank', 'FreshCart SuperStore');
  assert(updateSave.success === true, 'Change Admin UPI ID to merchant2@bank');

  const retrieved2 = await getUpiConfig();
  assert(retrieved2?.upiId === 'merchant2@bank', 'Retrieved configuration updated to merchant2@bank');

  // Initiate NEW payment -> MUST use merchant2@bank, NOT merchant1@bank
  const initPayment2 = await initiateUpiPayment({
    orderId: 'FC-TEST-NEW',
    customerId: 'cust_test_2',
    subtotal: 450,
    discount: 50,
    deliveryCharges: 27,
    total: 427,
  });

  assert(initPayment2.upiId === 'merchant2@bank', 'New payment uses updated merchant2@bank');
  assert(initPayment2.upiId !== 'merchant1@bank', 'New payment does NOT use old merchant1@bank');
  assert(initPayment2.merchantName === 'FreshCart SuperStore', 'New payment uses updated merchant name');
  assert(Boolean(initPayment2.upiUri?.includes('pa=merchant2%40bank')), 'UPI URI reflects merchant2@bank');

  // ----------------------------------------------------
  // TEST 7: Payment Verification & Return-To-Website Protection
  // Opening app, scanning QR, or returning is NOT payment success!
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Payment Verification & Return Handling ---');
  // Check newly initiated payment -> must remain PENDING / PENDING_VERIFICATION
  const checkPending = await verifyUpiPayment({
    transactionRef: initPayment2.transactionRef!,
    action: 'check',
  });

  assert(checkPending.verified === false, 'Unverified payment does NOT mark verified');
  assert(
    checkPending.paymentStatus === 'PENDING_VERIFICATION' || checkPending.paymentStatus === 'PENDING',
    `Unverified payment remains PENDING_VERIFICATION (received: ${checkPending.paymentStatus})`
  );

  // Test cancellation simulation
  const checkCancel = await verifyUpiPayment({
    transactionRef: initPayment2.transactionRef!,
    action: 'simulate_cancel',
  });
  assert(checkCancel.verified === false, 'Cancelled payment does not mark verified');
  assert(checkCancel.paymentStatus === 'CANCELLED', 'Status correctly recorded as CANCELLED');

  // Test failure simulation on a new payment
  const initPaymentFail = await initiateUpiPayment({
    orderId: 'FC-TEST-FAIL',
    customerId: 'cust_test_fail',
    subtotal: 100,
    discount: 0,
    deliveryCharges: 40,
    total: 140,
  });

  const checkFail = await verifyUpiPayment({
    transactionRef: initPaymentFail.transactionRef!,
    action: 'simulate_fail',
  });
  assert(checkFail.verified === false, 'Failed payment does not mark verified');
  assert(checkFail.paymentStatus === 'FAILED', 'Status correctly recorded as FAILED');

  // Test verified success confirmation
  const initPaymentSuccess = await initiateUpiPayment({
    orderId: 'FC-TEST-SUCCESS',
    customerId: 'cust_test_success',
    subtotal: 450,
    discount: 50,
    deliveryCharges: 27,
    total: 427,
  });

  const checkSuccess = await verifyUpiPayment({
    transactionRef: initPaymentSuccess.transactionRef!,
    action: 'confirm_payment',
  });

  assert(checkSuccess.verified === true, 'Verified payment marks verified = true');
  assert(checkSuccess.paymentStatus === 'PAID', 'Verified payment status is PAID');
  assert(checkSuccess.orderStatus === 'CONFIRMED', 'Order status updated to CONFIRMED');

  // Idempotency check: verifying again MUST NOT re-process or change status
  const checkIdempotency = await verifyUpiPayment({
    transactionRef: initPaymentSuccess.transactionRef!,
    action: 'check',
  });
  assert(checkIdempotency.verified === true, 'Subsequent check retains verified = true');
  assert(checkIdempotency.paymentStatus === 'PAID', 'Subsequent check retains PAID');
  assert(checkIdempotency.alreadyProcessed === true, 'Flagged as already processed (idempotent)');

  // ----------------------------------------------------
  // TEST 8: Anti-tampering amount validation
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Backend Amount Tamper Protection ---');
  const tamperResult = await initiateUpiPayment({
    orderId: 'FC-TAMPER-TEST',
    customerId: 'cust_tamper',
    subtotal: 450,
    discount: 50,
    deliveryCharges: 27,
    total: 1.0, // Client tries to pay ₹1 instead of ₹427!
  });

  assert(tamperResult.success === false, 'Backend rejects tampered payment total of ₹1.00');
  assert(tamperResult.code === 'AMOUNT_MISMATCH', 'Error code is AMOUNT_MISMATCH');

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
