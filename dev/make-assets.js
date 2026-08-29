/* Generates the test covers and the extension icons as real PNGs.
 *
 *   node dev/make-assets.js
 *
 * The covers exist to stress the palette extractor, so each one is a different
 * kind of hard: vivid multi-hue, near-monochrome, one dominant hue, and a light
 * cover that should flip the ink to dark. No dependencies -- zlib plus a
 * hand-rolled PNG chunk writer.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ------------------------------------------------------------------ png -- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {(x:number,y:number)=>[number,number,number,number]} shade */
function png(size, shade) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (stride + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y);
      const i = row + 1 + x * 4;
      raw[i] = r & 255; raw[i + 1] = g & 255; raw[i + 2] = b & 255; raw[i + 3] = a & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- shading -- */

const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

function blobs(size, base, spots) {
  return (x, y) => {
    let [r, g, b] = base;
    for (const [cx, cy, radius, colour, strength] of spots) {
      const d = dist(x / size, y / size, cx, cy);
      const t = Math.max(0, 1 - d / radius) ** 2 * strength;
      r = mix(r, colour[0], t);
      g = mix(g, colour[1], t);
      b = mix(b, colour[2], t);
    }
    // A little noise keeps the extractor from seeing implausibly clean bands.
    const n = ((x * 7 + y * 13) % 11) - 5;
    return [r + n, g + n, b + n, 255];
  };
}

const COVERS = {
  // Vivid, several competing hues -- the extractor has to pick three that are
  // actually distinguishable.
  "vivid.png": blobs(600, [28, 40, 96], [
    [0.25, 0.28, 0.55, [64, 196, 232], 1],
    [0.78, 0.22, 0.45, [244, 92, 148], 1],
    [0.55, 0.82, 0.5, [126, 232, 168], .9],
    [0.12, 0.85, 0.35, [250, 206, 88], .8],
  ]),
  // Near-monochrome: should trip the grey path and still produce depth.
  "mono.png": blobs(600, [92, 94, 97], [
    [0.35, 0.35, 0.6, [188, 190, 192], 1],
    [0.7, 0.75, 0.5, [42, 43, 46], 1],
  ]),
  // One dominant hue, deep and saturated.
  "crimson.png": blobs(600, [58, 8, 18], [
    [0.4, 0.35, 0.65, [186, 26, 52], 1],
    [0.75, 0.8, 0.4, [232, 108, 74], .7],
  ]),
  // Bright cover -- the contrast guard should darken the ink.
  "bright.png": blobs(600, [236, 228, 210], [
    [0.3, 0.3, 0.6, [252, 246, 236], 1],
    [0.75, 0.7, 0.5, [214, 186, 148], .9],
    [0.6, 0.15, 0.3, [176, 206, 214], .8],
  ]),
};

/* ----------------------------------------------------------------- icons -- */

/* A filled square with the corner cut away -- a sleeve, at 16px. */
function icon(size) {
  return (x, y) => {
    const u = x / size, v = y / size;
    const inset = 0.12;
    const inside = u > inset && u < 1 - inset && v > inset && v < 1 - inset;
    if (!inside) return [0, 0, 0, 0];
    const t = (u - inset) / (1 - 2 * inset);
    const s = (v - inset) / (1 - 2 * inset);
    // Corner notch, bottom-right.
    if (t + s > 1.62) return [0, 0, 0, 0];
    const r = Math.round(mix(96, 236, t * 0.6 + s * 0.4));
    const g = Math.round(mix(178, 128, t * 0.5 + s * 0.5));
    const b = Math.round(mix(226, 176, s));
    return [r, g, b, 255];
  };
}

/* ------------------------------------------------------------------ run -- */

const root = path.resolve(__dirname, "..");
const artDir = path.join(root, "dev", "art");
const iconDir = path.join(root, "icons");
fs.mkdirSync(artDir, { recursive: true });
fs.mkdirSync(iconDir, { recursive: true });

for (const [name, shade] of Object.entries(COVERS)) {
  fs.writeFileSync(path.join(artDir, name), png(600, shade));
  console.log("cover  dev/art/" + name);
}

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(iconDir, `icon${size}.png`), png(size, icon(size)));
  console.log("icon   icons/icon" + size + ".png");
}
