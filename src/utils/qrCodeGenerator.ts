import QRCode from 'qrcode';
import jsQR from 'jsqr';

/**
 * Standard UPI ID Validator
 * Ensures UPI ID follows standard user@handle format (e.g., testupi@upi, freshcart@icici).
 */
export function validateUpiId(upiId: string): { isValid: boolean; error: string } {
  const trimmed = (upiId || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'UPI ID cannot be empty.' };
  }

  // Must contain exactly one '@'
  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return {
      isValid: false,
      error: 'Invalid UPI ID format. Must contain exactly one "@" symbol (e.g. testupi@upi).',
    };
  }

  const [username, handle] = parts;
  if (!username || username.length < 2 || !handle || handle.length < 2) {
    return {
      isValid: false,
      error: 'Invalid UPI ID format. Username and bank handle must each have at least 2 characters.',
    };
  }

  const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
  if (!upiRegex.test(trimmed) || trimmed.includes(' ')) {
    return {
      isValid: false,
      error: 'Invalid UPI ID characters. Only letters, numbers, dots, hyphens, and underscores are allowed.',
    };
  }

  return { isValid: true, error: '' };
}

/**
 * Generates a unique, collision-resistant transaction reference for an order.
 * Format: FC-<TIMESTAMP_BASE36>-<RANDOM_CHARS>
 */
