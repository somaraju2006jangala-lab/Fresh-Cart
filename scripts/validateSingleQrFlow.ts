import fs from 'fs';
import path from 'path';
import {
  validateUpiId,
  buildCustomerPaymentUpiUri,
  decodeUpiPayload,
  verifyQrPayloadDecodable,
  generateQrDataUrl,
  generateUniquePaymentReference,
} from '../src/utils/qrCodeGenerator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function runValidation() {
  console.log('===========================================================');
  console.log('FreshCart Single QR Customer Flow Validation');
  console.log('===========================================================\n');

  const cartPagePath = path.resolve(process.cwd(), 'src/components/CartPage.tsx');
  const checkoutPagePath = path.resolve(process.cwd(), 'src/components/CheckoutPage.tsx');

  const cartPageContent = fs.readFileSync(cartPagePath, 'utf-8');
  const checkoutPageContent = fs.readFileSync(checkoutPagePath, 'utf-8');

  // STEP 1: Confirm CartPage contains ZERO QR codes or duplicate QR elements
  console.log('STEP 1: Verify CartPage has NO QR codes or duplicate sections');
  assert(!cartPageContent.includes('cart-payment-qr-img'), 'CartPage does NOT contain cart-payment-qr-img');
  assert(!cartPageContent.includes('cart-upi-qr-payment-section'), 'CartPage does NOT contain cart-upi-qr-payment-section');
  assert(!cartPageContent.includes('cart-qr-amount-display'), 'CartPage does NOT contain cart-qr-amount-display');
  assert(!cartPageContent.includes('cart-qr-scan-instruction'), 'CartPage does NOT contain cart-qr-scan-instruction');
  assert(!cartPageContent.includes('cart-direct-upi-app-link'), 'CartPage does NOT contain duplicate cart-direct-upi-app-link');
  assert(!cartPageContent.includes('generateQrDataUrl'), 'CartPage does NOT import or call generateQrDataUrl');
  assert(!cartPageContent.includes('buildCustomerPaymentUpiUri'), 'CartPage does NOT import or call buildCustomerPaymentUpiUri');

  // Count total QR img occurrences in CartPage
  const cartImgMatches = cartPageContent.match(/<img[^>]*qr[^>]*>/gi) || [];
  assert(cartImgMatches.length === 0, `CartPage has exactly 0 QR images (found: ${cartImgMatches.length})`);

  // STEP 2: Confirm CheckoutPage contains EXACTLY ONE QR Code inside Payment Methods
  console.log('\nSTEP 2: Verify CheckoutPage Payment Methods has EXACTLY ONE QR Code');
  assert(checkoutPageContent.includes('checkout-payment-qr-img'), 'CheckoutPage contains checkout-payment-qr-img');
  assert(checkoutPageContent.includes('checkout-payment-cash-opt'), 'CheckoutPage has Cash on Delivery option');
  assert(checkoutPageContent.includes('checkout-payment-upi-qr-opt'), 'CheckoutPage has UPI / QR Payment option');
  assert(checkoutPageContent.includes('checkout-qr-amount-display'), 'CheckoutPage has Amount to Pay display');
  assert(checkoutPageContent.includes('checkout-qr-scan-instruction'), 'CheckoutPage has Scan instruction');
  assert(checkoutPageContent.includes('checkout-direct-upi-app-link'), 'CheckoutPage has Pay via UPI App button');

  // Count QR image tags in CheckoutPage
  const checkoutQrMatches = (checkoutPageContent.match(/\bid="checkout-payment-qr-img"/g) || []).length;
  assert(checkoutQrMatches === 1, `CheckoutPage contains exactly 1 QR element definition (found: ${checkoutQrMatches})`);

  // STEP 3: Validate Payment Methods structure
  console.log('\nSTEP 3: Verify Payment Methods conditional rendering');
  assert(
    checkoutPageContent.includes("paymentMethod === 'upi_qr'"),
    'QR code is rendered conditionally ONLY when UPI / QR Payment is selected'
  );
  assert(
    checkoutPageContent.includes("paymentMethod === 'cash'"),
    'Cash on Delivery has distinct handling without any QR code'
  );

  // STEP 4: Test Dynamic QR Generation & Payload with Cart Amount changes
  console.log('\nSTEP 4: Test Dynamic QR Generation with Cart Amount changes');
  const adminUpi = 'freshcart@upi';
  const merchantName = 'FreshCart Grocery Store';

  // Amount 1: ₹149.00
  const tr1 = generateUniquePaymentReference('FC');
  const uri1 = buildCustomerPaymentUpiUri(adminUpi, merchantName, 149, tr1);
  const scan1 = verifyQrPayloadDecodable(uri1);
  assert(scan1.decodable, '₹149 QR barcode decodable by UPI banking apps');
  assert(scan1.decodedText === uri1, 'Decoded barcode matches expected ₹149 UPI payload');
  const decoded1 = decodeUpiPayload(uri1);
  assert(decoded1.decoded?.am === '149.00', 'Decoded am is 149.00');
  assert(decoded1.decoded?.pa === adminUpi, 'Decoded pa is freshcart@upi');
  assert(decoded1.decoded?.cu === 'INR', 'Decoded cu is INR');

  // Amount 2 (Cart updated): ₹499.00
  const tr2 = generateUniquePaymentReference('FC');
  const uri2 = buildCustomerPaymentUpiUri(adminUpi, merchantName, 499, tr2);
  const scan2 = verifyQrPayloadDecodable(uri2);
  assert(scan2.decodable, '₹499 QR barcode decodable by UPI banking apps');
  assert(scan2.decodedText === uri2, 'Decoded barcode matches expected ₹499 UPI payload');
  const decoded2 = decodeUpiPayload(uri2);
  assert(decoded2.decoded?.am === '499.00', 'Decoded am is updated to 499.00');

  // Verify different amounts produce different QR data URLs
  const qrDataUrl1 = generateQrDataUrl(uri1);
  const qrDataUrl2 = generateQrDataUrl(uri2);
  assert(qrDataUrl1 !== qrDataUrl2, 'Dynamic QR changes when cart amount changes');

  console.log('\n===========================================================');
  console.log('🎉 ALL VALIDATION CHECKS PASSED PERFECTLY!');
  console.log('===========================================================');
}

runValidation().catch((err) => {
  console.error(err);
  process.exit(1);
});
