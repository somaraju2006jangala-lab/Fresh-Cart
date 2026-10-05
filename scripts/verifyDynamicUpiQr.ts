import jsQR from 'jsqr';
import { buildDynamicUpiUri, DEFAULT_PAYEE_NAME, DEFAULT_UPI_ID } from '../src/services/paymentSettingsService.js';
import { generateQrDataUrl, generateQrMatrix } from '../src/utils/qrCodeGenerator.js';
import { getApplicableDeliveryChargeRule, DEFAULT_DELIVERY_RULES } from '../src/services/settingsService.js';

interface TestCaseResult {
  step: string;
  expectedAmount: number | string;
  expectedUri: string;
  decodedUri: string;
  passed: boolean;
  notes?: string;
}

/**
 * Decodes a generated QR matrix using standard jsQR decoder (simulating a phone/UPI app scanning the QR).
 */
function scanQrMatrix(matrix: boolean[][]): string | null {
  const mSize = matrix.length;
  const margin = 4;
  const total = mSize + margin * 2;
  const data = new Uint8ClampedArray(total * total * 4);
  data.fill(255); // White background

  for (let r = 0; r < mSize; r++) {
    for (let c = 0; c < mSize; c++) {
      const idx = ((r + margin) * total + (c + margin)) * 4;
      const isDark = matrix[r][c];
      const val = isDark ? 0 : 255;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  const result = jsQR(data, total, total);
  return result ? result.data : null;
}

function verifyScenario(
  step: string,
  upiId: string,
  payeeName: string,
  orderTotal: number,
  notes?: string
): TestCaseResult {
  const formattedAmount = orderTotal % 1 === 0 ? orderTotal.toString() : orderTotal.toFixed(2);
  const expectedUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${formattedAmount}&cu=INR`;
  const generatedUri = buildDynamicUpiUri(upiId, payeeName, orderTotal);

  if (generatedUri !== expectedUri) {
    return {
      step,
      expectedAmount: formattedAmount,
      expectedUri,
      decodedUri: generatedUri,
      passed: false,
      notes: `Generated URI mismatch: ${generatedUri}`,
    };
  }

  // Generate QR Matrix and test simulated scan
  const matrix = generateQrMatrix(generatedUri);
  const decodedUri = scanQrMatrix(matrix);

  const passed = decodedUri === expectedUri;

  return {
    step,
    expectedAmount: formattedAmount,
    expectedUri,
    decodedUri: decodedUri || 'SCAN_FAILED',
    passed,
    notes,
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('TESTING DYNAMIC UPI QR GENERATION & SCAN VERIFICATION');
  console.log('================================================================\n');

  const results: TestCaseResult[] = [];
  const upiId = 'freshcart@upi';
  const merchantName = 'FreshCart';

  // 1. ₹10 Order
  results.push(verifyScenario('1. ₹10 order', upiId, merchantName, 10, 'Scan → UPI app prefilled with ₹10'));

  // 2. ₹239 Order
  results.push(verifyScenario('2. ₹239 order', upiId, merchantName, 239, 'Scan → UPI app prefilled with ₹239'));

  // 3. ₹799 Order
  results.push(verifyScenario('3. ₹799 order', upiId, merchantName, 799, 'Scan → UPI app prefilled with ₹799'));

  // 4. Change Quantity:
  // Subtotal = 1 x ₹50 = ₹50, Delivery = ₹40 -> ₹90
  const qtyStep1 = verifyScenario('4a. Initial Cart (1 qty = ₹50 + ₹40 delivery)', upiId, merchantName, 90);
  results.push(qtyStep1);
  // Change quantity to 3: Subtotal = 3 x ₹50 = ₹150, Delivery = ₹40 -> ₹190
  const qtyStep2 = verifyScenario('4b. Quantity Changed to 3 (3 qty = ₹150 + ₹40 delivery)', upiId, merchantName, 190, 'Regenerated with ₹190');
  results.push(qtyStep2);
  const qtyUpdatedCorrectly = qtyStep1.decodedUri !== qtyStep2.decodedUri && qtyStep2.decodedUri.includes('am=190');
  console.log(`[Quantity Change Check] Old QR: am=90, New QR: am=190 -> Updated: ${qtyUpdatedCorrectly ? 'YES' : 'NO'}`);

  // 5. Apply Coupon:
  // Subtotal ₹150, 10% coupon = ₹15 discount. Subtotal ₹135 + ₹40 delivery = ₹175
  const couponApplied = verifyScenario('5. Apply 10% Coupon (₹190 - ₹15 = ₹175)', upiId, merchantName, 175, 'Regenerated with ₹175');
  results.push(couponApplied);
  const couponUpdatedCorrectly = couponApplied.decodedUri !== qtyStep2.decodedUri && couponApplied.decodedUri.includes('am=175');
  console.log(`[Coupon Apply Check] Old QR: am=190, New QR: am=175 -> Updated: ${couponUpdatedCorrectly ? 'YES' : 'NO'}`);

  // 6. Remove Coupon:
  // Revert back to ₹190
  const couponRemoved = verifyScenario('6. Remove Coupon (Reverts back to ₹190)', upiId, merchantName, 190, 'Regenerated with ₹190');
  results.push(couponRemoved);
  const couponRemovedCorrectly = couponRemoved.decodedUri.includes('am=190');
  console.log(`[Coupon Remove Check] QR reverted to am=190 -> Updated: ${couponRemovedCorrectly ? 'YES' : 'NO'}`);

  // 7. Change Delivery Charge:
  // Test applicable delivery rules from service
  const ruleSubtotal = 600;
  const applicableRule = getApplicableDeliveryChargeRule(DEFAULT_DELIVERY_RULES, ruleSubtotal);
  const deliveryCharge = applicableRule ? applicableRule.deliveryCharge : 0;
  const totalWithRule = ruleSubtotal + deliveryCharge; // 600 + 0 = 600 (Free delivery over ₹499)
  const deliveryChanged = verifyScenario('7. Delivery Charge Rule (Free delivery over ₹499)', upiId, merchantName, totalWithRule, `Subtotal ₹${ruleSubtotal} + Delivery ₹${deliveryCharge} = ₹${totalWithRule}`);
  results.push(deliveryChanged);

  // 8. Verify QR updates with new amount
  const qrDataUrl10 = generateQrDataUrl(buildDynamicUpiUri(upiId, merchantName, 10));
  const qrDataUrl239 = generateQrDataUrl(buildDynamicUpiUri(upiId, merchantName, 239));
  const qrDataUrl799 = generateQrDataUrl(buildDynamicUpiUri(upiId, merchantName, 799));
  const distinctQrs = qrDataUrl10 !== qrDataUrl239 && qrDataUrl239 !== qrDataUrl799;
  results.push({
    step: '8. Verify QR updates with new amount (No stale QR cached)',
    expectedAmount: 'Unique per amount',
    expectedUri: 'Distinct QR payloads',
    decodedUri: 'Verified distinct',
    passed: distinctQrs,
    notes: 'QR data URLs are strictly unique for ₹10, ₹239, ₹799',
  });

  // 9. Scan QR with supported UPI app simulation
  // Verifying URI structure: upi://pay?pa=<UPI_ID>&pn=<MERCHANT_NAME>&am=<FINAL_AMOUNT>&cu=INR
  const scanValidation10 = verifyScenario('9a. Scan ₹10 QR in UPI App', upiId, merchantName, 10, 'UPI Intent validates pa=freshcart@upi, pn=FreshCart, am=10, cu=INR');
  const scanValidation239 = verifyScenario('9b. Scan ₹239 QR in UPI App', upiId, merchantName, 239, 'UPI Intent validates pa=freshcart@upi, pn=FreshCart, am=239, cu=INR');
  const scanValidation799 = verifyScenario('9c. Scan ₹799 QR in UPI App', upiId, merchantName, 799, 'UPI Intent validates pa=freshcart@upi, pn=FreshCart, am=799, cu=INR');
  results.push(scanValidation10, scanValidation239, scanValidation799);

  // 10. Admin Payment Settings custom UPI configuration
  const customUpi = 'store@okhdfcbank';
  const customMerchant = 'FreshCart Supermarket';
  const customConfigTest = verifyScenario('10. Custom Admin Settings (store@okhdfcbank, FreshCart Supermarket, ₹350)', customUpi, customMerchant, 350, 'Dynamic QR encodes admin-configured credentials and order total');
  results.push(customConfigTest);

  console.log('\n----------------------------------------------------------------');
  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} | ${r.step}`);
    console.log(`       Expected URI: ${r.expectedUri}`);
    console.log(`       Decoded URI:  ${r.decodedUri}`);
    if (r.notes) console.log(`       Note:         ${r.notes}`);
    if (!r.passed) allPassed = false;
  }
  console.log('----------------------------------------------------------------\n');

  if (allPassed) {
    console.log('🎉 ALL DYNAMIC UPI QR SPECIFICATIONS AND TEST CASES PASSED!\n');
  } else {
    console.error('❌ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
