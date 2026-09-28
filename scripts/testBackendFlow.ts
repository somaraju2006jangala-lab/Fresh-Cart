import assert from 'assert';
import { apiApp } from '../server/apiRouter.ts';
import {
  signCustomerToken,
  verifyCustomerToken,
  JWT_SECRET,
} from '../server/jwtHelper.ts';
import {
  generateOrderOtp,
  verifyOrderOtp,
  resendOrderOtp,
  getOrderOtpStatus,
  getCustomerOrderOtp,
} from '../server/otpService.ts';
import { OrderModel } from '../server/models/Order.ts';
import { CustomerModel } from '../server/models/Customer.ts';
import {
  isMongoConnected,
  connectMongo,
  checkDatabaseAvailability,
  isProductionEnv,
  findOrderInDb,
  upsertOrderInDb,
  findCustomerInDb,
  upsertCustomerInDb,
} from '../server/db.ts';

// Helper to simulate express HTTP requests to apiApp
async function simulateRequest(
  method: 'GET' | 'POST',
  path: string,
  headers: Record<string, string> = {},
  body: any = null
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const [pathPart, queryPart] = path.split('?');
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
      url: path,
      path: pathPart,
      query,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
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
        resolve({ status: responseStatusCode, body: responseBody });
        return this;
      },
      end(data?: any) {
        if (data && !responseBody) {
          try {
            responseBody = JSON.parse(data);
          } catch {
            responseBody = data;
          }
        }
        resolve({ status: responseStatusCode, body: responseBody });
        return this;
      },
    };

    (apiApp as any)(req, res, () => {
      resolve({ status: 404, body: { error: 'Route not found' } });
    });
  });
}

