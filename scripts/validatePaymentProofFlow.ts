import assert from 'node:assert';
import {
  savePaymentProofInDb,
  getPaymentProofForOrderInDb,
  getAllPaymentProofsInDb,
  verifyPaymentProofInDb,
  upsertOrderInDb,
  findOrderInDb,
} from '../server/db';
import { validateFileBufferMagicBytes } from '../server/apiRouter';

async function runTests() {
  console.log('--- STARTING PAYMENT SCREENSHOT VERIFICATION TESTS ---');

  // 1. Magic Bytes Validation Tests
  console.log('1. Testing magic byte validation...');
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  assert.strictEqual(validateFileBufferMagicBytes(jpegHeader).isValid, true);
  assert.strictEqual(validateFileBufferMagicBytes(jpegHeader).mimeType, 'image/jpeg');

  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.strictEqual(validateFileBufferMagicBytes(pngHeader).isValid, true);
  assert.strictEqual(validateFileBufferMagicBytes(pngHeader).mimeType, 'image/png');

  const pdfHeader = Buffer.from('%PDF-1.4\n%test pdf content');
  assert.strictEqual(validateFileBufferMagicBytes(pdfHeader).isValid, true);
  assert.strictEqual(validateFileBufferMagicBytes(pdfHeader).mimeType, 'application/pdf');

  // Invalid fake file with spoofed extension
  const fakePdfHeader = Buffer.from('NOT_A_REAL_PDF_JUST_TEXT');
  assert.strictEqual(validateFileBufferMagicBytes(fakePdfHeader).isValid, false);

  const fakePngHeader = Buffer.from('FAKE_PNG_HEADER_HERE');
  assert.strictEqual(validateFileBufferMagicBytes(fakePngHeader).isValid, false);

  console.log('✓ Magic byte validation passes as expected.');

  // 2. Mock Order Creation
  const testOrderId = `ORD-TEST-${Date.now()}`;
  const testCustomerId = `cust_${Date.now()}`;

  await upsertOrderInDb({
    order_id: testOrderId,
    customer_id: testCustomerId,
    customer_name: 'Rajesh Kumar',
    mobile: '9876543210',
    email: 'rajesh@example.com',
    delivery_address: '123 MG Road, Bengaluru',
    subtotal: 450,
    discount: 0,
    delivery_charge: 40,
    total: 490,
    payment_method: 'UPI / QR Payment',
    payment_status: 'PENDING VERIFICATION',
    order_status: 'PAYMENT VERIFICATION PENDING',
    items: [
      {
        product: { id: 'prod-1', title: 'Fresh Alphonso Mangoes', price: 245, unit: '1 kg', stock: 50, sku: 'MNG-01' } as any,
        quantity: 2,
      },
    ],
  });

  const orderRecord = await findOrderInDb(testOrderId);
  assert.ok(orderRecord, 'Order should be created');
  assert.strictEqual(orderRecord.payment_status, 'PENDING VERIFICATION');
  assert.strictEqual(orderRecord.order_status, 'PAYMENT VERIFICATION PENDING');
  console.log('✓ Initial order created with status PAYMENT VERIFICATION PENDING and payment PENDING VERIFICATION.');

  // 3. Customer Uploads Payment Proof
  const fakeBase64Data = `data:image/jpeg;base64,${jpegHeader.toString('base64')}`;
  const saveSuccess = await savePaymentProofInDb({
    orderId: testOrderId,
    customerId: testCustomerId,
    fileName: 'upi_payment_screenshot.jpg',
    fileType: 'image/jpeg',
    fileSize: 1024 * 150, // 150 KB
    fileData: fakeBase64Data,
    verificationStatus: 'PENDING_VERIFICATION',
  });

  assert.strictEqual(saveSuccess, true, 'Proof should be saved successfully');

  // Verify retrieval
  const retrievedProof = await getPaymentProofForOrderInDb(testOrderId);
  assert.ok(retrievedProof, 'Proof should be retrievable for order');
  assert.strictEqual(retrievedProof.orderId, testOrderId);
  assert.strictEqual(retrievedProof.fileName, 'upi_payment_screenshot.jpg');
  assert.strictEqual(retrievedProof.verificationStatus, 'PENDING_VERIFICATION');
  console.log('✓ Payment proof successfully saved and linked to order and customer.');

  // 4. Admin Views All Payment Proofs
  const allProofs = await getAllPaymentProofsInDb();
  const foundProof = allProofs.find((p) => p.orderId === testOrderId);
  assert.ok(foundProof, 'Admin must see the submitted payment proof');
  assert.strictEqual(foundProof.verificationStatus, 'PENDING_VERIFICATION');
  console.log('✓ Admin retrieved submitted payment proof list successfully.');

  // 5. Admin Verification Flow
  console.log('5. Testing admin verification...');
  const verifyResult = await verifyPaymentProofInDb(testOrderId, 'VERIFY', 'Admin User', 'Payment verified from bank statement');
  assert.strictEqual(verifyResult.success, true);
  assert.strictEqual(verifyResult.verificationStatus, 'VERIFIED');
  assert.strictEqual(verifyResult.paymentStatus, 'PAID');
  assert.strictEqual(verifyResult.orderStatus, 'CONFIRMED');

  const verifiedOrder = await findOrderInDb(testOrderId);
  assert.ok(verifiedOrder);
  assert.strictEqual(verifiedOrder.payment_status, 'PAID');
  assert.strictEqual(verifiedOrder.order_status, 'CONFIRMED');
  console.log('✓ Payment verification updated order to CONFIRMED and payment to PAID.');

  // 6. Admin Rejection Flow on another order
  console.log('6. Testing admin rejection flow...');
  const testOrderId2 = `ORD-TEST-REJECT-${Date.now()}`;
  await upsertOrderInDb({
    order_id: testOrderId2,
    customer_id: testCustomerId,
    customer_name: 'Rajesh Kumar',
    mobile: '9876543210',
    total: 350,
    payment_method: '📱 Pay Directly via UPI App',
    payment_status: 'PENDING VERIFICATION',
    order_status: 'PAYMENT VERIFICATION PENDING',
    items: [],
  });

  await savePaymentProofInDb({
    orderId: testOrderId2,
    customerId: testCustomerId,
    fileName: 'blurry_screenshot.jpg',
    fileType: 'image/jpeg',
    fileSize: 1024 * 80,
    fileData: fakeBase64Data,
    verificationStatus: 'PENDING_VERIFICATION',
  });

  const rejectResult = await verifyPaymentProofInDb(testOrderId2, 'REJECT', 'Admin User', 'Reference number does not match amount');
  assert.strictEqual(rejectResult.success, true);
  assert.strictEqual(rejectResult.verificationStatus, 'REJECTED');
  assert.strictEqual(rejectResult.paymentStatus, 'REJECTED');
  assert.strictEqual(rejectResult.orderStatus, 'REJECTED');

  const rejectedOrder = await findOrderInDb(testOrderId2);
  assert.ok(rejectedOrder);
  assert.strictEqual(rejectedOrder.payment_status, 'REJECTED');
  assert.strictEqual(rejectedOrder.order_status, 'REJECTED');
  console.log('✓ Payment rejection updated status to REJECTED and kept unconfirmed.');

  // 7. Customer Can Replace Rejected Payment Proof
  console.log('7. Testing customer replacement of rejected proof...');
  const replaceSuccess = await savePaymentProofInDb({
    orderId: testOrderId2,
    customerId: testCustomerId,
    fileName: 'clear_payment_screenshot.jpg',
    fileType: 'image/jpeg',
    fileSize: 1024 * 200,
    fileData: fakeBase64Data,
    verificationStatus: 'PENDING_VERIFICATION',
  });

  assert.strictEqual(replaceSuccess, true);
  const retrievedReplaced = await getPaymentProofForOrderInDb(testOrderId2);
  assert.ok(retrievedReplaced);
  assert.strictEqual(retrievedReplaced.verificationStatus, 'PENDING_VERIFICATION');
  assert.strictEqual(retrievedReplaced.fileName, 'clear_payment_screenshot.jpg');

  const reloadedOrder = await findOrderInDb(testOrderId2);
  assert.ok(reloadedOrder);
  assert.strictEqual(reloadedOrder.payment_status, 'PENDING VERIFICATION');
  assert.strictEqual(reloadedOrder.order_status, 'PAYMENT VERIFICATION PENDING');
  console.log('✓ Customer successfully replaced rejected proof, transitioning order back to PAYMENT VERIFICATION PENDING.');

  console.log('--- ALL PAYMENT SCREENSHOT VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
