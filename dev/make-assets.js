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

/* A full-bleed red gradient with a pale glyph knocked out of it. Every shape is
 * an inside/outside test in a 0..1 square, supersampled per pixel, which is the
 * cheapest way to get clean edges at 16px without pulling in a rasteriser. */

const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** Capsule: the segment a->b thickened by r. */
function sdSegment(px, py, ax, ay, bx, by, r) {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(wx - vx * t, wy - vy * t) - r;
}

/* Deep red in the top-left warming to a rose in the bottom-right. */
const RED_STOPS = [
  [0.00, [214, 51, 66]],
  [0.55, [227, 74, 92]],
  [1.00, [235, 104, 126]],
];

/* Very slightly off-white, so the glyph sits on the red instead of glaring. */
const INK = [226, 226, 226];

function gradient(t) {
  for (let i = 1; i < RED_STOPS.length; i++) {
    const [t1, c1] = RED_STOPS[i];
    if (t > t1 && i < RED_STOPS.length - 1) continue;
    const [t0, c0] = RED_STOPS[i - 1];
    const k = clamp01((t - t0) / (t1 - t0));
    return [mix(c0[0], c1[0], k), mix(c0[1], c1[1], k), mix(c0[2], c1[2], k)];
  }
}

/* Two eighth notes under one beam. Flat corners throughout -- the beam and the
 * stems are straight-sided, so the only curves are the two heads. */
const NOTE = {
  headR: 0.105,
  headL: [0.342, 0.615],
  headR2: [0.586, 0.580],
  stemW: 0.054,
  stemLx: 0.400,          // left edge of the left stem
  stemRx: 0.645,          // left edge of the right stem
  beamTopL: 0.322,        // beam's upper edge above each stem
  beamTopR: 0.276,
  beamH: 0.086,           // measured vertically, so the slant keeps its weight
};

function glyphNote(u, v) {
  const n = NOTE;
  const x0 = n.stemLx, x1 = n.stemRx + n.stemW;
  // Upper edge of the beam, extended across the whole glyph as the stem tops.
  const top = mix(n.beamTopL, n.beamTopR, (u - x0) / (x1 - x0));

  if (u >= x0 && u <= x1 && v >= top && v <= top + n.beamH) return true;
  if (u >= x0 && u <= x0 + n.stemW && v >= top && v <= n.headL[1]) return true;
  if (u >= n.stemRx && u <= x1 && v >= top && v <= n.headR2[1]) return true;
  if (Math.hypot(u - n.headL[0], v - n.headL[1]) <= n.headR) return true;
  if (Math.hypot(u - n.headR2[0], v - n.headR2[1]) <= n.headR) return true;
  return false;
}

/* "YTM" in straight strokes -- every letter is segments, so no font needed. */
const LETTERS = {
  Y: [[0, 0, 0.5, 0.52], [1, 0, 0.5, 0.52], [0.5, 0.52, 0.5, 1]],
  T: [[0, 0.04, 1, 0.04], [0.5, 0.04, 0.5, 1]],
  M: [[0.04, 1, 0.04, 0], [0.04, 0, 0.5, 0.66], [0.5, 0.66, 0.96, 0], [0.96, 0, 0.96, 1]],
};

function glyphYtm(u, v) {
  const lw = 0.205, gap = 0.075, lh = 0.30;
  const x0 = 0.5 - (3 * lw + 2 * gap) / 2, y0 = 0.5 - lh / 2;
  const letters = ["Y", "T", "M"];
  for (let i = 0; i < letters.length; i++) {
    const ox = x0 + i * (lw + gap);
    if (u < ox - 0.05 || u > ox + lw + 0.05) continue;
    for (const [ax, ay, bx, by] of LETTERS[letters[i]]) {
      const d = sdSegment(u, v, ox + ax * lw, y0 + ay * lh, ox + bx * lw, y0 + by * lh, 0.031);
      if (d < 0) return true;
    }
  }
  return false;
}

const GLYPHS = { note: glyphNote, ytm: glyphYtm };

/** One sample of the icon: [r, g, b, alpha 0..1]. */
function iconSample(u, v, glyph) {
  if (glyph(u, v)) return [INK[0], INK[1], INK[2], 1];
  const [r, g, b] = gradient(clamp01(u * 0.5 + v * 0.5));
  return [r, g, b, 1];
}

function icon(size, kind = "note") {
  const glyph = GLYPHS[kind];
  const n = 6; // supersampling grid; 36 samples per pixel
  return (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < n; sy++) {
      for (let sx = 0; sx < n; sx++) {
        const [sr, sg, sb, sa] = iconSample(
          (x + (sx + 0.5) / n) / size, (y + (sy + 0.5) / n) / size, glyph);
        r += sr * sa; g += sg * sa; b += sb * sa; a += sa;
      }
    }
    if (a === 0) return [0, 0, 0, 0];
    // Premultiplied average, then back to straight alpha.
    return [Math.round(r / a), Math.round(g / a), Math.round(b / a),
            Math.round((255 * a) / (n * n))];
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

/* `node dev/make-assets.js --glyph=ytm` swaps the note for the wordmark. */
const kind = (process.argv.find((a) => a.startsWith("--glyph=")) || "").slice(8) || "note";
if (!GLYPHS[kind]) throw new Error(`unknown glyph: ${kind}`);

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(iconDir, `icon${size}.png`), png(size, icon(size, kind)));
  console.log("icon   icons/icon" + size + ".png  (" + kind + ")");
}

// Proof sheets: each glyph drawn large, plus a 16x zoom of the 16px render so
// the toolbar size can be judged without squinting.
for (const name of Object.keys(GLYPHS)) {
  fs.writeFileSync(path.join(artDir, `icon-${name}-256.png`), png(256, icon(256, name)));
  const small = icon(16, name);
  fs.writeFileSync(path.join(artDir, `icon-${name}-16x16zoom.png`),
    png(256, (x, y) => small(x >> 4, y >> 4)));
  console.log("proof  dev/art/icon-" + name + "-{256,16x16zoom}.png");
}
