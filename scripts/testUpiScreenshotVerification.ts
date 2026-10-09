import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { apiApp } from '../server/apiRouter.ts';
import { signCustomerToken } from '../server/jwtHelper.ts';
import {
  connectMySql,
  upsertCustomerInDb,
  upsertOrderInDb,
  findOrderInDb,
  getPaymentRecordByOrderId,
  createUpiPaymentAttemptInDb,
  getPool,
} from '../server/db.ts';

// Helper to simulate express HTTP requests to apiApp
async function simulateRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  requestUrl: string,
  headers: Record<string, string> = {},
  body: any = null
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve) => {
    const [pathPart, queryPart] = requestUrl.split('?');
    const query: Record<string, string> = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((v, k) => {
        query[k] = v;
      });
    }

    let responseStatusCode = 200;
    const responseHeaders: Record<string, string> = {};
    let responseBody: any = null;

    const req: any = {
      method,
      url: requestUrl,
      path: pathPart,
      query,
      headers: (() => {
        const h: Record<string, string> = { 'content-type': 'application/json' };
        for (const [k, v] of Object.entries(headers)) {
          h[k.toLowerCase()] = v;
        }
        return h;
      })(),
      body: body || {},
    };

    const res: any = {
      status(code: number) {
        responseStatusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        responseHeaders[name.toLowerCase()] = value;
        return this;
      },
      json(data: any) {
        responseBody = data;
        resolve({ status: responseStatusCode, body: responseBody, headers: responseHeaders });
        return this;
      },
      send(data: any) {
        responseBody = data;
        resolve({ status: responseStatusCode, body: responseBody, headers: responseHeaders });
        return this;
      },
      end(data?: any) {
        if (data !== undefined && responseBody === null) responseBody = data;
        resolve({ status: responseStatusCode, body: responseBody, headers: responseHeaders });
      },
    };

    apiApp(req, res, (err: any) => {
      if (err) {
        resolve({ status: 500, body: { error: err.message }, headers: responseHeaders });
      } else {
        resolve({ status: responseStatusCode, body: responseBody, headers: responseHeaders });
      }
    });
  });
}

