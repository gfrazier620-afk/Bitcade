/*
 * Draws the Bitcade app icons (a pixel-art B in the logo's yellow → orange → pink gradient) as PNGs in icons/.
 * Run with: node tools/make-icons.mjs   (no dependencies; writes the PNG bytes by hand)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));
const B = ['11110', '10001', '10001', '11110', '10001', '10001', '11110'];
const BG = [0x0f, 0x0c, 0x1f], STOPS = [[0xff, 0xe3, 0x6a], [0xff, 0x7a, 0x3d], [0xff, 0x3d, 0x9a]];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rowColor = r => { const t = r / (B.length - 1); return t < 0.5 ? mix(STOPS[0], STOPS[1], t * 2) : mix(STOPS[1], STOPS[2], (t - 0.5) * 2); };

/**
 * size: pixels. fill: share of the icon the letter's height takes. rounded: transparent rounded corners
 * (plain icons); otherwise the background is full-bleed (maskable and Apple icons).
 */
function draw(size, fill, rounded) {
  const px = new Uint8Array(size * size * 4), cell = Math.floor(size * fill / B.length);
  const w = cell * B[0].length, h = cell * B.length, ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2);
  const rad = rounded ? size * 0.2 : 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    // rounded-corner mask
    const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
    if (rad && cx < rad && cy < rad && Math.hypot(rad - cx, rad - cy) > rad) continue;
    let c = BG;
    const gx = Math.floor((x - ox) / cell), gy = Math.floor((y - oy) / cell);
    if (x >= ox && y >= oy && gx < B[0].length && gy < B.length && B[gy][gx] === '1') {
      // a 1px darker gap between pixels keeps the chunky arcade look
      const inX = (x - ox) % cell, inY = (y - oy) % cell, gap = Math.max(1, Math.round(cell * 0.06));
      c = inX < cell - gap && inY < cell - gap ? rowColor(gy) : mix(rowColor(gy), BG, 0.6);
    }
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return png(size, px);
}

/* ---------- minimal PNG writer ---------- */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': draw(192, 0.62, true),
  'icon-512.png': draw(512, 0.62, true),
  'icon-maskable-512.png': draw(512, 0.46, false), // letter inside the 80% safe zone that launchers may crop to
  'apple-touch-icon.png': draw(180, 0.58, false)   // iOS rounds the corners itself
};
for (const [name, data] of Object.entries(files)) { writeFileSync(OUT + name, data); console.log(`icons/${name}  ${data.length} bytes`); }
