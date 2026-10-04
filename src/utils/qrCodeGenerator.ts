/**
 * Self-contained pure TypeScript QR Code SVG Generator (Model 2, Byte Mode)
 * Generates standards-compliant QR Code SVGs without external dependencies.
 */

// Galois Field (256) tables for Reed-Solomon Error Correction
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d; // polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
  GF256_LOG[0] = 0;
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMultiply(poly[j], GF256_EXP[i]);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsCalculateEC(msg: Uint8Array, numEcBytes: number): Uint8Array {
  const gen = rsGeneratorPoly(numEcBytes);
  const remainder = new Uint8Array(numEcBytes);
  for (let i = 0; i < msg.length; i++) {
    const factor = msg[i] ^ remainder[0];
    for (let j = 0; j < numEcBytes - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gfMultiply(gen[j + 1], factor);
    }
    remainder[numEcBytes - 1] = gfMultiply(gen[numEcBytes], factor);
  }
  return remainder;
}

// Version specifications for versions 1 to 10 with EC Level M
interface VersionSpec {
  version: number;
  totalCodewords: number;
  ecCodewords: number;
  blocks: { numBlocks: number; dataCodewords: number }[];
  alignmentPatterns: number[];
}

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, totalCodewords: 26, ecCodewords: 10, blocks: [{ numBlocks: 1, dataCodewords: 16 }], alignmentPatterns: [] },
  { version: 2, totalCodewords: 44, ecCodewords: 16, blocks: [{ numBlocks: 1, dataCodewords: 28 }], alignmentPatterns: [6, 18] },
  { version: 3, totalCodewords: 70, ecCodewords: 26, blocks: [{ numBlocks: 1, dataCodewords: 44 }], alignmentPatterns: [6, 22] },
  { version: 4, totalCodewords: 100, ecCodewords: 36, blocks: [{ numBlocks: 2, dataCodewords: 32 }], alignmentPatterns: [6, 26] },
  { version: 5, totalCodewords: 134, ecCodewords: 48, blocks: [{ numBlocks: 2, dataCodewords: 43 }], alignmentPatterns: [6, 30] },
  { version: 6, totalCodewords: 172, ecCodewords: 64, blocks: [{ numBlocks: 4, dataCodewords: 27 }], alignmentPatterns: [6, 34] },
  { version: 7, totalCodewords: 196, ecCodewords: 72, blocks: [{ numBlocks: 4, dataCodewords: 31 }], alignmentPatterns: [6, 22, 38] },
  { version: 8, totalCodewords: 242, ecCodewords: 88, blocks: [{ numBlocks: 2, dataCodewords: 38 }, { numBlocks: 2, dataCodewords: 39 }], alignmentPatterns: [6, 24, 42] },
  { version: 9, totalCodewords: 292, ecCodewords: 110, blocks: [{ numBlocks: 3, dataCodewords: 36 }, { numBlocks: 2, dataCodewords: 37 }], alignmentPatterns: [6, 26, 46] },
  { version: 10, totalCodewords: 346, ecCodewords: 130, blocks: [{ numBlocks: 4, dataCodewords: 43 }, { numBlocks: 1, dataCodewords: 44 }], alignmentPatterns: [6, 28, 50] },
];

class BitBuffer {
  private buffer: number[] = [];
  private length: number = 0;

  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }

  getBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  getLengthInBits(): number {
    return this.length;
  }
}