async function runTests() {
  console.log('====================================================');
  console.log(' FreshCart: Backend Order Handover OTP & DB Tests');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    Error: ${err?.message || err}`);
    }
  }

  // 1. JWT Authentication Tests
  await test('JWT Helper: signs and verifies customer token correctly', () => {
    const token = signCustomerToken({ id: 'rahul123', email: 'rahul@example.com' });
    assert(token && typeof token === 'string', 'Token should be a non-empty string');
    const result = verifyCustomerToken(token);
    assert.strictEqual(result.valid, true, 'Token should be valid');
    assert.strictEqual(result.decoded?.id, 'rahul123', 'Decoded ID should match');
  });

  await test('JWT Helper: rejects malformed or invalid tokens', () => {
    const result = verifyCustomerToken('invalid.jwt.token');
    assert.strictEqual(result.valid, false, 'Invalid token should not be valid');
    assert(result.error?.includes('Invalid'), 'Error should indicate invalid token');
  });

  // 2. Authentication Verification on GET /api/otp/customer-order-otp/:orderId
  await test('API: returns 401 Unauthorized when no authentication is provided', async () => {
    const res = await simulateRequest('GET', '/api/otp/customer-order-otp/FC-TEST-1');
    assert.strictEqual(res.status, 401, 'Should return 401 when no customer auth is provided');
    assert.strictEqual(res.body.success, false);
    assert(res.body.error.includes('Authentication required'));
  });

  await test('API: returns 401 Unauthorized when invalid Bearer token is provided', async () => {
    const res = await simulateRequest(
      'GET',
      '/api/otp/customer-order-otp/FC-TEST-1',
      { authorization: 'Bearer completely_fake_token_here' }
    );
    assert.strictEqual(res.status, 401, 'Should return 401 on invalid Bearer token');
    assert.strictEqual(res.body.success, false);
    assert(res.body.error.includes('Invalid'));
  });

  // 3. Customer Isolation & Authorization
  await test('API: returns 403 Forbidden when Customer B accesses Customer A order OTP', async () => {
    const rahulToken = signCustomerToken({ id: 'rahul123' });
    const priyaToken = signCustomerToken({ id: 'priya123' });

    // Ensure order #FC-1005 belongs to rahul123
    const resForbidden = await simulateRequest(
      'GET',
      '/api/otp/customer-order-otp/%23FC-1005',
      { authorization: `Bearer ${priyaToken}` }
    );
    assert.strictEqual(resForbidden.status, 403, 'Should return 403 Forbidden for cross-customer attempt');
    assert.strictEqual(resForbidden.body.success, false);
    assert(resForbidden.body.error.includes('Access denied'), 'Error should clearly state access denied');

    // Rahul accessing his own order #FC-1005 succeeds
    const resSuccess = await simulateRequest(
      'GET',
      '/api/otp/customer-order-otp/%23FC-1005',
      { authorization: `Bearer ${rahulToken}` }
    );
    assert.strictEqual(resSuccess.status, 200, 'Owner accessing order OTP should return 200');
    assert.strictEqual(resSuccess.body.success, true);
    assert.strictEqual(typeof resSuccess.body.otp, 'string');
    assert.strictEqual(resSuccess.body.otp.length, 6, 'OTP must be 6 digits');
  });

  await test('API: returns 404 Not Found for non-existent orders', async () => {
    const token = signCustomerToken({ id: 'rahul123' });
    const res = await simulateRequest(
      'GET',
      '/api/otp/customer-order-otp/NON-EXISTENT-ORDER-999999',
      { authorization: `Bearer ${token}` }
    );
    assert.strictEqual(res.status, 404, 'Should return 404 for unknown order');
    assert.strictEqual(res.body.success, false);
    assert(res.body.error.includes('not found') || res.body.error.includes('Not found'));
  });

  // 4. Newly Created Orders Automatically Get Active Backend OTP
  await test('Flow: newly created Picking order automatically receives active 6-digit OTP', async () => {
    const newOrderId = `FC-NEW-${Date.now()}`;
    const customerId = 'cust-rahul-auto';
    const token = signCustomerToken({ id: customerId });

    // Pre-register known order
    const { registerKnownOrder } = await import('../server/otpService.ts');
    registerKnownOrder({
      id: newOrderId,
      customerId,
      customerPhone: '+91 9876543210',
      status: 'Picking',
    });

    // Query OTP via customer API
    const res = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${newOrderId}`,
      { authorization: `Bearer ${token}` }
    );

    assert.strictEqual(res.status, 200, 'Should return 200');
    assert.strictEqual(res.body.success, true);
    assert(res.body.otp && /^\d{6}$/.test(res.body.otp), 'Newly created order must have 6-digit numeric OTP');
    assert.strictEqual(res.body.isExpired, false, 'OTP must not be expired');
    assert(res.body.expiresAt > Date.now(), 'ExpiresAt must be in the future (10 min)');
  });

  // 5. Same OTP Returned on Refresh (Idempotent / No regeneration on read)
  await test('Flow: same OTP is returned when customer refreshes the Orders page', async () => {
    const orderId = `FC-REFRESH-${Date.now()}`;
    const customerId = 'cust-refresh-user';
    const token = signCustomerToken({ id: customerId });

    const { registerKnownOrder } = await import('../server/otpService.ts');
    registerKnownOrder({
      id: orderId,
      customerId,
      customerPhone: '+91 9876543210',
      status: 'Picking',
    });

    // First retrieval
    const res1 = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    assert.strictEqual(res1.status, 200);
    const firstOtp = res1.body.otp;

    // Second retrieval (simulating customer page refresh)
    const res2 = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    assert.strictEqual(res2.status, 200);
    const secondOtp = res2.body.otp;

    assert.strictEqual(secondOtp, firstOtp, 'Refreshing Orders page MUST return the exact same active OTP');
  });

  // 6. Opening Admin OTP Verification Screen Does NOT Regenerate Customer OTP
  await test('Flow: opening Admin OTP verification screen does NOT regenerate customer OTP', async () => {
    const orderId = `FC-ADMIN-CHECK-${Date.now()}`;
    const customerId = 'cust-admin-test';
    const token = signCustomerToken({ id: customerId });

    const { registerKnownOrder } = await import('../server/otpService.ts');
    registerKnownOrder({
      id: orderId,
      customerId,
      customerPhone: '+91 9876543210',
      status: 'Picking',
    });

    // Customer obtains OTP
    const custRes1 = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    const originalOtp = custRes1.body.otp;

    // Admin opens verification screen and queries status
    const adminRes = await simulateRequest(
      'GET',
      `/api/otp/status/${orderId}`,
      { 'x-admin-role': 'admin' }
    );
    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(adminRes.body.status, 'UNUSED');
    assert.strictEqual(adminRes.body.otp, undefined, 'Admin status endpoint must NOT expose plain OTP');

    // Customer queries OTP again
    const custRes2 = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    assert.strictEqual(custRes2.body.otp, originalOtp, 'Customer OTP must NOT be changed by Admin screen opening');
  });

  // 7. OTP Verification & One-Time-Use Enforcement
  await test('Flow: correct OTP marks order Delivered; used OTP cannot be reused', async () => {
    const orderId = `FC-VERIFY-${Date.now()}`;
    const customerId = 'cust-verify-test';
    const token = signCustomerToken({ id: customerId });

    const { registerKnownOrder } = await import('../server/otpService.ts');
    registerKnownOrder({
      id: orderId,
      customerId,
      customerPhone: '+91 9876543210',
      status: 'Picking',
    });

    // Get active OTP
    const otpRes = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    const activeOtp = otpRes.body.otp;

    // Incorrect OTP attempt
    const failRes = await simulateRequest(
      'POST',
      '/api/otp/verify',
      {},
      { orderId, otp: '000000' }
    );
    assert.strictEqual(failRes.status, 200);
    assert.strictEqual(failRes.body.success, false);
    assert.strictEqual(failRes.body.status, 'Picking', 'Order must stay in Picking on invalid OTP');

    // Correct OTP verification
    const successRes = await simulateRequest(
      'POST',
      '/api/otp/verify',
      {},
      { orderId, otp: activeOtp }
    );
    assert.strictEqual(successRes.status, 200);
    assert.strictEqual(successRes.body.success, true);
    assert.strictEqual(successRes.body.status, 'Delivered', 'Order must transition to Delivered');

    // Reuse attempt (same OTP must NEVER work again)
    const reuseRes = await simulateRequest(
      'POST',
      '/api/otp/verify',
      {},
      { orderId, otp: activeOtp }
    );
    assert.strictEqual(reuseRes.body.success, false, 'Used OTP cannot be reused');
    assert.strictEqual(reuseRes.body.status, 'Delivered');

    // Customer OTP endpoint returns USED status without exposing active OTP
    const custAfterDelivery = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    assert.strictEqual(custAfterDelivery.status, 200);
    assert.strictEqual(custAfterDelivery.body.status, 'USED');
    assert.strictEqual(custAfterDelivery.body.otp, undefined, 'Delivered orders must not expose active OTP');
  });

  // 8. Resend OTP Behavior
  await test('Flow: resend OTP invalidates previous OTP and generates a fresh 6-digit OTP', async () => {
    const orderId = `FC-RESEND-${Date.now()}`;
    const customerId = 'cust-resend-test';
    const token = signCustomerToken({ id: customerId });

    const { registerKnownOrder } = await import('../server/otpService.ts');
    registerKnownOrder({
      id: orderId,
      customerId,
      customerPhone: '+91 9876543210',
      status: 'Picking',
    });

    // Obtain OTP 1
    const res1 = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    const otp1 = res1.body.otp;

    // Resend OTP
    const resendRes = await simulateRequest(
      'POST',
      '/api/otp/resend',
      {},
      { orderId, customerId, customerPhone: '+91 9876543210' }
    );
    assert.strictEqual(resendRes.status, 200);
    assert.strictEqual(resendRes.body.success, true);
    const otp2 = resendRes.body.otp;
    assert.notStrictEqual(otp1, otp2, 'Resent OTP must be a new code');

    // Verifying old OTP 1 must fail
    const oldVerify = await simulateRequest(
      'POST',
      '/api/otp/verify',
      {},
      { orderId, otp: otp1 }
    );
    assert.strictEqual(oldVerify.body.success, false, 'Invalidated old OTP must fail');

    // Verifying new OTP 2 must succeed
    const newVerify = await simulateRequest(
      'POST',
      '/api/otp/verify',
      {},
      { orderId, otp: otp2 }
    );
    assert.strictEqual(newVerify.body.success, true, 'New OTP must verify successfully');
    assert.strictEqual(newVerify.body.status, 'Delivered');
  });

  // 9. MongoDB Models & Schema Validation
  await test('MongoDB Models: OrderModel and CustomerModel schemas are correctly configured', () => {
    assert(OrderModel, 'OrderModel must be defined');
    assert.strictEqual(OrderModel.modelName, 'Order');
    assert(CustomerModel, 'CustomerModel must be defined');
    assert.strictEqual(CustomerModel.modelName, 'Customer');
  });

  // 10. Production Behavior Verification: Never Silently Use Local Disk
  await test('Production Strictness: Production fails explicitly (503) when MONGODB_URI is missing or unreachable', async () => {
    const origEnv = process.env.NODE_ENV;
    const origVercel = process.env.VERCEL;
    const origMongo = process.env.MONGODB_URI;

    try {
      // Simulate production / Vercel runtime with missing MONGODB_URI
      process.env.NODE_ENV = 'production';
      delete process.env.MONGODB_URI;
      delete process.env.MONGO_URI;

      // Check DB availability check in production
      const check = checkDatabaseAvailability();
      assert.strictEqual(check.available, false, 'DB must not be available without MONGODB_URI in production');
      assert.strictEqual(check.code, 'MONGODB_URI_MISSING', 'Should report MONGODB_URI_MISSING code');

      // Check API endpoint returns 503 Service Unavailable in production instead of silent local fallback
      const token = signCustomerToken({ id: 'rahul123' });
      const res = await simulateRequest(
        'GET',
        '/api/otp/customer-order-otp/%23FC-1005',
        { authorization: `Bearer ${token}` }
      );
      assert.strictEqual(res.status, 503, 'Must return 503 Service Unavailable in production without MongoDB');
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'MONGODB_URI_MISSING');
      assert(res.body.error.includes('MONGODB_URI is missing'), 'Must give clear database configuration error');

      // Orders POST endpoint must also reject with 503 in production without MongoDB
      const orderRes = await simulateRequest(
        'POST',
        '/api/orders',
        {},
        { id: 'FC-PROD-TEST', customerId: 'cust-1' }
      );
      assert.strictEqual(orderRes.status, 503, 'Order creation must fail with 503 in production without MongoDB');

      // Customers POST endpoint must also reject with 503 in production without MongoDB
      const custRes = await simulateRequest(
        'POST',
        '/api/customers',
        {},
        { id: 'CUST-PROD-TEST', email: 'prod@test.com' }
      );
      assert.strictEqual(custRes.status, 503, 'Customer creation must fail with 503 in production without MongoDB');
    } finally {
      // Restore environment
      process.env.NODE_ENV = origEnv;
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
      if (origMongo !== undefined) process.env.MONGODB_URI = origMongo;
    }
  });

  // 11. Local Development Mode Behavior
  await test('Development Mode: allows development workflow without breaking', async () => {
    // In development mode (NODE_ENV !== 'production' and no VERCEL):
    assert.strictEqual(isProductionEnv(), false, 'Should be in development mode');
    const check = checkDatabaseAvailability();
    assert.strictEqual(check.available, true, 'Development mode permits local test workflow');
  });

  // 12. POST /api/auth/token endpoint
  await test('Auth API: POST /api/auth/token issues valid customer JWT token', async () => {
    const res = await simulateRequest(
      'POST',
      '/api/auth/token',
      {},
      { customerId: 'rahul123', email: 'rahul@example.com', name: 'Rahul' }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert(res.body.token, 'Should return a JWT token string');

    const verify = verifyCustomerToken(res.body.token);
    assert.strictEqual(verify.valid, true);
    assert.strictEqual(verify.decoded?.customerId, 'rahul123');
  });

  console.log(`\nTest Summary: ${passed} / ${total} tests passed.`);
  if (passed === total) {
    console.log('✓ All Backend Order Handover OTP & Database tests PASSED successfully!\n');
    process.exit(0);
  } else {
    console.error(`✗ ${total - passed} tests failed!\n`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
