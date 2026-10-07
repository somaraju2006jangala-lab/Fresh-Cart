/**
 * Validation script for FreshCart Cash on Delivery (COD) and Payment Flow Updates:
 *
 * 1. CASH ON DELIVERY — PAYMENT STATUS
 *    - paymentMethod: 'Cash on Delivery'
 *    - paymentStatus: 'PENDING'
 *    - status: 'CONFIRMED'
 *    - COD does NOT automatically become PAID or VERIFIED.
 *
 * 2. REMOVE OTP FOR CASH ON DELIVERY
 *    - No OTP requested, generated, sent, input, or verified for COD.
 *    - COD order placed directly without OTP blocker.
 *
 * 3. CUSTOMER ORDERS — REMOVE "VERIFY PAYMENT"
 *    - Customer cannot manually verify payment.
 *    - No customer-facing "Verify Payment" button in CustomerDashboard.
 *
 * 4. PRESERVE ADMIN PAYMENT VERIFICATION
 *    - AdminPortal still contains Verify Payment and Admin payment proof verification.
 *
 * 5. ONLINE UPI & PROOF FLOW PRESERVED
 *    - Screenshot upload, QR interactions, Direct UPI preserved.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { generateOrderOtp, verifyOrderOtp, getCustomerOrderOtp } from '../server/otpService';
import { upsertOrderInDb, findOrderInDb } from '../server/db';

async function runCodFlowValidation() {
  console.log('===========================================================');
  console.log('FreshCart COD & Payment Verification Flow Validation');
  console.log('===========================================================');

  // STEP 1: Verify CheckoutPage.tsx implementation
  console.log('\nSTEP 1: Checking CheckoutPage.tsx COD and OTP handling...');
  const checkoutPagePath = path.join(process.cwd(), 'src/components/CheckoutPage.tsx');
  const checkoutPageCode = fs.readFileSync(checkoutPagePath, 'utf8');

  assert(
    checkoutPageCode.includes("status: isUpi ? 'PAYMENT VERIFICATION PENDING' : (isCod ? 'CONFIRMED' : 'Picking')"),
    'CheckoutPage must set order status to CONFIRMED for COD'
  );
  assert(
    checkoutPageCode.includes("paymentStatus: isUpi ? 'PENDING VERIFICATION' : 'PENDING'"),
    'CheckoutPage must set paymentStatus to PENDING for COD'
  );
  assert(
    checkoutPageCode.includes('if (!isCod) {') &&
      checkoutPageCode.includes('generateOrderOtp('),
    'CheckoutPage must bypass generateOrderOtp when isCod is true'
  );
  assert(
    checkoutPageCode.includes("paymentMethod !== 'cash' && orderHandoverOtp"),
    'CheckoutPage must hide Handover OTP box when paymentMethod is cash'
  );
  console.log('✓ CheckoutPage.tsx sets COD status to CONFIRMED, paymentStatus to PENDING, and bypasses OTP.');

  // STEP 2: Verify CheckoutModal.tsx implementation
  console.log('\nSTEP 2: Checking CheckoutModal.tsx COD and OTP handling...');
  const checkoutModalPath = path.join(process.cwd(), 'src/components/CheckoutModal.tsx');
  const checkoutModalCode = fs.readFileSync(checkoutModalPath, 'utf8');

  assert(
    checkoutModalCode.includes("status: isUpi ? 'PAYMENT VERIFICATION PENDING' : (isCod ? 'CONFIRMED' : 'Picking')"),
    'CheckoutModal must set order status to CONFIRMED for COD'
  );
  assert(
    checkoutModalCode.includes("paymentStatus: isUpi ? 'PENDING VERIFICATION' : 'PENDING'"),
    'CheckoutModal must set paymentStatus to PENDING for COD'
  );
  assert(
    checkoutModalCode.includes('if (!isCod) {') &&
      checkoutModalCode.includes('generateOrderOtp('),
    'CheckoutModal must bypass generateOrderOtp for COD'
  );
  assert(
    checkoutModalCode.includes("orderHandoverOtp && paymentMethod !== 'cash'"),
    'CheckoutModal must hide Handover OTP box when paymentMethod is cash'
  );
  console.log('✓ CheckoutModal.tsx sets COD status to CONFIRMED, paymentStatus to PENDING, and bypasses OTP.');

  // STEP 3: Verify CustomerDashboard.tsx
  console.log('\nSTEP 3: Checking CustomerDashboard.tsx customer orders and badge handling...');
  const customerDashboardPath = path.join(process.cwd(), 'src/components/CustomerDashboard.tsx');
  const customerDashboardCode = fs.readFileSync(customerDashboardPath, 'utf8');

  // Verify no customer-facing "Verify Payment" button
  assert(
    !customerDashboardCode.includes('Verify Payment'),
    'CustomerDashboard must NOT contain any customer-facing "Verify Payment" button'
  );
  assert(
    !customerDashboardCode.includes('verifyPayment'),
    'CustomerDashboard must NOT contain verifyPayment handler'
  );
  // Verify COD orders do not fetch OTP
  assert(
    customerDashboardCode.includes("!isCod && !customerOrderOtps[order.id]"),
    'CustomerDashboard must not fetch OTP for COD orders'
  );
  // Verify COD orders do not render OTP box
  assert(
    customerDashboardCode.includes("!order.paymentMethod?.toLowerCase().includes('cash')"),
    'CustomerDashboard must not render OTP box for COD orders'
  );
  // Verify Payment Pending badge logic
  assert(
    customerDashboardCode.includes("order.paymentStatus === 'PENDING' || order.paymentStatus === 'Pending'"),
    'CustomerDashboard must display Payment Pending badge for PENDING paymentStatus'
  );
  assert(
    customerDashboardCode.includes("order.status === 'CONFIRMED'"),
    'CustomerDashboard must display Order Confirmed badge for CONFIRMED status'
  );
  console.log('✓ CustomerDashboard has NO customer "Verify Payment" button, hides OTP for COD, and displays Payment Pending.');

  // STEP 4: Verify AdminPortal.tsx preserves Admin Payment Verification
  console.log('\nSTEP 4: Checking AdminPortal.tsx preserves Admin payment verification...');
  const adminPortalPath = path.join(process.cwd(), 'src/components/AdminPortal.tsx');
  const adminPortalCode = fs.readFileSync(adminPortalPath, 'utf8');

  assert(
    adminPortalCode.includes('Verify Payment'),
    'AdminPortal must preserve admin "Verify Payment" functionality'
  );
  assert(
    adminPortalCode.includes('adminVerifyPaymentProof'),
    'AdminPortal must preserve adminVerifyPaymentProof function'
  );
  console.log('✓ AdminPortal.tsx completely preserves Admin payment verification functionality.');

  // STEP 5: Backend OTP Service COD isolation test
  console.log('\nSTEP 5: Testing backend OTP handling for COD orders...');
  const codOrderId = `FC-COD-TEST-${Date.now()}`;
  await upsertOrderInDb({
    id: codOrderId,
    customerId: 'test-cod-user',
    customerName: 'Test COD User',
    deliveryAddress: '123 Test Lane',
    deliveryTimeSlot: '24-30 Minutes',
    items: [],
    subtotal: 350,
    discount: 0,
    total: 350,
    status: 'CONFIRMED',
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'PENDING',
    createdAt: new Date().toISOString(),
  });

  // Attempting to generate OTP for COD order
  const codGenRes = await generateOrderOtp(codOrderId, 'test-cod-user', '9876543210');
  assert.strictEqual(
    codGenRes.success,
    false,
    'Backend generateOrderOtp must return false for Cash on Delivery orders'
  );
  assert(
    codGenRes.error?.includes('Cash on Delivery') || codGenRes.message?.includes('Cash on Delivery'),
    'Backend must report OTP is not required for COD'
  );

  // Attempting to get customer OTP for COD order
  const codGetRes = await getCustomerOrderOtp(codOrderId, 'test-cod-user');
  assert.strictEqual(
    codGetRes.success,
    false,
    'Backend getCustomerOrderOtp must return false for Cash on Delivery orders'
  );

  // Attempting to verify OTP for COD order
  const codVerifyRes = await verifyOrderOtp(codOrderId, '123456');
  assert.strictEqual(
    codVerifyRes.success,
    false,
    'Backend verifyOrderOtp must return false for Cash on Delivery orders'
  );
  console.log('✓ Backend OTP endpoints correctly bypass/reject OTP requests for Cash on Delivery orders.');

  // STEP 6: Non-COD (UPI) OTP flow remains functional
  console.log('\nSTEP 6: Testing backend OTP generation for non-COD (UPI/Online) orders...');
  const upiOrderId = `FC-UPI-TEST-${Date.now()}`;
  await upsertOrderInDb({
    id: upiOrderId,
    customerId: 'test-upi-user',
    customerName: 'Test UPI User',
    deliveryAddress: '456 Test Blvd',
    deliveryTimeSlot: '24-30 Minutes',
    items: [],
    subtotal: 500,
    discount: 0,
    total: 500,
    status: 'Picking',
    paymentMethod: 'UPI / QR Payment',
    paymentStatus: 'PENDING VERIFICATION',
    createdAt: new Date().toISOString(),
  });

  const upiGenRes = await generateOrderOtp(upiOrderId, 'test-upi-user', '9876543210');
  assert.strictEqual(
    upiGenRes.success,
    true,
    'Backend generateOrderOtp must succeed for online/UPI orders'
  );
  assert(upiGenRes.otp && upiGenRes.otp.length === 6, 'Generated OTP must be 6 digits for non-COD orders');
  console.log('✓ Online/UPI orders continue to generate and support Order Handover OTP as expected.');

  console.log('\n===========================================================');
  console.log('🎉 ALL COD & PAYMENT FLOW VALIDATION TESTS PASSED PERFECTLY!');
  console.log('===========================================================');
}

runCodFlowValidation().catch((err) => {
  console.error('Validation failed with error:', err);
  process.exit(1);
});