export function generateQrMatrix(text: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const dataLen = utf8Bytes.length;

  // Determine minimal version needed for EC Level M (8-bit Byte mode)
  let selectedSpec: VersionSpec | null = null;
  for (const spec of VERSION_SPECS) {
    const totalDataCodewords = spec.totalCodewords - spec.ecCodewords;
    const countBits = spec.version < 10 ? 8 : 16;
    const requiredBits = 4 + countBits + dataLen * 8;
    if (requiredBits <= totalDataCodewords * 8) {
      selectedSpec = spec;
      break;
    }
  }

  if (!selectedSpec) {
    selectedSpec = VERSION_SPECS[VERSION_SPECS.length - 1];
  }

  const version = selectedSpec.version;
  const size = version * 4 + 17;
  const totalDataCodewords = selectedSpec.totalCodewords - selectedSpec.ecCodewords;

  // 1. Encode Data in Byte Mode
  const bb = new BitBuffer();
  bb.put(0b0100, 4); // Byte mode indicator
  bb.put(dataLen, version < 10 ? 8 : 16);
  for (let i = 0; i < dataLen; i++) {
    bb.put(utf8Bytes[i], 8);
  }

  // Terminator
  const totalBits = totalDataCodewords * 8;
  const termLen = Math.min(4, totalBits - bb.getLengthInBits());
  if (termLen > 0) bb.put(0, termLen);

  // Align to byte
  while (bb.getLengthInBits() % 8 !== 0) {
    bb.putBit(false);
  }

  // Pad bytes 0xEC, 0x11
  let padToggle = false;
  while (bb.getLengthInBits() < totalBits) {
    bb.put(padToggle ? 0x11 : 0xec, 8);
    padToggle = !padToggle;
  }

  const dataBytes = bb.getBuffer();

  // 2. Interleave blocks and compute EC
  let dataOffset = 0;
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  for (const blk of selectedSpec.blocks) {
    const ecPerBlock = Math.floor(selectedSpec.ecCodewords / selectedSpec.blocks.reduce((s, b) => s + b.numBlocks, 0));
    for (let i = 0; i < blk.numBlocks; i++) {
      const blockData = dataBytes.slice(dataOffset, dataOffset + blk.dataCodewords);
      dataOffset += blk.dataCodewords;
      dataBlocks.push(blockData);
      ecBlocks.push(rsCalculateEC(blockData, ecPerBlock));
    }
  }

  // Interleave data codewords
  const finalCodewords: number[] = [];
  const maxDataCodewords = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataCodewords; i++) {
    for (const b of dataBlocks) {
      if (i < b.length) finalCodewords.push(b[i]);
    }
  }
  // Interleave EC codewords
  const maxEcCodewords = Math.max(...ecBlocks.map((b) => b.length));
  for (let i = 0; i < maxEcCodewords; i++) {
    for (const b of ecBlocks) {
      if (i < b.length) finalCodewords.push(b[i]);
    }
  }

  // 3. Setup Matrix
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  function setModule(r: number, c: number, val: boolean, isFunc = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (isFunc) isFunction[r][c] = true;
    }
  }

  // Finder Patterns
  function placeFinder(top: number, left: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          setModule(top + r, left + c, true);
        } else {
          setModule(top + r, left + c, false);
        }
      }
    }
    // Separators
    for (let i = -1; i <= 7; i++) {
      setModule(top - 1, left + i, false);
      setModule(top + 7, left + i, false);
      setModule(top + i, left - 1, false);
      setModule(top + i, left + 7, false);
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (matrix[6][i] === null) setModule(6, i, val);
    if (matrix[i][6] === null) setModule(i, 6, val);
  }

  // Alignment Patterns
  const alignCoords = selectedSpec.alignmentPatterns;
  if (alignCoords.length > 0) {
    for (const r of alignCoords) {
      for (const c of alignCoords) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isBorder || isCenter);
          }
        }
      }
    }
  }

  // Dark module
  setModule(size - 8, 8, true);

  // Format bits space reservation
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunction[8][i] = true;
      isFunction[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = true;
    isFunction[size - 1 - i][8] = true;
  }

  // Place Codewords into Data Areas
  let bitIndex = 0;
  let upwards = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (let col = c; col >= c - 1; col--) {
        if (!isFunction[r][col]) {
          let bit = false;
          if (bitIndex < finalCodewords.length * 8) {
            const byteVal = finalCodewords[Math.floor(bitIndex / 8)];
            bit = ((byteVal >>> (7 - (bitIndex % 8))) & 1) === 1;
          }
          // Mask pattern 0: (row + col) % 2 === 0
          if ((r + col) % 2 === 0) {
            bit = !bit;
          }
          matrix[r][col] = bit;
          bitIndex++;
        }
      }
    }
    upwards = !upwards;
  }

  // Format info for EC Level M (00) and Mask 0 (000) -> 00000 -> 0x00
  // Mask pattern 0 + EC Level M (0b00000) with BCH (15, 5) code: 0x5412 ^ 0x0000 = 0x5412
  const formatInfo = 0x5412;
  const formatBits: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    formatBits.push(((formatInfo >>> i) & 1) === 1);
  }

  // Apply format info
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i];

  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = formatBits[i];
  for (let i = 7; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i];

  return matrix.map((row) => row.map((cell) => cell === true));
}

/**
 * Returns an SVG string representation of the QR code.
 */
export function generateQrSvg(
  text: string,
  options: { size?: number; margin?: number; fgColor?: string; bgColor?: string } = {}
): string {
  const matrix = generateQrMatrix(text);
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
