import { apiApp } from '../server/apiRouter.ts';
import http from 'http';

function doRequest(
  server: http.Server,
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 200, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 200, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runHttpTests() {
  console.log('Testing HTTP API Router Endpoints...');
  const server = http.createServer((req, res) => {
    (apiApp as any)(req, res);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  console.log(`Ephemeral test server running on port ${port}`);

  try {
    // 1. GET /api/payment-settings/upi
    const r1 = await doRequest(server, 'GET', '/api/payment-settings/upi');
    console.log('1. GET /api/payment-settings/upi:', r1.status, r1.data.success);
    if (r1.status !== 200) throw new Error('GET payment settings failed');

    // 2. POST /api/payment-settings/upi (valid)
    const r2 = await doRequest(server, 'POST', '/api/payment-settings/upi', {
      upiId: 'merchant@oksbi',
      merchantName: 'FreshCart Grocery',
    });
    console.log('2. POST /api/payment-settings/upi (valid):', r2.status, r2.data.settings?.upiId);
    if (r2.status !== 200 || r2.data.settings?.upiId !== 'merchant@oksbi') {
      throw new Error('Save settings failed');
    }

    // 3. POST /api/payment-settings/upi (invalid handle)
    const r3 = await doRequest(server, 'POST', '/api/payment-settings/upi', {
      upiId: 'invalid-no-at-sign',
      merchantName: 'FreshCart',
    });
    console.log('3. POST /api/payment-settings/upi (invalid):', r3.status, r3.data.error);
    if (r3.status !== 400) throw new Error('Expected 400 for invalid handle');

    // 4. POST /api/payments/initiate-upi (exact amount ₹427)
    const r4 = await doRequest(server, 'POST', '/api/payments/initiate-upi', {
      orderId: 'FC-1001',
      customerId: 'cust_abc',
      subtotal: 450,
      discount: 50,
      deliveryCharges: 27,
      total: 427,
    });
    console.log('4. POST /api/payments/initiate-upi:', r4.status, r4.data.amount, r4.data.transactionRef);
    if (r4.status !== 200 || r4.data.amount !== 427) throw new Error('Initiate payment failed');
    const txnRef = r4.data.transactionRef;

    // 5. GET /api/payments/status/:ref
    const r5 = await doRequest(server, 'GET', `/api/payments/status/${encodeURIComponent(txnRef)}`);
    console.log('5. GET /api/payments/status/:ref:', r5.status, r5.data.paymentStatus);
    if (r5.status !== 200 || r5.data.paymentStatus !== 'PENDING_VERIFICATION') {
      throw new Error('Initial status should be PENDING_VERIFICATION');
    }

    // 6. POST /api/payments/verify (confirm payment)
    const r6 = await doRequest(server, 'POST', '/api/payments/verify', {
      orderId: 'FC-1001',
      transactionRef: txnRef,
      amount: 427,
      action: 'confirm_payment',
    });
    console.log('6. POST /api/payments/verify (confirm):', r6.status, r6.data.paymentStatus);
    if (r6.status !== 200 || r6.data.paymentStatus !== 'PAID') {
      throw new Error('Verification to PAID failed');
    }

    // 7. GET /api/payments/recent
    const r7 = await doRequest(server, 'GET', '/api/payments/recent');
    console.log('7. GET /api/payments/recent:', r7.status, 'Count:', r7.data.payments?.length);
    if (r7.status !== 200 || !Array.isArray(r7.data.payments)) {
      throw new Error('List recent payments failed');
    }

    console.log('\n🎉 ALL HTTP ENDPOINTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
  }
}

runHttpTests().catch((err) => {
  console.error('HTTP test failure:', err);
  process.exit(1);
});
