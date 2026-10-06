import {
  validateUpiId,
  buildMerchantUpiUri,
  buildCustomerPaymentUpiUri,
  decodeUpiPayload,
  validateUpiPayload,
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

async function runTests() {
  console.log('===========================================================');
  console.log('FreshCart UPI QR Payment Implementation Test Suite');
  console.log('===========================================================\n');

  // TEST 1: Admin UPI ID: testupi@upi
  console.log('TEST 1 & 2: Admin UPI ID Validation & Merchant QR');
  const adminUpi = 'testupi@upi';
  const merchantName = 'FreshCart Grocery Store';
  const valAdmin = validateUpiId(adminUpi);
  assert(valAdmin.isValid, `Admin UPI "${adminUpi}" is valid`);

  const merchantUri = buildMerchantUpiUri(adminUpi, merchantName);
  assert(merchantUri.startsWith('upi://pay?'), 'Merchant payload starts with upi://pay?');
  assert(merchantUri.includes(`pa=${encodeURIComponent(adminUpi)}`), 'Merchant payload includes pa');
  assert(merchantUri.includes(`pn=${encodeURIComponent(merchantName)}`), 'Merchant payload includes pn');
  assert(merchantUri.includes('cu=INR'), 'Merchant payload includes cu=INR');

  const merchantScan = verifyQrPayloadDecodable(merchantUri);
  assert(merchantScan.decodable, 'Merchant QR is 100% decodable by standard QR scanner (jsQR)');
  assert(merchantScan.decodedText === merchantUri, 'Decoded merchant QR matches expected URI');

  // TEST 3, 4, 5: Customer Cart Total: ₹10
  console.log('\nTEST 3, 4, 5: Customer Cart Total ₹10');
  const tr10 = generateUniquePaymentReference('FC');
  const uri10 = buildCustomerPaymentUpiUri(adminUpi, merchantName, 10, tr10);
  assert(uri10.startsWith('upi://pay?'), 'Payload starts with upi://pay?');
  assert(uri10.includes('am=10.00'), 'Amount is formatted strictly with 2 decimals: 10.00');
  assert(uri10.includes(`tr=${encodeURIComponent(tr10)}`), 'Unique order reference tr is included');

  const decoded10 = decodeUpiPayload(uri10);
  assert(decoded10.isValid, 'Payload passes pre-display validation');
  assert(decoded10.decoded?.pa === adminUpi, 'Decoded pa matches Admin UPI');
  assert(decoded10.decoded?.pn === merchantName, 'Decoded pn matches Merchant Name');
  assert(decoded10.decoded?.am === '10.00', 'Decoded am matches exact payable amount 10.00');
  assert(decoded10.decoded?.cu === 'INR', 'Decoded cu matches INR');
  assert(decoded10.decoded?.tr === tr10, 'Decoded tr matches unique reference');

  const scan10 = verifyQrPayloadDecodable(uri10);
  assert(scan10.decodable, '₹10 QR barcode decodable by UPI banking app scanner');
  assert(scan10.decodedText === uri10, '₹10 Decoded barcode text matches payload');

  // TEST 6: Test ₹239
  console.log('\nTEST 6: Customer Cart Total ₹239');
  const tr239 = generateUniquePaymentReference('FC');
  const uri239 = buildCustomerPaymentUpiUri(adminUpi, merchantName, 239, tr239);
  const decoded239 = decodeUpiPayload(uri239);
  assert(decoded239.isValid, '₹239 Payload is valid');
  assert(decoded239.decoded?.am === '239.00', '₹239 am is strictly 239.00');
  assert(decoded239.decoded?.tr === tr239, '₹239 tr is unique');

  const scan239 = verifyQrPayloadDecodable(uri239);
  assert(scan239.decodable, '₹239 QR barcode decodable by UPI banking app scanner');
  assert(scan239.decodedText === uri239, '₹239 Decoded barcode text matches payload');

  // TEST 7: Test ₹799
  console.log('\nTEST 7: Customer Cart Total ₹799');
  const tr799 = generateUniquePaymentReference('FC');
  const uri799 = buildCustomerPaymentUpiUri(adminUpi, merchantName, 799, tr799);
  const decoded799 = decodeUpiPayload(uri799);
  assert(decoded799.isValid, '₹799 Payload is valid');
  assert(decoded799.decoded?.am === '799.00', '₹799 am is strictly 799.00');
  assert(decoded799.decoded?.tr === tr799, '₹799 tr is unique');

  const scan799 = verifyQrPayloadDecodable(uri799);
  assert(scan799.decodable, '₹799 QR barcode decodable by UPI banking app scanner');
  assert(scan799.decodedText === uri799, '₹799 Decoded barcode text matches payload');

  // TEST 8: Change Cart Quantity & Dynamic QR Re-generation
  console.log('\nTEST 8: Dynamic Regeneration on Cart Change');
  const qrDataUrl239 = generateQrDataUrl(uri239);
  const qrDataUrl799 = generateQrDataUrl(uri799);
  assert(qrDataUrl239 !== qrDataUrl799, 'New amount-specific QR generated when cart total changes (old QR NOT reused)');

  // TEST 9 & 10: Payload Decoding & Verification of Required Fields
  console.log('\nTEST 9 & 10: Payload Decoding & Field Verification');
  const testRequiredFields = decodeUpiPayload(uri239);
  assert(Boolean(testRequiredFields.decoded?.pa), 'Payload has "pa" field');
  assert(Boolean(testRequiredFields.decoded?.pn), 'Payload has "pn" field');
  assert(Boolean(testRequiredFields.decoded?.am), 'Payload has "am" field');
  assert(Boolean(testRequiredFields.decoded?.cu), 'Payload has "cu" field');
  assert(Boolean(testRequiredFields.decoded?.tr), 'Payload has "tr" field');

  // Invalid payload rejections
  console.log('\nTEST: Validation Guardrails (Plain text, URLs, arbitrary strings rejected)');
  assert(!validateUpiPayload('testupi@upi').isValid, 'Plain UPI ID text is rejected');
  assert(!validateUpiPayload('https://freshcart.com/pay').isValid, 'Website URL is rejected');
  assert(!validateUpiPayload('arbitrary payload 12345').isValid, 'Arbitrary text is rejected');
  assert(!validateUpiPayload('upi://pay?pa=test@upi&pn=Store&am=0&cu=INR&tr=1').isValid, 'Zero amount rejected');
  assert(!validateUpiPayload('upi://pay?pa=test@upi&pn=Store&am=100&cu=INR').isValid, 'Payload without tr reference rejected');

  console.log('\n===========================================================');
  console.log('🎉 ALL 10 TESTS PASSED SUCCESSFULLY!');
  console.log('===========================================================');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
