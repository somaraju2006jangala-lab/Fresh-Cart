import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  buildCustomerPaymentUpiUri,
  decodeUpiPayload,
  verifyQrPayloadDecodable,
} from '../src/utils/qrCodeGenerator';

async function validateQrInteractionFlow() {
  console.log('===========================================================');
  console.log('FreshCart QR Interaction & UPI Deep Link Validation');
  console.log('===========================================================');

  // 1. Verify CheckoutPage.tsx source code properties
  console.log('1. Checking CheckoutPage.tsx for QR interaction and deep link logic...');
  const checkoutPagePath = path.resolve(__dirname, '../src/components/CheckoutPage.tsx');
  const checkoutPageCode = fs.readFileSync(checkoutPagePath, 'utf-8');

  // Must have tap/click and long-press support
  assert.ok(
    checkoutPageCode.includes('handleQrPointerDown') &&
      checkoutPageCode.includes('handleQrPointerUpOrCancel') &&
      checkoutPageCode.includes('handleLaunchUpiDeepLink'),
    'CheckoutPage must implement tap and long-press pointer event handling'
  );

  // Must have container with role="button" or interactive container
  assert.ok(
    checkoutPageCode.includes('id="checkout-payment-qr-container"') ||
      checkoutPageCode.includes('data-testid="checkout-payment-qr-container"'),
    'CheckoutPage must have interactive QR container element'
  );

  // Must NOT have "Pay with UPI App" button inside UPI / QR Payment section
  assert.ok(
    !checkoutPageCode.includes('id="qr-pay-with-upi-app-btn"') &&
      !checkoutPageCode.includes('data-testid="qr-pay-with-upi-app-btn"'),
    'CheckoutPage must NOT have "📱 Pay with UPI App" button inside QR section'
  );

  // QR container itself must be the clickable payment action triggering handleLaunchUpiDeepLink
  assert.ok(
    checkoutPageCode.includes('onClick={() => handleLaunchUpiDeepLink(checkoutUpiUri)}') ||
      checkoutPageCode.includes('onClick={() => handleLaunchUpiDeepLink('),
    'QR container itself must trigger UPI deep link on click/tap'
  );

  // Must contain exact fallback message required:
  // "Open your UPI app and complete the payment, then upload your payment screenshot."
  const requiredFallback = 'Open your UPI app and complete the payment, then upload your payment screenshot.';
  assert.ok(
    checkoutPageCode.includes(requiredFallback),
    `CheckoutPage must include exact fallback message: "${requiredFallback}"`
  );

  // Must preserve PaymentProofUpload component inside the QR section
  assert.ok(
    checkoutPageCode.includes('<PaymentProofUpload'),
    'CheckoutPage must preserve payment-proof screenshot upload feature'
  );

  // Must preserve 📱 Pay Directly via UPI App payment option
  assert.ok(
    checkoutPageCode.includes("paymentMethod === 'upi_app'"),
    'CheckoutPage must preserve separate 📱 Pay Directly via UPI App payment method'
  );

  // Must preserve COD
  assert.ok(
    checkoutPageCode.includes("paymentMethod === 'cash'"),
    'CheckoutPage must preserve Cash on Delivery'
  );

  console.log('✓ CheckoutPage interaction elements and fallback verified.');

  // 2. Check CheckoutModal.tsx as well
  console.log('2. Checking CheckoutModal.tsx for matching QR interaction...');
  const checkoutModalPath = path.resolve(__dirname, '../src/components/CheckoutModal.tsx');
  const checkoutModalCode = fs.readFileSync(checkoutModalPath, 'utf-8');

  assert.ok(
    checkoutModalCode.includes('handleQrPointerDown') &&
      checkoutModalCode.includes('handleLaunchUpiDeepLink'),
    'CheckoutModal must implement tap and long-press pointer event handling'
  );
  assert.ok(
    !checkoutModalCode.includes('modal-qr-pay-with-upi-app-btn'),
    'CheckoutModal must NOT have "Pay with UPI App" button'
  );
  assert.ok(
    checkoutModalCode.includes(requiredFallback),
    'CheckoutModal must include exact fallback message'
  );
  console.log('✓ CheckoutModal interaction elements and fallback verified.');

  // 3. Test UPI URI Payload Generation with Order Data
  console.log('3. Validating dynamic UPI deep link URI payload format...');
  const testUpiId = 'freshcart@upi';
  const testPayeeName = 'FreshCart Grocery Store';
  const testAmount = 529.5;
  const testTxnRef = 'FC-ORDER-98765';

  const upiUri = buildCustomerPaymentUpiUri(testUpiId, testPayeeName, testAmount, testTxnRef);
  console.log('Generated UPI URI:', upiUri);

  // Must match format upi://pay?pa=...&pn=...&am=...&cu=INR&tr=...
  assert.ok(upiUri.startsWith('upi://pay?'), 'URI must start with upi://pay?');
  assert.ok(upiUri.includes('pa=freshcart%40upi') || upiUri.includes('pa=freshcart@upi'), 'Must include pa');
  assert.ok(upiUri.includes('pn='), 'Must include pn');
  assert.ok(upiUri.includes('am=529.50'), 'Amount must be formatted to 2 decimals');
  assert.ok(upiUri.includes('cu=INR'), 'Currency must be INR');
  assert.ok(upiUri.includes('tr=FC-ORDER-98765'), 'Txn ref must match unique order ref');

  const decoded = decodeUpiPayload(upiUri);
  assert.strictEqual(decoded.isValid, true, 'UPI payload must be valid');
  assert.strictEqual(decoded.decoded?.pa, testUpiId);
  assert.strictEqual(decoded.decoded?.am, '529.50');
  assert.strictEqual(decoded.decoded?.cu, 'INR');
  assert.strictEqual(decoded.decoded?.tr, testTxnRef);

  const qrScan = verifyQrPayloadDecodable(upiUri);
  assert.strictEqual(qrScan.decodable, true, 'QR payload must be decodable');
  console.log('✓ UPI deep link payload validated and verified decodable.');

  // 4. Verify Single QR Rule (Exactly ONE QR element in the customer payment methods)
  console.log('4. Verifying exactly ONE QR element in Customer Checkout...');
  const qrImgCount = (checkoutPageCode.match(/\bid="checkout-payment-qr-img"/g) || []).length;
  assert.strictEqual(qrImgCount, 1, `Must have exactly 1 QR image definition (found ${qrImgCount})`);
  console.log('✓ Exactly ONE QR code exists in CheckoutPage.');

  console.log('===========================================================');
  console.log('🎉 ALL QR INTERACTION CHECKS PASSED SUCCESSFULLY!');
  console.log('===========================================================');
}

validateQrInteractionFlow().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
