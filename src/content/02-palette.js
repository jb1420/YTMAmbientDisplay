/* Album cover -> screen palette.
 *
 * Everything the display looks like comes from here. The cover is drawn to a
 * tiny canvas, the pixels are bucketed by hue and lightness, and the three
 * strongest buckets become the gradient washes.
 *
 * `crossOrigin = "anonymous"` is load-bearing: googleusercontent serves the art
 * with a permissive CORS header, so the canvas stays untainted and getImageData
 * works. Without the attribute the same request taints it and throws. This is
 * the only reason the extension needs no background script.
 */

globalThis.YTMD = globalThis.YTMD || {};

YTMD.palette = (() => {
  "use strict";

  const SAMPLE = 32;          // canvas is SAMPLE x SAMPLE -- ~1000 pixels is plenty
  const HUE_BINS = 24;        // 15 degrees per bin
  const LIT_BINS = 4;

  /* A deliberately neutral slate. This is what "no colour information" looks
   * like -- it should not read as a design choice. */
  const DEFAULT = Object.freeze({
    bgBase: "#131a21",
    wash1: "#24405c",
    wash2: "#1d3347",
    wash3: "#2b2f4a",
    ink: "#f4f6f8",
  });

  const cache = new Map();

  /* ------------------------------------------------------------ colour -- */

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [
      Math.round(hue(h + 1 / 3) * 255),
      Math.round(hue(h) * 255),
      Math.round(hue(h - 1 / 3) * 255),
    ];
  }

  const hex = ([r, g, b]) =>
    "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

  const hslHex = (h, s, l) => hex(hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1)));

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* WCAG relative luminance, from sRGB 0-255. */
  function luminance([r, g, b]) {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  const contrast = (a, b) => {
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
  };

  /* ------------------------------------------------------------ sampling -- */

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = setTimeout(() => reject(new Error("cover load timed out")), 8000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error("cover failed to load")); };
      img.src = url;
    });
  }

  function readPixels(img) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SAMPLE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    return ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  }

  /* Bucket every usable pixel, then rank the buckets. Weighting by saturation
   * keeps a muted cover from collapsing to grey while still letting one strong
   * accent win when there is one. */
  function rank(data) {
    const bins = new Map();
    let chromaWeight = 0;
    let total = 0;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      total++;
      if (l < 0.06 || l > 0.96) continue;

      const hb = Math.floor(h * HUE_BINS) % HUE_BINS;
      const lb = Math.min(LIT_BINS - 1, Math.floor(l * LIT_BINS));
      const key = hb * LIT_BINS + lb;

      // Favour saturated, mid-lightness pixels -- but never to zero, so a
      // desaturated cover still produces a ranking.
      const weight = (0.35 + 0.65 * s) * (1 - Math.abs(l - 0.5) * 0.6);
      chromaWeight += s;

      let bin = bins.get(key);
      if (!bin) bins.set(key, (bin = { r: 0, g: 0, b: 0, n: 0, w: 0, h: 0, s: 0, l: 0 }));
      bin.r += r; bin.g += g; bin.b += b;
      bin.h += h; bin.s += s; bin.l += l;
      bin.n++;
      bin.w += weight;
    }

    const ranked = [...bins.values()]
      .map((bin) => ({
        h: bin.h / bin.n,
        s: bin.s / bin.n,
        l: bin.l / bin.n,
        weight: bin.w,
      }))
      .sort((a, b) => b.weight - a.weight);

    return { ranked, monochrome: total > 0 && chromaWeight / total < 0.09 };
  }

  function hueGap(a, b) {
    const d = Math.abs(a - b);
    return d > 0.5 ? 1 - d : d;
  }

  /* Three colours that are actually distinguishable. A cover built around a
   * single hue -- one deep red, say -- will not offer three, so the shortfall
   * is derived from the dominant rather than padded with duplicates. */
  function spread(ranked) {
    const picked = [];
    for (const gap of [0.055, 0.03, 0.012]) {
      for (const c of ranked) {
        if (picked.length === 3) break;
        if (picked.includes(c)) continue;
        const clashes = picked.some(
          (p) => hueGap(p.h, c.h) < gap && Math.abs(p.l - c.l) < 0.14
        );
        if (!clashes) picked.push(c);
      }
      if (picked.length === 3) break;
    }

    const seed = picked[0] ?? { h: 0.58, s: 0.32, l: 0.42 };
    const offsets = [[0.07, 0.07], [-0.09, -0.06]];
    let i = 0;
    while (picked.length < 3) {
      const [dh, dl] = offsets[i++ % offsets.length];
      picked.push({
        h: (seed.h + dh + 1) % 1,
        s: seed.s,
        l: clamp(seed.l + dl, 0.18, 0.7),
      });
    }
    return picked;
  }

  /* The display is always a dark room lit by the cover, so the ink stays light
   * and the background is the thing that moves. A bright cover becomes a deep,
   * saturated version of its own hues rather than a pale screen -- which is
   * both truer to the artwork and the only way to keep text legible. */
  function build(ranked, monochrome) {
    const top = spread(ranked);
    const dominant = top[0];

    // A grey cover has no meaningful hue -- borrow one cool hue and let
    // lightness carry the variation instead, so the screen still has depth.
    const hueOf = (c, i) => (monochrome ? 0.58 + i * 0.04 : c.h);

    let washes = top.map((c, i) => ({
      h: hueOf(c, i),
      s: monochrome ? 0.16 : clamp(c.s * 1.05, 0.25, 0.7),
      l: clamp(c.l * 0.92 + 0.1, 0.32, 0.55),
    }));

    let base = {
      h: hueOf(dominant, 0),
      s: monochrome ? 0.12 : clamp(dominant.s * 0.55, 0.1, 0.35),
      l: clamp(dominant.l * 0.22 + 0.06, 0.08, 0.15),
    };

    const ink = { h: hueOf(dominant, 0), s: monochrome ? 0.04 : 0.07, l: 0.96 };
    const rgb = (c) => hslToRgb(c.h, clamp(c.s, 0, 1), clamp(c.l, 0, 1));

    // The washes cover most of the base, so the effective ground is roughly
    // their average sitting over it.
    const ground = () => {
      const b = rgb(base);
      const w = washes.map(rgb);
      return [0, 1, 2].map((i) =>
        0.4 * b[i] + 0.6 * ((w[0][i] + w[1][i] + w[2][i]) / 3)
      );
    };

    // Secondary text runs at 62% ink, so that -- not the title -- is the
    // binding constraint. Check the composite the reader actually sees.
    const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));

    const worstContrast = () => {
      const g = ground();
      const dim = over(rgb(ink), g, 0.62);
      return contrast(luminance(dim), luminance(g));
    };

    // Darken the room until the dim text clears 4.5:1.
    for (let i = 0; i < 14 && worstContrast() < 4.5; i++) {
      washes = washes.map((c) => ({ ...c, l: Math.max(0.1, c.l * 0.9) }));
      base = { ...base, l: Math.max(0.05, base.l * 0.9) };
    }

    return {
      bgBase: hslHex(base.h, base.s, base.l),
      wash1: hslHex(washes[0].h, washes[0].s, washes[0].l),
      wash2: hslHex(washes[1].h, washes[1].s, washes[1].l),
      wash3: hslHex(washes[2].h, washes[2].s, washes[2].l),
      ink: hslHex(ink.h, ink.s, ink.l),
    };
  }

  /* --------------------------------------------------------------- api -- */

  /** Resolve a cover URL to a palette. Returns DEFAULT if anything fails. */
  async function extract(url) {
    if (!url) return { ...DEFAULT };
    if (cache.has(url)) return cache.get(url);

    let tokens;
    try {
      const img = await loadImage(url);
      const { ranked, monochrome } = rank(readPixels(img));
      tokens = ranked.length ? build(ranked, monochrome) : { ...DEFAULT };
    } catch (err) {
      console.warn("[YTM Ambient Display] palette extraction failed:", err.message);
      tokens = { ...DEFAULT };
    }

    cache.set(url, tokens);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    return tokens;
  }

  return { DEFAULT, extract, _internals: { rgbToHsl, hslToRgb, luminance, contrast } };
})();