export function generateUniquePaymentReference(prefix: string = 'FC'): string {
  const timeStr = Date.now().toString(36).toUpperCase();
  const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${timeStr}-${randStr}`;
}

export interface UpiPayloadValidationResult {
  isValid: boolean;
  error?: string;
  decoded?: {
    pa: string;
    pn: string;
    am: string;
    cu: string;
    tr: string;
    [key: string]: string;
  };
}

/**
 * Decodes and rigorously validates a UPI payment payload string.
 * Ensures the payload begins with upi://pay? and contains pa, pn, am, cu, and tr.
 */
export function decodeUpiPayload(payload: string): UpiPayloadValidationResult {
  if (!payload || typeof payload !== 'string') {
    return { isValid: false, error: 'Payment payload must be a non-empty string.' };
  }

  const trimmed = payload.trim();
  if (!trimmed.startsWith('upi://pay?')) {
    return {
      isValid: false,
      error: 'Invalid payment payload. Must start with "upi://pay?". Plain text, website URLs, or arbitrary strings are not accepted.',
    };
  }

  const queryString = trimmed.slice('upi://pay?'.length);
  const searchParams = new URLSearchParams(queryString);

  const pa = searchParams.get('pa') || '';
  const pn = searchParams.get('pn') || '';
  const am = searchParams.get('am') || '';
  const cu = searchParams.get('cu') || '';
  const tr = searchParams.get('tr') || '';

  // 1. Verify UPI ID is present and valid
  const upiValidation = validateUpiId(pa);
  if (!upiValidation.isValid) {
    return { isValid: false, error: upiValidation.error || 'Invalid or missing UPI ID (pa).' };
  }

  // 2. Verify merchant name is present
  if (!pn || pn.trim().length === 0) {
    return { isValid: false, error: 'Merchant name (pn) is required in the UPI payment payload.' };
  }

  // 3. Verify final amount is greater than 0
  const numAmount = parseFloat(am);
  if (isNaN(numAmount) || numAmount <= 0) {
    return { isValid: false, error: 'Final payable amount (am) must be greater than 0.' };
  }

  // 4. Verify currency is INR
  if (cu.toUpperCase() !== 'INR') {
    return { isValid: false, error: 'Currency (cu) must be INR for Indian UPI payments.' };
  }

  // 5. Verify unique order/payment reference exists
  if (!tr || tr.trim().length === 0) {
    return { isValid: false, error: 'Unique order/payment reference (tr) is required.' };
  }

  const allParams: Record<string, string> = {};
  searchParams.forEach((val, key) => {
    allParams[key] = val;
  });

  return {
    isValid: true,
    decoded: {
      pa,
      pn,
      am,
      cu,
      tr,
      ...allParams,
    },
  };
}

/**
 * Validates a UPI payment payload before QR generation or display.
 */
export function validateUpiPayload(payload: string): { isValid: boolean; error?: string } {
  const result = decodeUpiPayload(payload);
  return { isValid: result.isValid, error: result.error };
}

/**
 * Builds the standard UPI payment URI for a dynamic customer cart transaction.
 * Payload format:
 * upi://pay?pa=<UPI_ID>&pn=<MERCHANT_NAME>&am=<FINAL_AMOUNT>&cu=INR&tr=<UNIQUE_ORDER_REFERENCE>
 *
 * All parameter values are strictly URL-encoded.
 * Amount is formatted to exactly 2 decimal places (e.g. 239.00).
 */
export function buildCustomerPaymentUpiUri(
  upiId: string,
  payeeName: string,
  amount: number,
  tr?: string
): string {
  const cleanUpi = (upiId || '').trim();
  const cleanPayee = (payeeName || '').trim() || 'FreshCart Grocery Store';
  const cleanAmount = (Math.max(0, amount) || 0).toFixed(2);
  const cleanTr = (tr || '').trim() || generateUniquePaymentReference();

  return `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanPayee)}&am=${encodeURIComponent(cleanAmount)}&cu=INR&tr=${encodeURIComponent(cleanTr)}`;
}

/**
 * Builds the merchant configuration UPI URI (without fixed amount).
 * Format: upi://pay?pa=<UPI_ID>&pn=<MERCHANT_NAME>&cu=INR
 */
export function buildMerchantUpiUri(upiId: string, payeeName: string): string {
  const cleanUpi = (upiId || '').trim();
  const cleanPayee = (payeeName || '').trim() || 'FreshCart Grocery Store';
  return `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanPayee)}&cu=INR`;
}

/**
 * Synchronously launches the given UPI deep-link URI within an active user gesture.
 * Directly launches compatible installed UPI payment applications (Google Pay, PhonePe, Paytm, BHIM).
 */
export function openUPIPayment(upiUri: string): boolean {
  if (!upiUri || typeof window === 'undefined') return false;
  try {
    // 1. Dispatch via temporary top-level anchor click for clean Android Intent dispatch
    const link = document.createElement('a');
    link.href = upiUri;
    link.setAttribute('target', '_top');
    link.rel = 'noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      } catch {}
    }, 200);

    // 2. Direct location assignment fallback
    window.location.href = upiUri;
    return true;
  } catch (err) {
    try {
      window.location.href = upiUri;
      return true;
    } catch (fallbackErr) {
      console.error('Failed to launch UPI deep link URI:', fallbackErr);
      return false;
    }
  }
}

/**
 * Generates an ISO/IEC 18004 standards-compliant boolean matrix for the given text.
 * Uses QRCode Model 2 with Error Correction Level M and optimal mask evaluation.
 */
export function generateQrMatrix(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const matrix: boolean[][] = [];

  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(Boolean(qr.modules.get(r, c)));
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * Decodes the generated QR code by rendering its matrix into an RGBA pixel buffer
 * and scanning it through jsQR.
 * This guarantees that standard mobile scanners (GPay, PhonePe, Paytm, BHIM)
 * will recognize and decode the exact payment payload.
 */
export function verifyQrPayloadDecodable(payload: string): {
  decodable: boolean;
  decodedText?: string;
  error?: string;
} {
  try {
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const scale = 4;
    const margin = 4;
    const totalSize = (size + margin * 2) * scale;
    const rgba = new Uint8ClampedArray(totalSize * totalSize * 4);
    rgba.fill(255); // White background

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (qr.modules.get(r, c)) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const y = (r + margin) * scale + sy;
              const x = (c + margin) * scale + sx;
              const idx = (y * totalSize + x) * 4;
              rgba[idx] = 0;
              rgba[idx + 1] = 0;
              rgba[idx + 2] = 0;
              rgba[idx + 3] = 255;
            }
          }
        }
      }
    }

    const result = jsQR(rgba, totalSize, totalSize);
    if (result && result.data === payload) {
      return { decodable: true, decodedText: result.data };
    }

    return {
      decodable: false,
      error: result
        ? `Decoded payload mismatch: expected "${payload}", got "${result.data}"`
        : 'Barcode scanner failed to decode generated QR matrix.',
    };
  } catch (err: any) {
    return {
      decodable: false,
      error: err?.message || 'Error occurred during QR barcode verification.',
    };
  }
}

/**
 * Returns an ISO/IEC 18004 compliant SVG string representation of the QR code.
 */
export function generateQrSvg(
  text: string,
  options: { size?: number; margin?: number; fgColor?: string; bgColor?: string } = {}
): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const matrixSize = qr.modules.size;
  const margin = options.margin ?? 3;
  const size = options.size ?? 240;
  const fgColor = options.fgColor ?? '#000000';
  const bgColor = options.bgColor ?? '#ffffff';

  const totalCells = matrixSize + margin * 2;
  let paths = '';

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (qr.modules.get(r, c)) {
        const x = c + margin;
        const y = r + margin;
        paths += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalCells} ${totalCells}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${totalCells}" height="${totalCells}" fill="${bgColor}"/>
    <path d="${paths.trim()}" fill="${fgColor}"/>
  </svg>`;
}

/**
 * Returns a data URL (data:image/svg+xml;utf8,...) for direct use in <img src="..." />.
 */
export function generateQrDataUrl(
  text: string,
  options?: { size?: number; margin?: number; fgColor?: string; bgColor?: string }
): string {
  const svg = generateQrSvg(text, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function generateUpiQrCodeSvg(upiUri: string, size: number = 320): string {
  return generateQrDataUrl(upiUri, { size });
}
