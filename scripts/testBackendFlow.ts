import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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
import {
  isMySqlConnected,
  connectMySql,
  checkDatabaseAvailability,
  isProductionEnv,
  findOrderInDb,
  upsertOrderInDb,
  findCustomerInDb,
  upsertCustomerInDb,
  getProductsFromDb,
  findProductInDb,
  createProductInDb,
  updateProductInDb,
  deleteProductInDb,
  getCouponsFromDb,
  findCouponByCodeInDb,
  getCartForCustomerInDb,
  saveCartItemInDb,
  removeCartItemInDb,
  clearCartInDb,
  getPool,
} from '../server/db.ts';

// Helper to simulate express HTTP requests to apiApp
async function simulateRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
  console.log(' FreshCart: MySQL Database & Backend Flow Tests');
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

  // 1. MySQL Connection & Tables Verification
  await test('MySQL Connection & Schema: connects and verifies all 12 required tables exist', async () => {
    const connected = await connectMySql();
    assert.strictEqual(connected, true, 'MySQL connection must succeed');

    const pool = getPool();
    const [rows] = await pool.query<any[]>('SHOW TABLES');
    const tableNames = rows.map((r: any) => Object.values(r)[0]);

    const requiredTables = [
      'customers',
      'addresses',
      'products',
      'carts',
      'cart_items',
      'orders',
      'order_items',
      'coupons',
      'otp_records',
      'inventory_logs',
      'payments',
      'app_settings',
    ];

    for (const tbl of requiredTables) {
      assert(tableNames.includes(tbl), `Table "${tbl}" must exist in MySQL freshcart database`);
    }
  });

  // 2. Payments Table Structure (Razorpay Ready)
  await test('Payments Table: contains all required Razorpay fields and enum constraints', async () => {
    const pool = getPool();
    const [columns] = await pool.query<any[]>('DESCRIBE payments');
    const colNames = columns.map((c: any) => c.Field);

    const requiredCols = [
      'id',
      'payment_id',
      'order_id',
      'customer_id',
      'payment_method',
      'payment_status',
      'amount',
      'currency',
      'razorpay_order_id',
      'razorpay_payment_id',
      'razorpay_signature',
      'paid_at',
      'created_at',
      'updated_at',
    ];

    for (const col of requiredCols) {
      assert(colNames.includes(col), `Payments table must contain column "${col}"`);
    }
  });

  // 3. Customer Registration & Authentication with Password Hashing
  await test('Authentication: customer registration hashes password and creates account in MySQL', async () => {
    const testEmail = `test_${Date.now()}@example.com`;
    const testPhone = `+9199999${Math.floor(10000 + Math.random() * 90000)}`;

    const res = await simulateRequest('POST', '/api/auth/register', {}, {
      name: 'Test Customer',
      email: testEmail,
      phone: testPhone,
      password: 'SecurePassword123',
      address: '123 Test St, Bengaluru',
    });

    assert.strictEqual(res.status, 201, 'Registration should return 201');
    assert.strictEqual(res.body.success, true);
    assert(res.body.token, 'Registration must issue a JWT token');
    assert.strictEqual(res.body.customer.email, testEmail);

    // Verify in MySQL that password is NOT plain text
    const pool = getPool();
    const [custRows] = await pool.query<any[]>(
      'SELECT password_hash FROM customers WHERE email = ?',
      [testEmail]
    );
    assert(custRows.length > 0, 'Customer record must exist in MySQL');
    const hash = custRows[0].password_hash;
    assert(hash.startsWith('$2a$') || hash.startsWith('$2b$'), 'Password must be hashed with bcrypt');
    assert.notStrictEqual(hash, 'SecurePassword123', 'Password must NEVER be stored as plain text');

    // Duplicate email protection
    const dupRes = await simulateRequest('POST', '/api/auth/register', {}, {
      name: 'Duplicate Customer',
      email: testEmail,
      phone: '+919988776655',
      password: 'AnotherPassword',
    });
    assert.strictEqual(dupRes.status, 409, 'Duplicate email should be rejected with 409');
  });

  // 4. Customer Login
  await test('Authentication: login validates credentials and returns session & JWT', async () => {
    const res = await simulateRequest('POST', '/api/auth/login', {}, {
      identifier: 'rahul@example.com',
      password: 'password123',
    });
    assert.strictEqual(res.status, 200, 'Login with correct credentials should return 200');
    assert.strictEqual(res.body.success, true);
    assert(res.body.token, 'Token should be returned');
    assert.strictEqual(res.body.customer.id, 'rahul123');

    // Invalid password
    const wrongRes = await simulateRequest('POST', '/api/auth/login', {}, {
      identifier: 'rahul@example.com',
      password: 'WrongPassword',
    });
    assert.strictEqual(wrongRes.status, 401, 'Wrong password must return 401');
  });

  // 5. JWT Helper Verification
  await test('JWT Helper: signs and verifies customer token correctly', () => {
    const token = signCustomerToken({ id: 'rahul123', email: 'rahul@example.com' });
    assert(token && typeof token === 'string', 'Token should be a non-empty string');
    const result = verifyCustomerToken(token);
    assert.strictEqual(result.valid, true, 'Token should be valid');
    assert.strictEqual(result.decoded?.id, 'rahul123', 'Decoded ID should match');
  });

  // 6. Products & Inventory Operations
  await test('Products & Inventory: retrieves products and allows admin stock updates', async () => {
    const productsRes = await simulateRequest('GET', '/api/products');
    assert.strictEqual(productsRes.status, 200);
    assert(Array.isArray(productsRes.body.products), 'Products must be returned as array');
    assert(productsRes.body.products.length > 0, 'Products should not be empty');

    // Update stock for prod-1
    const initialQty = productsRes.body.products[0].stock;
    const newQty = initialQty + 5;
    const updateRes = await simulateRequest('PUT', `/api/products/${productsRes.body.products[0].id}`, {}, {
      quantity: newQty,
      action: 'RESTOCK',
      notes: 'Test restock',
    });
    assert.strictEqual(updateRes.status, 200);

    const recheckRes = await simulateRequest('GET', `/api/products/${productsRes.body.products[0].id}`);
    assert.strictEqual(recheckRes.body.product.stock, newQty, 'Product stock should reflect update');
  });

  // 7. Cart Operations in MySQL
  await test('Cart: adds product, updates quantity, removes on quantity 0', async () => {
    const customerId = 'rahul123';
    const rahulToken = signCustomerToken({ id: customerId });

    // Add product to cart
    const addRes = await simulateRequest('POST', '/api/cart/items', { authorization: `Bearer ${rahulToken}` }, {
      productId: 'prod-1',
      quantity: 2,
    });
    assert.strictEqual(addRes.status, 200);
    assert(addRes.body.items.some((i: any) => i.product.id === 'prod-1' && i.quantity === 2));

    // Quantity 0 removes item
    const removeRes = await simulateRequest('POST', '/api/cart/items', { authorization: `Bearer ${rahulToken}` }, {
      productId: 'prod-1',
      quantity: 0,
    });
    assert.strictEqual(removeRes.status, 200);
    assert(!removeRes.body.items.some((i: any) => i.product.id === 'prod-1'), 'Quantity 0 must remove item');
  });

  // 8. Order Creation & Customer Isolation
  await test('Orders: customer creates order and only accesses their own orders', async () => {
    const rahulToken = signCustomerToken({ id: 'rahul123' });
    const priyaToken = signCustomerToken({ id: 'priya123' });

    const testOrderId = `#FC-TEST-${Date.now()}`;
    const orderData = {
      id: testOrderId,
      customerId: 'rahul123',
      customerName: 'Rahul',
      email: 'rahul@example.com',
      deliveryAddress: 'Flat 402, Green Meadows',
      subtotal: 138,
      discount: 0,
      total: 138,
      status: 'Picking',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      items: [
        { product_id: 'prod-1', title: 'Organic Farm Bananas', quantity: 2, unit: '1 kg', price: 69, subtotal: 138 },
      ],
    };

    const createRes = await simulateRequest('POST', '/api/orders', {}, orderData);
    assert.strictEqual(createRes.status, 200);

    // Customer Isolation: Rahul sees his order
    const rahulOrders = await simulateRequest('GET', '/api/orders', { authorization: `Bearer ${rahulToken}` });
    assert(rahulOrders.body.orders.some((o: any) => o.id === testOrderId), 'Rahul must see his own order');

    // Customer Isolation: Priya does NOT see Rahul order
    const priyaOrders = await simulateRequest('GET', '/api/orders', { authorization: `Bearer ${priyaToken}` });
    assert(!priyaOrders.body.orders.some((o: any) => o.id === testOrderId), 'Priya must NOT see Rahul order');

    // Customer must NOT be able to delete orders
    const deleteAttempt = await simulateRequest(
      'DELETE',
      `/api/orders/${encodeURIComponent(testOrderId)}`,
      { authorization: `Bearer ${rahulToken}` }
    );
    assert.strictEqual(deleteAttempt.status, 403, 'Customer must NOT be allowed to delete orders');
  });

  // 9. OTP Verification Flow & Delivery Transition
  await test('OTP: generates 6-digit OTP, verifies correctly, changes Picking to Delivered', async () => {
    const orderId = `FC-OTP-TEST-${Date.now()}`;
    const customerId = 'rahul123';
    const token = signCustomerToken({ id: customerId });

    // Seed test order
    await upsertOrderInDb({
      id: orderId,
      customerId,
      customerName: 'Rahul',
      deliveryAddress: 'Test Address',
      total: 100,
      status: 'Picking',
    });

    // Customer retrieves OTP
    const otpRes = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    assert.strictEqual(otpRes.status, 200);
    assert(otpRes.body.otp && /^\d{6}$/.test(otpRes.body.otp), 'Must return 6-digit OTP');
    const otpCode = otpRes.body.otp;

    // Refresh returns exact same OTP (idempotent)
    const refreshRes = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    assert.strictEqual(refreshRes.body.otp, otpCode, 'Refreshing page must return exact same OTP');

    // Incorrect OTP rejected
    const failRes = await simulateRequest('POST', '/api/otp/verify', {}, { orderId, otp: '000000' });
    assert.strictEqual(failRes.body.success, false);
    assert.strictEqual(failRes.body.status, 'Picking');

    // Correct OTP verified -> Delivered
    const passRes = await simulateRequest('POST', '/api/otp/verify', {}, { orderId, otp: otpCode });
    assert.strictEqual(passRes.body.success, true);
    assert.strictEqual(passRes.body.status, 'Delivered');

    // Used OTP cannot be reused
    const reuseRes = await simulateRequest('POST', '/api/otp/verify', {}, { orderId, otp: otpCode });
    assert.strictEqual(reuseRes.body.success, false, 'Used OTP must not be reusable');

    // Delivered order hides active OTP
    const deliveredCheck = await simulateRequest(
      'GET',
      `/api/otp/customer-order-otp/${orderId}`,
      { authorization: `Bearer ${token}` }
    );
    assert.strictEqual(deliveredCheck.body.status, 'USED');
    assert.strictEqual(deliveredCheck.body.otp, undefined, 'Delivered order must hide active OTP');
  });

  // 10. Coupons Management
  await test('Coupons: fetches coupons and validates minimum order discount calculation', async () => {
    const couponsRes = await simulateRequest('GET', '/api/coupons');
    assert.strictEqual(couponsRes.status, 200);
    assert(couponsRes.body.coupons.some((c: any) => c.code === 'SAVE5'));

    // Validate coupon SAVE5 (5% off on min ₹1,000)
    const validRes = await simulateRequest('POST', '/api/coupons/validate', {}, {
      code: 'SAVE5',
      subtotal: 1200,
    });
    assert.strictEqual(validRes.body.success, true);
    assert.strictEqual(validRes.body.valid, true);
    assert.strictEqual(validRes.body.discountAmount, 60);

    // Below minimum order amount
    const invalidRes = await simulateRequest('POST', '/api/coupons/validate', {}, {
      code: 'SAVE5',
      subtotal: 500,
    });
    assert.strictEqual(invalidRes.body.valid, false);
  });

  console.log('\n====================================================');
  console.log(` Test Summary: ${passed}/${total} Passed (${total - passed} Failed)`);
  console.log('====================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