// 1x1 Transparent PNG in Base64 (valid magic bytes: 89 50 4E 47 0D 0A 1A 0A)
const VALID_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Tiny valid JPEG in Base64 (valid magic bytes: FF D8 FF)
const VALID_JPG_BASE64 =
  'data:image/jpeg;base64,' +
  Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
    0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xff, 0xda, 0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0x00, 0xff, 0xd9,
  ]).toString('base64');

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING FRESHCART UPI SCREENSHOT VERIFICATION TESTS');
  console.log('====================================================\n');

  await connectMySql();

  const customerId = `cust_test_${Date.now()}`;
  const customerEmail = `test_${Date.now()}@example.com`;
  const customerPhone = `98765${Math.floor(100000 + Math.random() * 900000)}`;
  const customerName = 'Priya Sharma';

  await upsertCustomerInDb({
    id: customerId,
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
    address: '123 Market St, Bangalore',
  });

  const customerToken = signCustomerToken({
    id: customerId,
    customerId,
    email: customerEmail,
    name: customerName,
  });

  const orderId = `FC-TEST-${Date.now()}`;
  const orderAmount = 850;

  console.log(`[Setup] Created customer ${customerId} and order ${orderId}`);

  // Create initial order in DB with online UPI payment
  await upsertOrderInDb({
    id: orderId,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    deliveryAddress: '123 Market St, Bangalore',
    items: [{ id: '1', name: 'Fresh Apples', price: 850, quantity: 1 }],
    subtotal: 850,
    deliveryCharges: 0,
    taxAndPacking: 0,
    total: orderAmount,
    discount: 0,
    status: 'Picking',
    paymentMethod: 'UPI QR',
    paymentStatus: 'PAYMENT_ATTEMPTED',
    orderDate: new Date().toISOString(),
  });

  await createUpiPaymentAttemptInDb({
    paymentId: `PAY-${orderId}`,
    orderId,
    customerId,
    amount: orderAmount,
    upiId: 'freshcart@okaxis',
    merchantName: 'FreshCart Store',
    transactionRef: `REF-${orderId}`,
    paymentMethod: 'UPI QR',
    paymentStatus: 'PAYMENT_ATTEMPTED',
  });

  // TEST 1: Reject non-image file (e.g. text or pdf file disguised with .png name)
  console.log('\n--- TEST 1: Reject Invalid File Content (Disguised Text File) ---');
  const fakePngBase64 = 'data:image/png;base64,' + Buffer.from('NOT AN IMAGE FILE CONTENT').toString('base64');
  const resInvalidType = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId,
      fileName: 'fake.png',
      fileType: 'image/png',
      fileSize: 30,
      fileData: fakePngBase64,
    }
  );
  assert.strictEqual(resInvalidType.status, 400, 'Should reject invalid file content with 400');
  assert.ok(resInvalidType.body.error.includes('PNG') || resInvalidType.body.error.includes('format'), 'Should return invalid file format message');
  console.log('✓ TEST 1 PASSED: Invalid file type safely rejected.');

  // TEST 2: Reject oversized file (> 10MB)
  console.log('\n--- TEST 2: Reject Oversized File (> 10MB) ---');
  const oversizedBase64 = 'data:image/png;base64,' + Buffer.alloc(10 * 1024 * 1024 + 1024).toString('base64');
  const resOversized = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId,
      fileName: 'large.png',
      fileType: 'image/png',
      fileData: oversizedBase64,
    }
  );
  assert.strictEqual(resOversized.status, 400, 'Should reject file > 10MB with 400');
  assert.ok(resOversized.body.error.includes('10 MB') || resOversized.body.error.includes('10MB'), 'Should state 10MB limit in error');
  console.log('✓ TEST 2 PASSED: Oversized file safely rejected.');

  // TEST 3: Successful upload of valid PNG
  console.log('\n--- TEST 3: Successful Upload of Valid PNG ---');
  const resValidUpload = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId,
      fileName: 'payment_proof.png',
      fileType: 'image/png',
      fileSize: 100,
      fileData: VALID_PNG_BASE64,
    }
  );
  assert.strictEqual(resValidUpload.status, 200, 'Upload should succeed with 200');
  assert.strictEqual(resValidUpload.body.paymentStatus, 'PENDING_VERIFICATION', 'Status must be PENDING_VERIFICATION');
  assert.ok(resValidUpload.body.screenshotUrl, 'Should return screenshotUrl');

  // Verify in MySQL
  const orderInDb = await findOrderInDb(orderId);
  assert.strictEqual(orderInDb?.paymentStatus, 'PENDING_VERIFICATION', 'MySQL order paymentStatus must be PENDING_VERIFICATION');
  const paymentInDb = await getPaymentRecordByOrderId(orderId);
  assert.strictEqual(paymentInDb?.paymentStatus, 'PENDING_VERIFICATION', 'MySQL payment paymentStatus must be PENDING_VERIFICATION');
  assert.ok(paymentInDb?.screenshotPath, 'Screenshot path must be stored in DB');
  assert.ok(fs.existsSync(paymentInDb.screenshotPath), 'Screenshot file must exist on disk');
  assert.strictEqual(paymentInDb.otpSent, 0, 'Upload must NOT send OTP');
  console.log('✓ TEST 3 PASSED: Screenshot uploaded and associated with order. Status is PENDING_VERIFICATION. No OTP sent.');

  // TEST 3B: Enforce One Upload Restriction - Second Upload Blocked
  console.log('\n--- TEST 3B: Block Second Upload For Same Order While PENDING_VERIFICATION ---');
  const resDuplicateUpload = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId,
      fileName: 'second_attempt.png',
      fileType: 'image/png',
      fileSize: 100,
      fileData: VALID_PNG_BASE64,
    }
  );
  assert.strictEqual(resDuplicateUpload.status, 400, 'Second upload for same order must be rejected with 400');
  assert.strictEqual(resDuplicateUpload.body.alreadySubmitted, true, 'Response must flag alreadySubmitted: true');
  assert.ok(
    resDuplicateUpload.body.error.includes('already been submitted') ||
      resDuplicateUpload.body.error.includes('pending admin verification'),
    'Error message must state proof has already been submitted'
  );
  console.log('✓ TEST 3B PASSED: Second upload attempt for the same order was safely blocked.');

  // TEST 4: Private storage & access control
  console.log('\n--- TEST 4: Access Control & Persistence After Multiple Views ---');
  // 4a: Unauthenticated access
  const resUnauth = await simulateRequest('GET', `/api/payments/screenshot/${orderId}`);
  assert.strictEqual(resUnauth.status, 401, 'Unauthenticated access must return 401');

  // 4b: Unauthorized customer (different customer)
  const otherCustToken = signCustomerToken({ id: 'other_cust', customerId: 'other_cust' });
  const resForbidden = await simulateRequest('GET', `/api/payments/screenshot/${orderId}`, {
    Authorization: `Bearer ${otherCustToken}`,
  });
  assert.strictEqual(resForbidden.status, 403, 'Unauthorized customer access must return 403');

  // 4c: Customer who owns order
  const resOwner = await simulateRequest('GET', `/api/payments/screenshot/${orderId}`, {
    Authorization: `Bearer ${customerToken}`,
  });
  assert.strictEqual(resOwner.status, 200, 'Order owner must be able to view screenshot');

  // 4d: Admin viewing multiple times
  const resAdminView1 = await simulateRequest('GET', `/api/payments/screenshot/${orderId}`, {
    'x-admin-role': 'admin',
  });
  assert.strictEqual(resAdminView1.status, 200, 'Admin must be able to view screenshot (view 1)');

  const resAdminView2 = await simulateRequest('GET', `/api/payments/screenshot/${orderId}`, {
    'x-admin-role': 'admin',
  });
  assert.strictEqual(resAdminView2.status, 200, 'Admin must be able to view screenshot (view 2)');
  assert.ok(fs.existsSync(paymentInDb.screenshotPath), 'Screenshot must NOT be deleted upon viewing');
  console.log('✓ TEST 4 PASSED: Private screenshot access enforced. Multiple views allowed without file deletion.');

  // TEST 5: Admin rejection & Customer retry
  console.log('\n--- TEST 5: Admin Payment Rejection & Customer Retry Process ---');
  const resReject = await simulateRequest(
    'POST',
    '/api/admin/payments/verify',
    { 'x-admin-role': 'admin' },
    { orderId, action: 'REJECT', notes: 'UTR number is illegible. Please re-upload clear proof.' }
  );
  assert.strictEqual(resReject.status, 200, 'Reject endpoint should succeed');
  assert.strictEqual(resReject.body.paymentStatus, 'REJECTED', 'Status must be REJECTED');

  const rejectedPaymentDb = await getPaymentRecordByOrderId(orderId);
  assert.strictEqual(rejectedPaymentDb?.paymentStatus, 'REJECTED');
  assert.ok(fs.existsSync(rejectedPaymentDb.screenshotPath!), 'Screenshot must be retained on rejection for admin audit');
  assert.strictEqual(rejectedPaymentDb.otpSent, 0, 'Rejection must NOT trigger OTP');

  // Customer retries with a new valid JPEG screenshot after rejection: MUST SUCCEED
  const resRetryUpload = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId,
      fileName: 'retry_payment_proof.jpg',
      fileType: 'image/jpeg',
      fileSize: 120,
      fileData: VALID_JPG_BASE64,
    }
  );
  assert.strictEqual(resRetryUpload.status, 200, 'Retry upload after rejection should succeed');
  assert.strictEqual(resRetryUpload.body.paymentStatus, 'PENDING_VERIFICATION', 'Status must return to PENDING_VERIFICATION');

  const retriedPaymentDb = await getPaymentRecordByOrderId(orderId);
  assert.strictEqual(retriedPaymentDb?.paymentStatus, 'PENDING_VERIFICATION');
  assert.ok(fs.existsSync(retriedPaymentDb.screenshotPath!), 'New screenshot must exist on disk');

  // Immediately attempting another upload after replacement: MUST BE BLOCKED AGAIN
  const resBlockAfterReplacement = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId,
      fileName: 'extra_after_replacement.jpg',
      fileType: 'image/jpeg',
      fileSize: 120,
      fileData: VALID_JPG_BASE64,
    }
  );
  assert.strictEqual(resBlockAfterReplacement.status, 400, 'Upload after replacement must be blocked again');
  assert.strictEqual(resBlockAfterReplacement.body.alreadySubmitted, true);
  console.log('✓ TEST 5 PASSED: Rejection preserves proof, allows replacement upload, and re-locks further uploads.');

  // TEST 6: Successful Admin Verification (Mark as PAID)
  console.log('\n--- TEST 6: Admin Verification Approval (Mark as PAID) & File Purging ---');
  const fileToPurgePath = retriedPaymentDb.screenshotPath!;
  assert.ok(fs.existsSync(fileToPurgePath), 'File must exist before approval');

  const resApprove = await simulateRequest(
    'POST',
    '/api/admin/payments/verify',
    { 'x-admin-role': 'admin' },
    { orderId, action: 'APPROVE', notes: 'Payment verified with HDFC UPI transaction.' }
  );
  assert.strictEqual(resApprove.status, 200, 'Approval endpoint must succeed');
  assert.strictEqual(resApprove.body.paymentStatus, 'PAID', 'Status must be PAID');
  assert.strictEqual(resApprove.body.otpSent, true, 'OTP must be dispatched upon approval');

  // Check MySQL DB
  const approvedOrderDb = await findOrderInDb(orderId);
  assert.strictEqual(approvedOrderDb?.paymentStatus, 'PAID', 'Order paymentStatus in MySQL must be PAID');
  assert.ok(approvedOrderDb?.verifiedAt, 'Order must preserve verifiedAt');
  assert.ok(approvedOrderDb?.verifiedBy, 'Order must preserve verifiedBy');

  const approvedPaymentDb = await getPaymentRecordByOrderId(orderId);
  assert.strictEqual(approvedPaymentDb?.paymentStatus, 'PAID', 'Payment paymentStatus in MySQL must be PAID');
  assert.strictEqual(approvedPaymentDb?.otpSent, 1, 'otpSent must be 1 in MySQL');
  assert.ok(approvedPaymentDb?.verifiedAt, 'verifiedAt audit timestamp must be saved');
  assert.ok(approvedPaymentDb?.verifiedBy, 'verifiedBy admin must be saved');

  // Verify file was securely deleted from disk
  assert.ok(!fs.existsSync(fileToPurgePath), 'Stored screenshot file must be unlinked/deleted from disk upon PAID');

  // Verify GET screenshot endpoint returns 404
  const resDeletedGet = await simulateRequest('GET', `/api/payments/screenshot/${orderId}`, {
    'x-admin-role': 'admin',
  });
  assert.strictEqual(resDeletedGet.status, 404, 'Deleted screenshot URL must return 404');

  // Verify attempting to upload for a PAID order is permanently blocked
  const resUploadOnPaid = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId,
      fileName: 'paid_order_attempt.png',
      fileType: 'image/png',
      fileSize: 100,
      fileData: VALID_PNG_BASE64,
    }
  );
  assert.strictEqual(resUploadOnPaid.status, 400, 'Upload on PAID order must be rejected');
  assert.strictEqual(resUploadOnPaid.body.alreadyPaid, true, 'Response must flag alreadyPaid: true');
  console.log('✓ TEST 6 PASSED: Order marked PAID in MySQL. Screenshot file securely deleted. Upload on PAID permanently blocked.');

  // TEST 7: Duplicate OTP & Verification Prevention
  console.log('\n--- TEST 7: Duplicate Approval & OTP Prevention ---');
  const resDuplicateApprove = await simulateRequest(
    'POST',
    '/api/admin/payments/verify',
    { 'x-admin-role': 'admin' },
    { orderId, action: 'APPROVE', notes: 'Repeated approval attempt' }
  );
  assert.strictEqual(resDuplicateApprove.status, 200);
  assert.strictEqual(resDuplicateApprove.body.otpSent, false, 'Repeated approval must NOT send duplicate OTP');
  console.log('✓ TEST 7 PASSED: Duplicate verification and OTP sending successfully prevented.');

  // TEST 8: Cash on Delivery (COD) Checkout - OTP Completely Removed
  console.log('\n--- TEST 8: Cash on Delivery Flow (No OTP Generated or Required) ---');
  const codOrderId = `FC-COD-${Date.now()}`;
  await upsertOrderInDb({
    id: codOrderId,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    deliveryAddress: '123 Market St, Bangalore',
    items: [{ id: '2', name: 'Organic Milk', price: 60, quantity: 2 }],
    subtotal: 120,
    deliveryCharges: 40,
    taxAndPacking: 0,
    total: 160,
    discount: 0,
    status: 'Picking',
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'Pending',
    orderDate: new Date().toISOString(),
  });

  const { getOrderOtpStatus } = await import('../server/otpService.ts');
  const codOtpStatus = getOrderOtpStatus(codOrderId);
  assert.strictEqual(codOtpStatus.hasRecord, false, 'COD order must have no OTP record generated');
  assert.strictEqual(codOtpStatus.status, 'NOT_FOUND', 'COD order OTP status must be NOT_FOUND');
  console.log('✓ TEST 8 PASSED: Cash on Delivery orders operate without OTP generation or requirement.');

  // TEST 9: Separate Order Eligibility
  console.log('\n--- TEST 9: Independent Upload Eligibility Across Different Orders ---');
  const orderId2 = `FC-TEST-2-${Date.now()}`;
  await upsertOrderInDb({
    id: orderId2,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    deliveryAddress: '456 Residency Rd, Bangalore',
    items: [{ id: '1', name: 'Alphonso Mangoes', price: 150, quantity: 1 }],
    subtotal: 150,
    deliveryCharges: 0,
    taxAndPacking: 0,
    total: 150,
    discount: 0,
    status: 'Pending',
    paymentMethod: 'UPI',
    paymentStatus: 'PAYMENT_ATTEMPTED',
    orderDate: new Date().toISOString(),
  });
  await createUpiPaymentAttemptInDb({
    paymentId: `PAY-${orderId2}`,
    orderId: orderId2,
    customerId,
    amount: 150,
    upiId: 'freshcart@okaxis',
    merchantName: 'FreshCart Store',
    transactionRef: `FC-REF-2-${Date.now()}`,
    paymentMethod: 'UPI',
    paymentStatus: 'PAYMENT_ATTEMPTED',
  });

  // Uploading for Order 2 must SUCCEED even though Order 1 is already PAID
  const resOrder2Upload = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId: orderId2,
      fileName: 'order2_proof.png',
      fileType: 'image/png',
      fileSize: 100,
      fileData: VALID_PNG_BASE64,
    }
  );
  assert.strictEqual(resOrder2Upload.status, 200, 'Order 2 upload must succeed independently');
  assert.strictEqual(resOrder2Upload.body.paymentStatus, 'PENDING_VERIFICATION');

  // But second upload for Order 2 must be blocked
  const resOrder2Duplicate = await simulateRequest(
    'POST',
    '/api/payments/screenshot/upload',
    { Authorization: `Bearer ${customerToken}` },
    {
      orderId: orderId2,
      fileName: 'order2_dup.png',
      fileType: 'image/png',
      fileSize: 100,
      fileData: VALID_PNG_BASE64,
    }
  );
  assert.strictEqual(resOrder2Duplicate.status, 400, 'Duplicate upload for Order 2 must be blocked');
  assert.strictEqual(resOrder2Duplicate.body.alreadySubmitted, true);
  console.log('✓ TEST 9 PASSED: Separate orders have independent upload eligibility.');

  console.log('\n====================================================');
  console.log('ALL UPI SCREENSHOT & VERIFICATION TESTS PASSED (10/10)!');
  console.log('====================================================');

  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
