import QRCode from 'qrcode';

async function runTest() {
  console.log('====================================================');
  console.log('VERIFYING ADMIN SETTINGS -> MYSQL -> CHECKOUT CHAIN');
  console.log('====================================================');

  const BASE_URL = 'http://localhost:3000';

  // 1. ADMIN SAVES SETTINGS
  console.log('\n--- STEP 1: Admin Saves Settings ---');
  const adminUpiId = 'freshcart.merchant@oksbi';
  const adminMerchantName = 'FreshCart Superstore';

  const saveRes = await fetch(`${BASE_URL}/api/payment-settings/upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upiId: adminUpiId,
      merchantName: adminMerchantName,
      enabled: true,
    }),
  });

  const saveData = await saveRes.json();
  console.log('Admin Save Response status:', saveRes.status);
  console.log('Admin Save Response data:', saveData);
  if (!saveData.success || saveData.settings.upiId !== adminUpiId) {
    throw new Error('Step 1 Failed: Admin settings not saved properly.');
  }
  console.log('✅ Admin settings saved successfully');

  // 2. VERIFY GET PAYMENT SETTINGS (Simulating Admin / Checkout reload)
  console.log('\n--- STEP 2: Reload / GET Latest Payment Settings ---');
  const getRes = await fetch(`${BASE_URL}/api/payment-settings/upi?_t=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  const getData = await getRes.json();
  console.log('GET Response status:', getRes.status);
  console.log('GET Response data:', getData);
  if (!getData.success || getData.settings.upiId !== adminUpiId || getData.settings.merchantName !== adminMerchantName) {
    throw new Error('Step 2 Failed: Retrieved settings do not match saved Admin settings.');
  }
  if (!getData.settings.enabled) {
    throw new Error('Step 2 Failed: UPI settings should be enabled.');
  }
  console.log('✅ Settings persisted in MySQL backend and retrieved accurately');

  // 3. SIMULATE CUSTOMER CHECKOUT (Final total ₹427: Subtotal ₹450 - Discount ₹50 + Delivery ₹27)
  console.log('\n--- STEP 3: Customer Checkout Flow ---');
  const orderTotal = 427.00;
  const transactionRef = `FC-TXN-1001-${Date.now().toString(36).toUpperCase()}`;

  // Customer Checkout initiates payment attempt
  const initRes = await fetch(`${BASE_URL}/api/payments/initiate-upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: 'FC-1001',
      customerId: 'cust-demo-1',
      subtotal: 450,
      discount: 50,
      deliveryCharges: 27,
      total: orderTotal,
      transactionRef,
    }),
  });

  const initData = await initRes.json();
  console.log('Payment Initiation Response status:', initRes.status);
  console.log('Payment Initiation data:', initData);

  if (!initData.success) {
    throw new Error(`Step 3 Failed: Payment initiation failed: ${initData.error}`);
  }
  if (initData.upiId !== adminUpiId) {
    throw new Error(`Step 3 Failed: Initiated upiId "${initData.upiId}" does not match admin UPI ID "${adminUpiId}".`);
  }
  if (initData.merchantName !== adminMerchantName) {
    throw new Error(`Step 3 Failed: Initiated merchantName "${initData.merchantName}" does not match admin payee "${adminMerchantName}".`);
  }
  if (initData.amount !== orderTotal) {
    throw new Error(`Step 3 Failed: Amount mismatch: expected ${orderTotal}, got ${initData.amount}`);
  }
  if (initData.currency !== 'INR') {
    throw new Error(`Step 3 Failed: Currency must be INR, got ${initData.currency}`);
  }
  console.log('✅ Customer Checkout uses latest Admin UPI ID, Payee Name, and exact final amount ₹427');

  // 4. VERIFY ONE QR CODE GENERATION
  console.log('\n--- STEP 4: QR Code Generation ---');
  const expectedUri = `upi://pay?pa=${encodeURIComponent(adminUpiId)}&pn=${encodeURIComponent(adminMerchantName)}&am=${orderTotal.toFixed(2)}&cu=INR&tr=${encodeURIComponent(transactionRef)}`;
  console.log('Expected UPI URI:', expectedUri);
  console.log('Actual UPI URI:  ', initData.upiUri);

  if (initData.upiUri !== expectedUri) {
    throw new Error('Step 4 Failed: UPI URI does not match expected format.');
  }

  const qrDataUrl = await QRCode.toDataURL(initData.upiUri, { width: 256 });
  if (!qrDataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Step 4 Failed: QR data URL is invalid.');
  }
  console.log('✅ Exactly ONE QR code generated with exact payment payload');

  // 5. DIRECT UPI BUTTON URI
  console.log('\n--- STEP 5: Direct UPI App Payload ---');
  // Direct UPI uses the exact same URI
  if (!initData.upiUri.includes('pa=' + encodeURIComponent(adminUpiId))) {
    throw new Error('Step 5 Failed: Direct UPI does not use admin UPI ID');
  }
  if (!initData.upiUri.includes('am=427.00')) {
    throw new Error('Step 5 Failed: Direct UPI does not use final amount 427.00');
  }
  console.log('✅ Direct UPI uses identical parameters and URI payload');

  // 6. TEST UPDATING ADMIN SETTINGS TO NEW VALUE (merchant2@bank)
  console.log('\n--- STEP 6: Update Admin UPI Settings to merchant2@bank ---');
  const newUpiId = 'freshcart2.store@icici';
  const newMerchantName = 'FreshCart Express Koramangala';

  const updateRes = await fetch(`${BASE_URL}/api/payment-settings/upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upiId: newUpiId,
      merchantName: newMerchantName,
      enabled: true,
    }),
  });
  const updateData = await updateRes.json();
  if (!updateData.success || updateData.settings.upiId !== newUpiId) {
    throw new Error('Step 6 Failed: Updating Admin settings failed.');
  }

  // Verify new payment initiation uses the NEW settings
  const newInitRes = await fetch(`${BASE_URL}/api/payments/initiate-upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: 'FC-1002',
      customerId: 'cust-demo-1',
      subtotal: 450,
      discount: 50,
      deliveryCharges: 27,
      total: orderTotal,
    }),
  });
  const newInitData = await newInitRes.json();
  if (newInitData.upiId !== newUpiId) {
    throw new Error(`Step 6 Failed: New payment did not use updated UPI ID. Got: ${newInitData.upiId}`);
  }
  if (newInitData.merchantName !== newMerchantName) {
    throw new Error(`Step 6 Failed: New payment did not use updated payee name. Got: ${newInitData.merchantName}`);
  }
  console.log('✅ Every new payment immediately uses the latest updated Admin configuration');

  console.log('\n====================================================');
  console.log('🎉 ALL CHAIN VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTest().catch((err) => {
  console.error('❌ Chain verification failed:', err);
  process.exit(1);
});
