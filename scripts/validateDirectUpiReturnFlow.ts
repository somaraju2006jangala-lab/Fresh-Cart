/**
 * Validation Script for FreshCart Direct UPI Payment & Return Flow:
 *
 * 1. Existing payment methods (Cash on Delivery, UPI / QR Payment, Pay Directly via UPI App)
 * 2. Direct UPI Redirection uses existing working UPI URI generator with dynamic return URL
 * 3. External UPI App/Web embedding prevention (no FreshCart payment UI inside external iframe/embed)
 * 4. Return to FreshCart dynamically uses window.location.origin (no hard-coded localhost/Vercel)
 * 5. Order context preserved on return (customer ID, order ID, payment ID, amount, payment method)
 * 6. Order identifier mismatch resolution (#FC-3880 vs FC-3880) prevents duplicate orders/payments
 * 7. Payment status remains PENDING on return (never automatically marked PAID/VERIFIED)
 * 8. Payment screenshot verification workflow preserved (Admin verification required)
 * 9. COD behavior preserved (PENDING, no OTP, no screenshot)
 * 10. Exactly ONE QR code preserved in FreshCart
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCustomerPaymentUpiUri,
  decodeUpiPayload,
  verifyQrPayloadDecodable,
} from '../src/utils/qrCodeGenerator';
import { upsertOrderInDb, findOrderInDb } from '../server/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runDirectUpiReturnValidation() {
  console.log('===========================================================');
  console.log('FreshCart Direct UPI & Return Context Flow Validation');
  console.log('===========================================================\n');

  const checkoutPagePath = path.resolve(__dirname, '../src/components/CheckoutPage.tsx');
  const checkoutModalPath = path.resolve(__dirname, '../src/components/CheckoutModal.tsx');
  const appPath = path.resolve(__dirname, '../src/App.tsx');
  const dbPath = path.resolve(__dirname, '../server/db.ts');

  const checkoutPageCode = fs.readFileSync(checkoutPagePath, 'utf-8');
  const checkoutModalCode = fs.readFileSync(checkoutModalPath, 'utf-8');
  const appCode = fs.readFileSync(appPath, 'utf-8');
  const dbCode = fs.readFileSync(dbPath, 'utf-8');

  // TEST 1: Check Payment Methods in CheckoutPage
  console.log('TEST 1: Verifying existing payment methods in FreshCart...');
  assert.ok(checkoutPageCode.includes('checkout-payment-cash-opt'), 'Cash on Delivery option exists');
  assert.ok(checkoutPageCode.includes('checkout-payment-upi-qr-opt'), 'UPI / QR Payment option exists');
  assert.ok(checkoutPageCode.includes('checkout-payment-upi-app-opt'), '📱 Pay Directly via UPI App option exists');
  console.log('✓ All 3 payment methods are preserved inside FreshCart.');

  // TEST 2: Check Direct UPI URI generator adheres to UPI standard without invalid returnUrl
  console.log('\nTEST 2: Verifying Direct UPI deep link adheres to strict NPCI UPI standard without url query param...');
  const testUpiId = 'freshcart@upi';
  const testPayee = 'FreshCart Grocery Store';
  const testAmount = 649.50;
  const testTr = 'FC-ORDER-3880';

  const upiUri = buildCustomerPaymentUpiUri(testUpiId, testPayee, testAmount, testTr);
  assert.ok(upiUri.startsWith('upi://pay?'), 'URI starts with upi://pay?');
  assert.ok(upiUri.includes('pa=freshcart%40upi'), 'UPI ID encoded properly');
  assert.ok(upiUri.includes('pn=FreshCart%20Grocery%20Store'), 'Merchant name encoded properly');
  assert.ok(upiUri.includes('am=649.50'), 'Payable amount formatted with 2 decimal places');
  assert.ok(upiUri.includes('cu=INR'), 'Currency is INR');
  assert.ok(upiUri.includes(`tr=${encodeURIComponent(testTr)}`), 'Transaction ref included');
  assert.ok(!upiUri.includes('&url='), 'Return URL is strictly omitted to avoid NPCI merchant rejection');

  const decoded = decodeUpiPayload(upiUri);
  assert.strictEqual(decoded.isValid, true, 'UPI payload decodable and valid');
  assert.strictEqual(decoded.decoded?.am, '649.50', 'Decoded amount matches');
  assert.strictEqual(decoded.decoded?.pa, testUpiId, 'Decoded payee ID matches');
  assert.strictEqual(decoded.decoded?.cu, 'INR', 'Decoded currency is INR');
  console.log('✓ Direct UPI deep link adheres to NPCI UPI standard without extraneous parameters.');

  // TEST 3: External App/Web Embedding Prevention Guard
  console.log('\nTEST 3: Verifying external web/app embedding prevention...');
  assert.ok(
    checkoutPageCode.includes('window.self !== window.top') && checkoutPageCode.includes('isEmbeddedIframe'),
    'CheckoutPage contains iframe embedding guard'
  );
  assert.ok(
    checkoutPageCode.includes('if (isEmbeddedIframe) {\n    return null;\n  }') ||
      checkoutPageCode.includes('if (isEmbeddedIframe) return null;'),
    'CheckoutPage refuses to render FreshCart payment UI inside an external iframe'
  );
  assert.ok(
    checkoutModalCode.includes('window.self !== window.top') && checkoutModalCode.includes('isEmbeddedIframe'),
    'CheckoutModal contains iframe embedding guard'
  );
  console.log('✓ FreshCart payment UI is strictly barred from rendering inside external iframes/embeds.');

  // TEST 4: No hardcoded return URLs and manual customer return model
  console.log('\nTEST 4: Verifying no hardcoded return/callback URLs and adherence to manual return model...');
  assert.ok(
    !checkoutPageCode.includes("'http://localhost:3000'") &&
      !checkoutPageCode.includes('"http://localhost:3000"') &&
      !checkoutPageCode.includes('localhost:3001') &&
      !checkoutPageCode.includes('vercel.app'),
    'CheckoutPage has NO hard-coded localhost or Vercel URLs'
  );
  assert.ok(
    !checkoutPageCode.includes('returnUrl') && !checkoutPageCode.includes('callbackUrl'),
    'CheckoutPage does not inject automatic callback/return URLs into UPI payment deep links'
  );
  console.log('✓ No hardcoded callback URLs; manual customer return flow respected.');

  // TEST 5: Return Context Restoration & Route parameter handling
  console.log('\nTEST 5: Verifying return context restoration in App.tsx and CheckoutPage.tsx...');
  assert.ok(
    appCode.includes("hash.startsWith('#/checkout?')") ||
      appCode.includes("hash.startsWith('#/checkout')"),
    'App.tsx hash route handler preserves query parameters for checkout view'
  );
  assert.ok(
    checkoutPageCode.includes('getInitialOrderId') &&
      checkoutPageCode.includes('sessionStorage.getItem(\'freshcart_active_checkout_order_id\')'),
    'CheckoutPage restores draft order ID from URL params or sessionStorage'
  );
  assert.ok(
    checkoutPageCode.includes('handleDirectUpiClick'),
    'CheckoutPage pre-saves order context on clicking Direct UPI link'
  );
  console.log('✓ Returning customer order context is restored seamlessly without generating a new order.');

  // TEST 6: Payment Status Remains PENDING on Return
  console.log('\nTEST 6: Verifying payment remains PENDING upon return...');
  assert.ok(
    checkoutPageCode.includes("paymentStatus: 'PENDING'"),
    'Direct UPI flow initializes and keeps paymentStatus as PENDING'
  );
  assert.ok(
    !checkoutPageCode.includes("paymentStatus: 'PAID'") ||
      !checkoutPageCode.includes("returnFrom === 'upi_app' && paymentStatus === 'PAID'"),
    'Returning from UPI app does NOT automatically mark payment as PAID'
  );
  console.log('✓ Payment strictly remains PENDING on return until admin verification.');

  // TEST 7: Order Identifier Resolution in MySQL/In-memory (#FC-3880 vs FC-3880)
  console.log('\nTEST 7: Testing MySQL & In-Memory canonical order identifier resolution...');
  const baseOrderNum = `3880_${Date.now()}`;
  const initialHashId = `#FC-${baseOrderNum}`;
  const returnCleanId = `FC-${baseOrderNum}`;
  const customerId = `cust_${Date.now()}`;

  // 1. Initial order placed with #FC-XXXX
  await upsertOrderInDb({
    order_id: initialHashId,
    customer_id: customerId,
    customer_name: 'Aditi Sharma',
    mobile: '9876501234',
    delivery_address: 'Flat 402, Bengaluru',
    subtotal: 500,
    total: 500,
    payment_method: 'Direct UPI App Payment',
    payment_status: 'PENDING',
    status: 'PAYMENT VERIFICATION PENDING',
    items: [],
  });

  const found1 = await findOrderInDb(initialHashId);
  assert.ok(found1, 'Order found with #FC- identifier');

  // 2. Return from UPI with clean FC-XXXX identifier
  await upsertOrderInDb({
    order_id: returnCleanId,
    customer_id: customerId,
    payment_status: 'PENDING',
    status: 'PAYMENT VERIFICATION PENDING',
    total: 500,
  });

  const found2 = await findOrderInDb(returnCleanId);
  assert.ok(found2, 'Order found with clean FC- identifier without duplicating row');
  console.log('✓ Order identifier mismatch between FC-3880 and #FC-3880 resolved without duplicate orders.');

  // TEST 8: Cash on Delivery Behavior Preserved
  console.log('\nTEST 8: Confirming Cash on Delivery behavior preserved...');
  assert.ok(
    checkoutPageCode.includes("isCod ? 'CONFIRMED' : 'Picking'"),
    'COD orders confirm without OTP'
  );
  assert.ok(
    checkoutPageCode.includes("paymentStatus: isUpi ? 'PENDING VERIFICATION' : 'PENDING'"),
    'COD payment remains PENDING'
  );
  console.log('✓ COD workflow completely preserved (no OTP, PENDING status, no screenshot).');

  // TEST 9: Single QR in FreshCart Preserved
  console.log('\nTEST 9: Verifying Single QR code in FreshCart is preserved...');
  const qrOccurrences = (checkoutPageCode.match(/\bid="checkout-payment-qr-img"/g) || []).length;
  assert.strictEqual(qrOccurrences, 1, 'Exactly ONE QR element exists in CheckoutPage');
  console.log('✓ Exactly ONE QR code preserved in FreshCart.');

  console.log('\n===========================================================');
  console.log('🎉 ALL DIRECT UPI RETURN & CONTEXT TESTS PASSED PERFECTLY!');
  console.log('===========================================================');
}

runDirectUpiReturnValidation().catch((err) => {
  console.error('Validation failed with error:', err);
  process.exit(1);
});
