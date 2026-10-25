/**
 * Schlanker Baseline-JPEG-Encoder für Graustufenbilder (1 Komponente, Standard-Huffman-Tabellen).
 * Arbeitet zeilenweise (Streifen), braucht also nie ein ganzes Bild im Speicher und kein großes Canvas.
 * Hintergrund: iOS-Safari begrenzt Canvas auf ca. 16,7 Megapixel.
 */

const BASE_Q = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
export const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
export const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
export const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
export const AC_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1,
  0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56,
  0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85,
  0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa,
  0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6,
  0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

export function quantTable(quality: number): number[] {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  return BASE_Q.map((b) => Math.min(255, Math.max(1, Math.floor((b * scale + 50) / 100))));
}

function huffCodes(bits: number[], vals: number[]) {
  const code = new Uint16Array(256), size = new Uint8Array(256);
  let c = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++) { code[vals[k]] = c; size[vals[k]] = len; k++; c++; }
    c <<= 1;
  }
  return { code, size };
}

class ByteSink {
  buf = new Uint8Array(1 << 20);
  len = 0;
  push(b: number): void {
    if (this.len === this.buf.length) { const n = new Uint8Array(this.buf.length * 2); n.set(this.buf); this.buf = n; }
    this.buf[this.len++] = b;
  }
  bytes(a: ArrayLike<number>): void { for (let i = 0; i < a.length; i++) this.push(a[i]); }
  result(): Uint8Array { return this.buf.subarray(0, this.len); }
}

const COS = new Float64Array(64); // COS[u*8+n]
for (let u = 0; u < 8; u++) for (let n = 0; n < 8; n++) COS[u * 8 + n] = ((u === 0 ? Math.SQRT1_2 : 1) / 2) * Math.cos(((2 * n + 1) * u * Math.PI) / 16);

export class GrayJpegEncoder {
  private out = new ByteSink();
  private pw: number;
  private strip: Uint8Array;
  private filled = 0;
  private rowsAdded = 0;
  private prevDc = 0;
  private acc = 0;
  private nbits = 0;
  private q: number[];
  private dc = huffCodes(DC_BITS, DC_VALS);
  private ac = huffCodes(AC_BITS, AC_VALS);
  private tmp = new Float64Array(64);
  private blk = new Float64Array(64);
  private zz = new Int32Array(64);

  constructor(private width: number, private height: number, quality = 92) {
    if (width < 1 || height < 1 || width > 65535 || height > 65535) throw new Error('Ungültige Bildgröße');
    this.pw = Math.ceil(width / 8) * 8;
    this.strip = new Uint8Array(this.pw * 8);
    this.q = quantTable(quality);
    this.writeHeader();
  }

  private writeHeader(): void {
    const o = this.out;
    const u16 = (v: number) => { o.push(v >> 8); o.push(v & 255); };
    o.bytes([0xff, 0xd8]);
    o.bytes([0xff, 0xe0]); u16(16); o.bytes([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0]); u16(1); u16(1); o.bytes([0, 0]);
    o.bytes([0xff, 0xdb]); u16(67); o.push(0); for (let i = 0; i < 64; i++) o.push(this.q[ZIGZAG[i]]);
    o.bytes([0xff, 0xc0]); u16(11); o.push(8); u16(this.height); u16(this.width); o.bytes([1, 1, 0x11, 0]);
    o.bytes([0xff, 0xc4]); u16(2 + 1 + 16 + DC_VALS.length); o.push(0x00); o.bytes(DC_BITS); o.bytes(DC_VALS);
    o.bytes([0xff, 0xc4]); u16(2 + 1 + 16 + AC_VALS.length); o.push(0x10); o.bytes(AC_BITS); o.bytes(AC_VALS);
    o.bytes([0xff, 0xda]); u16(8); o.bytes([1, 1, 0x00, 0, 63, 0]);
  }

  private put(code: number, len: number): void {
    this.acc = (this.acc << len) | code;
    this.nbits += len;
    while (this.nbits >= 8) {
      const b = (this.acc >> (this.nbits - 8)) & 0xff;
      this.out.push(b);
      if (b === 0xff) this.out.push(0);
      this.nbits -= 8;
    }
    this.acc &= (1 << this.nbits) - 1;
  }

  private putAmp(v: number, size: number): void {
    if (size > 0) this.put(v < 0 ? (v - 1) & ((1 << size) - 1) : v, size);
  }

  private encodeBlock(bx: number): void {
    const { blk, tmp, zz, pw, strip, q } = this;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) blk[y * 8 + x] = strip[y * pw + bx * 8 + x] - 128;
    for (let y = 0; y < 8; y++)
      for (let u = 0; u < 8; u++) {
        let s = 0;
        for (let n = 0; n < 8; n++) s += COS[u * 8 + n] * blk[y * 8 + n];
        tmp[y * 8 + u] = s;
      }
    for (let u = 0; u < 8; u++)
      for (let v = 0; v < 8; v++) {
        let s = 0;
        for (let n = 0; n < 8; n++) s += COS[v * 8 + n] * tmp[n * 8 + u];
        const idx = v * 8 + u;
        zz[idx] = Math.round(s / q[idx]);
      }
    const diff = zz[0] - this.prevDc;
    this.prevDc = zz[0];
    const size = (a: number) => (a === 0 ? 0 : 32 - Math.clz32(a));
    const ds = size(Math.abs(diff));
    this.put(this.dc.code[ds], this.dc.size[ds]);
    this.putAmp(diff, ds);
    let run = 0;
    for (let i = 1; i < 64; i++) {
      const v = zz[ZIGZAG[i]];
      if (v === 0) { run++; continue; }
      while (run > 15) { this.put(this.ac.code[0xf0], this.ac.size[0xf0]); run -= 16; }
      const s = size(Math.abs(v));
      const sym = (run << 4) | s;
      this.put(this.ac.code[sym], this.ac.size[sym]);
      this.putAmp(v, s);
      run = 0;
    }
    if (run > 0) this.put(this.ac.code[0], this.ac.size[0]);
  }

  private flushStrip(): void {
    for (let bx = 0; bx < this.pw / 8; bx++) this.encodeBlock(bx);
    this.filled = 0;
  }

  /** Fügt eine Bildzeile (Länge = Breite) hinzu. */
  addRow(row: Uint8Array): void {
    if (this.rowsAdded >= this.height) throw new Error('Zu viele Zeilen');
    const o = this.filled * this.pw;
    this.strip.set(row.subarray(0, this.width), o);
    for (let x = this.width; x < this.pw; x++) this.strip[o + x] = row[this.width - 1];
    this.filled++;
    this.rowsAdded++;
    if (this.filled === 8) this.flushStrip();
  }

  finish(): Uint8Array {
    if (this.rowsAdded !== this.height) throw new Error('Zu wenige Zeilen');
    if (this.filled > 0) {
      const last = (this.filled - 1) * this.pw;
      while (this.filled < 8) { this.strip.copyWithin(this.filled * this.pw, last, last + this.pw); this.filled++; }
      this.flushStrip();
    }
    if (this.nbits > 0) this.put((1 << (8 - this.nbits)) - 1, 8 - this.nbits);
    this.out.bytes([0xff, 0xd9]);
    return this.out.result();
  }
}
