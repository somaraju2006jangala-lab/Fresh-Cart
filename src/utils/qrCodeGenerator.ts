import QRCode from 'qrcode';

export interface QrOptions {
  size?: number;
  margin?: number;
  fgColor?: string;
  bgColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Generates a 2D boolean matrix of QR modules using standard QRCode library (ISO/IEC 18004).
 */
export function generateQrMatrix(
  text: string,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M'
): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel });
  const size = qr.modules.size;
  const matrix: boolean[][] = [];

  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(qr.modules.get(r, c) === 1);
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * Returns an SVG string representation of the QR code.
 */
export function generateQrSvg(text: string, options: QrOptions = {}): string {
  const ecLevel = options.errorCorrectionLevel || 'M';
  const matrix = generateQrMatrix(text, ecLevel);
  const matrixSize = matrix.length;
  const margin = options.margin ?? 3;
  const size = options.size ?? 240;
  const fgColor = options.fgColor ?? '#000000';
  const bgColor = options.bgColor ?? '#ffffff';

  const totalCells = matrixSize + margin * 2;
  let paths = '';

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
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
export function generateQrDataUrl(text: string, options?: QrOptions): string {
  const svg = generateQrSvg(text, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function generateUpiQrCodeSvg(upiUri: string, size: number = 320): string {
  return generateQrDataUrl(upiUri, { size });
}
