/**
 * Brand-kit primitives. Deterministic, client-side (canvas) asset builders +
 * palette extraction + zip packaging. The modal orchestrates these so it can
 * reveal each asset live; AI variants (FLUX.2-pro edits) are added separately.
 */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the logo image"));
    img.src = src;
  });
}

/**
 * Ensure an image source is a base64 data URL the *server* can ingest.
 * Logos restored from on-device history render via `blob:` object URLs (and
 * could in theory be `http(s)`), which Together's image API cannot fetch; it
 * only accepts a data URL or a publicly reachable URL. Fresh data URLs pass
 * through untouched. Used before every server-bound image send (edits + brand
 * kit AI assets).
 */
export async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the logo image"));
    reader.readAsDataURL(blob);
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
      "image/png",
    );
  });
}

/**
 * Background removal via edge flood-fill. Seeds from every border pixel that
 * matches the (corner-sampled) background color and clears only the connected
 * region, so interior pixels that happen to share the bg color (e.g. white
 * counters inside letters, white negative space inside a mark) are preserved,
 * unlike a global color key which punches holes. A light feather softens the
 * anti-aliased edge so there's no hard fringe on dark surfaces.
 */
export function makeTransparent(
  img: HTMLImageElement | HTMLCanvasElement,
  tolerance = 30,
): HTMLCanvasElement {
  const w = (img as HTMLImageElement).naturalWidth || img.width;
  const h = (img as HTMLImageElement).naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  // If the input is already substantially transparent (a transparent generation,
  // a restored history blob, an uploaded transparent mark), there is no flat
  // background to key out, and flood-filling would erase dark content whose
  // transparent surround happens to carry RGB black. Leave it untouched.
  let alreadyClear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 16) alreadyClear++;
  if (alreadyClear / (w * h) > 0.5) return canvas;

  // Reference bg = average of the OPAQUE corners only (a transparent corner's
  // RGB is meaningless and would poison the reference color).
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  let br = 0,
    bg = 0,
    bb = 0,
    nc = 0;
  for (const c of corners) {
    if (d[c + 3] < 200) continue;
    br += d[c];
    bg += d[c + 1];
    bb += d[c + 2];
    nc++;
  }
  if (nc === 0) return canvas; // no solid corner → no detectable background
  br /= nc;
  bg /= nc;
  bb /= nc;

  const dist = (p: number) =>
    Math.abs(d[p * 4] - br) +
    Math.abs(d[p * 4 + 1] - bg) +
    Math.abs(d[p * 4 + 2] - bb);

  // Adaptive tolerance: the generators return JPEGs, whose flat backgrounds
  // carry real block/ringing noise. A fixed threshold either leaves noise
  // residue (too tight) or eats light marks (too loose), so measure the
  // border pixels' actual spread around the reference color and set the hard
  // threshold just above their 95th percentile. Clamped so a busy border
  // can't blow the tolerance open.
  const borderDists: number[] = [];
  for (let x = 0; x < w; x += 2) {
    if (d[x * 4 + 3] >= 200) borderDists.push(dist(x));
    const q = (h - 1) * w + x;
    if (d[q * 4 + 3] >= 200) borderDists.push(dist(q));
  }
  for (let y = 0; y < h; y += 2) {
    const l = y * w;
    const r = y * w + w - 1;
    if (d[l * 4 + 3] >= 200) borderDists.push(dist(l));
    if (d[r * 4 + 3] >= 200) borderDists.push(dist(r));
  }
  borderDists.sort((a, b) => a - b);
  const p95 = borderDists.length
    ? borderDists[Math.floor(borderDists.length * 0.95)]
    : 0;
  const tol = Math.min(Math.max(tolerance * 3, p95 * 1.4 + 18), 168);
  const tolSoft = tol * 2.1; // wider band for the feathered edge

  // Flood fill from the borders over pixels within the hard tolerance. The
  // stack is a preallocated typed array (each pixel enters at most once via
  // `visited`), which avoids megabytes of number[] push/pop churn at 1024².
  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const seed = (p: number) => {
    if (visited[p]) return;
    // Already-transparent pixels are background; opaque pixels join the cleared
    // region only when within tolerance of the reference bg color.
    if (d[p * 4 + 3] < 16 || dist(p) < tol) {
      visited[p] = 1;
      stack[sp++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (sp > 0) {
    const p = stack[--sp];
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }

  // Enclosed pockets + noise, decided per REGION rather than per pixel. JPEG
  // noise and anti-alias contamination drag individual counter pixels away
  // from the exact background color, which is how letter holes ("o", "a",
  // "b") kept shipping filled and then glowed on dark surfaces. A region's
  // MEAN color averages that noise away, so walk every connected component
  // of still-opaque, bg-band pixels and clear it when either:
  //   - its mean color is still essentially the background (a hole showing
  //     the backdrop through the ink), whatever its size; or
  //   - it is smaller than the speck threshold (floating JPEG noise).
  // A component bigger than a fifth of the image is never mean-cleared:
  // at that scale it would be the artwork itself (a very pale logo), not a
  // pocket in the ink.
  {
    const speckMax = Math.max(64, Math.round(w * h * 0.0002)); // ~200px @1024²
    const meanTol = tol * 1.3;
    const areaCap = Math.round(w * h * 0.2);
    const comp = new Uint8Array(w * h); // 1 = already assigned to a component
    const members = new Int32Array(w * h);
    for (let start = 0; start < w * h; start++) {
      if (comp[start] || d[start * 4 + 3] === 0 || dist(start) >= tolSoft) {
        continue;
      }
      let count = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sp2 = 0;
      stack[sp2++] = start;
      comp[start] = 1;
      while (sp2 > 0) {
        const p = stack[--sp2];
        members[count++] = p;
        sumR += d[p * 4];
        sumG += d[p * 4 + 1];
        sumB += d[p * 4 + 2];
        const x = p % w;
        const y = (p - x) / w;
        for (const q of [
          x > 0 ? p - 1 : -1,
          x < w - 1 ? p + 1 : -1,
          y > 0 ? p - w : -1,
          y < h - 1 ? p + w : -1,
        ]) {
          if (q < 0 || comp[q] || d[q * 4 + 3] === 0) continue;
          if (dist(q) >= tolSoft) continue;
          comp[q] = 1;
          stack[sp2++] = q;
        }
      }
      const meanDist =
        Math.abs(sumR / count - br) +
        Math.abs(sumG / count - bg) +
        Math.abs(sumB / count - bb);
      if (count <= speckMax || (meanDist < meanTol && count < areaCap)) {
        for (let i = 0; i < count; i++) d[members[i] * 4 + 3] = 0;
      }
    }
  }

  // Feather: any still-opaque pixel that borders a cleared one and sits in the
  // soft band gets its alpha scaled down: kills the bg-colored halo. Two rings
  // deep, since JPEG edges smear the background over more than one pixel.
  for (let ring = 0; ring < 2; ring++) {
    const faded: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (d[p * 4 + 3] === 0) continue;
        if (visited[p] === 2) continue; // already feathered in a prior ring
        const touchesCleared =
          (x > 0 && (d[(p - 1) * 4 + 3] === 0 || visited[p - 1] === 2)) ||
          (x < w - 1 && (d[(p + 1) * 4 + 3] === 0 || visited[p + 1] === 2)) ||
          (y > 0 && (d[(p - w) * 4 + 3] === 0 || visited[p - w] === 2)) ||
          (y < h - 1 && (d[(p + w) * 4 + 3] === 0 || visited[p + w] === 2));
        if (!touchesCleared) continue;
        const dd = dist(p);
        if (dd < tolSoft) {
          // 0 at pure bg → 1 at the far edge of the band; the outer ring only
          // softens (never fully clears), so thin strokes survive.
          const k = (dd - tol) / (tolSoft - tol);
          const scale = Math.max(ring === 0 ? 0 : 0.35, Math.min(1, k));
          d[p * 4 + 3] = Math.round(d[p * 4 + 3] * scale);
          faded.push(p);
        }
      }
    }
    for (const p of faded) visited[p] = 2;
    if (!faded.length) break;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** How much of a (post-removal) canvas is transparent, used to detect when
 *  background removal failed (textured/gradient bg → almost nothing cleared). */
export function transparentFraction(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let clear = 0;
  const n = canvas.width * canvas.height;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 16) clear++;
  return clear / n;
}

// Two flat surfaces every asset can fall back to: the app's near-black and pure
// white. Used wherever a backdrop tone is flipped to keep the logo legible.
const DARK_SURFACE = "#0c0c0b";
const LIGHT_SURFACE = "#ffffff";

// Ink-polarity thresholds. Mean ink luminance above LIGHT → the logo is light
// and needs a dark surface to read; below DARK → it's dark and needs a light
// one; in between it reads on either. Chroma below MONO_CHROMA means the ink is
// effectively monochrome, so it's safe to recolor to a legible black/white form
// without throwing away brand color.
const INK_LIGHT = 0.62;
const INK_DARK = 0.34;
const INK_MONO_CHROMA = 0.12;

/**
 * Alpha-weighted mean perceptual luminance + chroma (each 0..1) of a logo's
 * ink. Pass the transparent cutout so the reading reflects the artwork itself,
 * not its plain background. This is the measurement the whole kit was missing:
 * everything that drops the logo onto a surface uses it to pick a backdrop that
 * actually contrasts with the mark, instead of assuming every logo is
 * dark-on-light. Empty input returns neutral (0.5 luma, 0 chroma).
 */
export function inkStats(source: HTMLCanvasElement | HTMLImageElement): {
  luma: number;
  chroma: number;
} {
  const w = 64;
  const h = 64;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = "high";
  cx.drawImage(source, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  let lum = 0;
  let chroma = 0;
  let wsum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 24) continue; // skip the transparent surround and its soft feather
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    lum += ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * a;
    chroma += ((Math.max(r, g, b) - Math.min(r, g, b)) / 255) * a;
    wsum += a;
  }
  return wsum === 0
    ? { luma: 0.5, chroma: 0 }
    : { luma: lum / wsum, chroma: chroma / wsum };
}

/**
 * Whether a logo's ink is light enough to need dark surfaces. Keeps the polarity
 * threshold in one place so callers outside this module (the AI prompt builder
 * is fed via the hook) agree with the canvas builders. Non-keyable logos report
 * false, preserving the historical dark-on-light assumption.
 */
export function isLightInkLogo(transparent: HTMLCanvasElement): boolean {
  if (transparentFraction(transparent) <= 0.06) return false;
  return inkStats(cropToContent(transparent, 0.02)).luma > INK_LIGHT;
}

/**
 * Fraction of a cutout's ink (alpha >= 128) darker than `threshold` luma.
 * The mean-luma reading above can pass a logo whose *average* is mid (blue icon
 * + white counters) while one of its parts (dark lettering) is still illegible
 * on a dark surface; this measures that failing part directly.
 */
export function darkInkFraction(
  source: HTMLCanvasElement | HTMLImageElement,
  threshold = 0.3,
): number {
  const w = 64;
  const h = 64;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = "high";
  cx.drawImage(source, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  let ink = 0;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    ink++;
    const luma = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    if (luma < threshold) dark++;
  }
  return ink === 0 ? 0 : dark / ink;
}

/**
 * Reverse a logo's near-dark ink to white so it reads on dark surfaces, while
 * leaving mid and light tones (brand colors, counters) untouched. This is the
 * "reversed" logo a designer ships: dark lettering flips to white, a colored
 * mark keeps its color. The remap blends across a luma band so anti-aliased
 * edges and gradient shading don't band.
 */
export function reverseForDark(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const im = ctx.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  const HI = 0.34; // ink at or above this luma is untouched
  const LO = 0.18; // ink at or below this luma becomes fully white
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const luma = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    if (luma >= HI) continue;
    const t = Math.min(1, (HI - luma) / (HI - LO));
    d[i] += (255 - d[i]) * t;
    d[i + 1] += (255 - d[i + 1]) * t;
    d[i + 2] += (255 - d[i + 2]) * t;
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

/** Bounding box of non-transparent content, or null if fully transparent. */
export function contentBounds(
  canvas: HTMLCanvasElement,
  alphaThresh = 12,
): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h } = canvas;
  const d = canvas
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, w, h).data;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > alphaThresh) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Crop a transparent canvas tight to its content (optional margin fraction). */
export function cropToContent(
  canvas: HTMLCanvasElement,
  margin = 0,
): HTMLCanvasElement {
  const b = contentBounds(canvas);
  if (!b) return canvas;
  const m = Math.round(Math.max(b.w, b.h) * margin);
  const sx = Math.max(0, b.x - m);
  const sy = Math.max(0, b.y - m);
  const sw = Math.min(canvas.width - sx, b.w + 2 * m);
  const sh = Math.min(canvas.height - sy, b.h + 2 * m);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out
    .getContext("2d", { willReadFrequently: true })!
    .drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

/**
 * Recolor every opaque pixel of a (transparent) canvas to a single color.
 * `hardEdge` first zeroes the low-alpha feather band that makeTransparent
 * leaves on purpose: painted solid, that band reads as a faint halo and
 * visually fattens thin strokes on the monochrome variants.
 */
function recolor(
  src: HTMLCanvasElement,
  color: string,
  hardEdge = false,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  if (hardEdge) {
    const im = ctx.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 64) d[i] = 0;
    ctx.putImageData(im, 0, 0);
  }
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Fallback cutout when the border flood fill couldn't key the background
 * (gradient or textured bg): a plain global color key against the corner
 * average. Punches interior bg-colored counters too, which is acceptable for
 * the monochrome fallback it feeds; returns null when even this clears nothing.
 */
function globalKeyCutout(
  img: HTMLImageElement,
  tolerance = 42,
): HTMLCanvasElement | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  let br = 0,
    bg = 0,
    bb = 0,
    nc = 0;
  for (const p of corners) {
    if (d[p + 3] < 200) continue;
    br += d[p];
    bg += d[p + 1];
    bb += d[p + 2];
    nc++;
  }
  if (nc === 0) return null;
  br /= nc;
  bg /= nc;
  bb /= nc;
  const tol = tolerance * 3;
  let cleared = 0;
  for (let i = 0; i < d.length; i += 4) {
    const dd =
      Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
    if (dd < tol) {
      d[i + 3] = 0;
      cleared++;
    }
  }
  const total = w * h;
  // Useless if it cleared almost nothing (textured bg) or nearly everything
  // (logo too close to the bg color).
  if (cleared / total < 0.06 || cleared / total > 0.985) return null;
  ctx.putImageData(image, 0, 0);
  return c;
}

/** Draw a source contained + centered onto a w×h canvas, optional bg fill. */
export function scaleOnto(
  source: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  bg: string | null,
  pad: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  const sw = (source as HTMLImageElement).naturalWidth || source.width;
  const sh = (source as HTMLImageElement).naturalHeight || source.height;
  const avail = Math.min(w, h) * (1 - pad);
  const scale = avail / Math.max(sw, sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas;
}

/** Pull a small, distinct brand palette out of the logo. */
export function extractPalette(img: HTMLImageElement, count = 6): string[] {
  const w = 48;
  const h = 48;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const buckets = new Map<
    string,
    { n: number; r: number; g: number; b: number }
  >();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }

  const sorted = Array.from(buckets.values())
    .sort((a, b) => b.n - a.n)
    .map((e) => ({
      r: Math.round(e.r / e.n),
      g: Math.round(e.g / e.n),
      b: Math.round(e.b / e.n),
    }));

  const picked: { r: number; g: number; b: number }[] = [];
  for (const col of sorted) {
    if (picked.length >= count) break;
    if (
      picked.every(
        (p) =>
          Math.abs(p.r - col.r) +
            Math.abs(p.g - col.g) +
            Math.abs(p.b - col.b) >
          40,
      )
    ) {
      picked.push(col);
    }
  }
  return picked.map(
    (col) =>
      "#" +
      [col.r, col.g, col.b]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
  );
}

/**
 * Vivid brand-color extraction for "start from your brand". Unlike
 * extractPalette (which averages frequency buckets and can mute a logo's true
 * hue), this groups colorful pixels by HUE and returns the most *saturated*
 * representative of each prominent hue, so a brand's real orange/blue comes
 * back pure, not a washed-out blend with its anti-aliased edges. Neutrals
 * (white/black/grey backgrounds) are ignored unless the logo is monochrome.
 */
export function extractBrandPalette(
  img: HTMLImageElement,
  count = 6,
): string[] {
  const w = 72;
  const h = 72;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const HUE_BINS = 18; // 20° each
  // Per hue bin: a saturation²-weighted running average (the swatch shown,
  // resistant to single anti-aliased outlier pixels), the peak saturation
  // (how vivid this hue gets) and the pixel count (how much area it covers).
  type Bin = {
    n: number;
    s: number;
    wr: number;
    wg: number;
    wb: number;
    w: number;
  };
  const bins = new Map<number, Bin>();
  let darkN = 0;
  let lightN = 0;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue; // transparent
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const v = mx / 255;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    if (s < 0.22 || v < 0.1) {
      // Near-neutral: track as a fallback for monochrome marks.
      if (v > 0.8) lightN++;
      else darkN++;
      continue;
    }
    let hue: number;
    if (mx === mn) hue = 0;
    else if (mx === r) hue = ((((g - b) / (mx - mn)) % 6) + 6) % 6;
    else if (mx === g) hue = (b - r) / (mx - mn) + 2;
    else hue = (r - g) / (mx - mn) + 4;
    hue = (hue * 60 + 360) % 360;
    const key = Math.floor(hue / (360 / HUE_BINS));
    const e = bins.get(key) || { n: 0, s: 0, wr: 0, wg: 0, wb: 0, w: 0 };
    e.n++;
    if (s > e.s) e.s = s;
    const wgt = s * s;
    e.wr += r * wgt;
    e.wg += g * wgt;
    e.wb += b * wgt;
    e.w += wgt;
    bins.set(key, e);
  }

  const vivid = Array.from(bins.values())
    .filter((e) => e.n >= 3 && e.w > 0) // drop single-pixel noise / JPEG speckle
    // Blend area with vividness so a small-but-iconic accent (a tiny vivid red
    // dot) isn't pushed out by large washed-out regions.
    .sort((a, b) => b.n * (0.5 + 0.5 * b.s) - a.n * (0.5 + 0.5 * a.s))
    .slice(0, count)
    .map((e) => rgbToHex(e.wr / e.w, e.wg / e.w, e.wb / e.w));

  if (vivid.length) return vivid;
  // Monochrome logo: return a sensible neutral.
  return [darkN >= lightN ? "#1A1A1A" : "#E8E8E8"];
}

/**
 * The palette shipped inside the brand kit (brand-colors.css/json + swatches).
 * Leads with the logo's TRUE vivid hues (hue-grouped, saturation-weighted, the
 * same extraction the brand importer uses) and tops up with the broader
 * frequency palette for neutrals, deduped by channel distance. Avoids the
 * pure-frequency averaging that could ship muddy in-between colors that exist
 * nowhere in the artwork.
 */
export function kitPalette(img: HTMLImageElement, count = 6): string[] {
  const out: string[] = [];
  const close = (a: string, b: string) => {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return (
      Math.abs(ca.r - cb.r) + Math.abs(ca.g - cb.g) + Math.abs(ca.b - cb.b) <=
      48
    );
  };
  for (const hex of [
    ...extractBrandPalette(img, 4),
    ...extractPalette(img, count),
  ]) {
    if (out.length >= count) break;
    if (!out.some((seen) => close(seen, hex))) out.push(hex.toUpperCase());
  }
  return out;
}

// ── Color helpers ───────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) =>
        Math.max(0, Math.min(255, Math.round(x)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
/** Lighten (amt>0) or darken (amt<0) a hex color, amt in -1..1. */
function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = (v: number) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return rgbToHex(f(r), f(g), f(b));
}
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const mx = Math.max(rn, gn, bn);
  const mn = Math.min(rn, gn, bn);
  const l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (mx === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}
function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
/** The brand hue at a specific lightness (slightly tamed saturation). */
function toneAt(hex: string, l: number): string {
  const { h, s } = hexToHsl(hex);
  return hslToHex(h, Math.min(s, 0.82), Math.max(0, Math.min(1, l)));
}
function saturation({ r, g, b }: { r: number; g: number; b: number }): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}
/** Black or white text that reads on the given background. */
export function bestTextColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
    ? "#121212"
    : "#ffffff";
}
/** A strong brand color: the picked primary if it's a real hex, else the most
 *  saturated mid-tone from the palette, else a sensible blue. */
export function pickBrandColor(
  primaryColor: string,
  palette: string[],
): string {
  if (
    primaryColor &&
    primaryColor !== "auto" &&
    /^#?[0-9a-f]{6}$/i.test(primaryColor)
  ) {
    return primaryColor.startsWith("#") ? primaryColor : `#${primaryColor}`;
  }
  const strong = palette
    .map(hexToRgb)
    .filter((c) => {
      const L = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
      return L > 0.12 && L < 0.9 && saturation(c) > 0.18;
    })
    .sort((a, b) => saturation(b) - saturation(a));
  const pool = strong.length ? strong : palette.map(hexToRgb);
  if (!pool.length) return "#2F6FF5";
  return rgbToHex(pool[0].r, pool[0].g, pool[0].b);
}

/** Resolve the primary brand color when importing from a website: prefer an
 *  explicit, vivid theme-color, otherwise the most prominent vivid color from
 *  the logo (the palette is already sorted by prominence by
 *  extractBrandPalette). The user can still re-pick from the detected swatches. */
export function brandColorFromImport(
  themeColor: string | null,
  palette: string[],
): string {
  if (themeColor && /^#[0-9a-f]{6}$/i.test(themeColor)) {
    const c = hexToRgb(themeColor);
    const L = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    if (saturation(c) > 0.22 && L > 0.12 && L < 0.92) {
      return themeColor.toUpperCase();
    }
  }
  return palette[0] || "#2F6FF5";
}

/** 1-2 letter initials for a monogram, from a company name. */
export function initialsFrom(name: string): string {
  const clean = (name || "").trim();
  if (!clean) return "•";
  const words = clean.split(/[\s\-_/]+/).filter(Boolean);
  let s: string;
  if (words.length >= 2) {
    s = (words[0][0] || "") + (words[1][0] || "");
  } else {
    const caps = words[0].match(/[A-Z]/g);
    s = caps && caps.length >= 2 ? caps.slice(0, 2).join("") : words[0][0];
  }
  return (s || "•").toUpperCase();
}

// ── Canvas building blocks ──────────────────────────────────────
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A transparent canvas with centered monogram initials in `color`. */
export function monogramGlyph(
  initials: string,
  color: string,
): HTMLCanvasElement {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const fontSize = initials.length > 1 ? 520 : 680;
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  // Optical center: nudge up slightly so the visual mass sits centered.
  ctx.fillText(initials, size / 2, size / 2 + fontSize * 0.04);
  return cropToContent(c, 0.04);
}

/** Center a source (contained) on a rounded square tile filled with `bg`. */
export function tileWith(
  source: HTMLImageElement | HTMLCanvasElement,
  size: number,
  bg: string,
  pad = 0.2,
  radiusFrac = 0.22,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (radiusFrac > 0) {
    roundRectPath(ctx, 0, 0, size, size, size * radiusFrac);
    ctx.fillStyle = bg;
    ctx.fill();
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const sw = (source as HTMLImageElement).naturalWidth || source.width;
  const sh = (source as HTMLImageElement).naturalHeight || source.height;
  const avail = size * (1 - pad);
  const sc = avail / Math.max(sw, sh);
  ctx.drawImage(
    source,
    (size - sw * sc) / 2,
    (size - sh * sc) / 2,
    sw * sc,
    sh * sc,
  );
  return c;
}

/** A smooth diagonal brand gradient canvas. The endpoints are derived in HSL
 *  with a guaranteed minimum lightness spread, so a near-black or near-white
 *  brand color still yields a visible gradient instead of a flat rectangle. */
export function gradientCanvas(
  w: number,
  h: number,
  hex: string,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const { l } = hexToHsl(hex);
  let lTop = Math.min(0.8, l + 0.16);
  let lBot = Math.max(0.14, l - 0.24);
  if (lTop - lBot < 0.26) {
    const mid = (lTop + lBot) / 2;
    lTop = Math.min(0.84, mid + 0.13);
    lBot = Math.max(0.1, mid - 0.13);
  }
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, toneAt(hex, lTop));
  g.addColorStop(1, toneAt(hex, lBot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/** Draw a source contained at maxFrac of the min side, centered at (cx,cy). */
function placeContained(
  bgCanvas: HTMLCanvasElement,
  source: HTMLImageElement | HTMLCanvasElement,
  maxFrac: number,
  cx: number,
  cy: number,
): HTMLCanvasElement {
  const ctx = bgCanvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const W = bgCanvas.width;
  const H = bgCanvas.height;
  const sw = (source as HTMLImageElement).naturalWidth || source.width;
  const sh = (source as HTMLImageElement).naturalHeight || source.height;
  const avail = Math.min(W, H) * maxFrac;
  const sc = avail / Math.max(sw, sh);
  ctx.drawImage(
    source,
    cx * W - (sw * sc) / 2,
    cy * H - (sh * sc) / 2,
    sw * sc,
    sh * sc,
  );
  return bgCanvas;
}

/** Logo (or mark) centered/placed on a brand gradient. */
export function onGradient(
  source: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  hex: string,
  maxFrac: number,
  cx = 0.5,
  cy = 0.5,
): HTMLCanvasElement {
  return placeContained(gradientCanvas(w, h, hex), source, maxFrac, cx, cy);
}

/** Logo centered on a solid background (e.g. white OG card). */
export function onSolid(
  source: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  bg: string,
  maxFrac: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  return placeContained(c, source, maxFrac, 0.5, 0.5);
}

export type AssetSpec = {
  group: string;
  name: string;
  filename: string;
  build: () => Promise<Blob>;
  /** Built + included in the zip, but not shown as a tile. */
  hidden?: boolean;
  /** A metered AI render (billed per image); everything else is free canvas work. */
  ai?: boolean;
};

export type DeterministicCtx = {
  logoType: string;
  companyName: string;
  brandColor: string; // resolved hex
  palette: string[];
};

/**
 * Deterministic (canvas, always-available, perfect-fidelity) brand-kit assets.
 * Logo-type aware: wordmark / icon+name logos get a clean monogram for their
 * icon & favicon (a wide wordmark can't be a square favicon); icon / emblem /
 * abstract / monogram logos use their actual mark. Backgrounds and social
 * cards are real canvas composites of the logo (never AI), so the logo is
 * always reproduced exactly. Falls back gracefully when the background can't be
 * removed (textured logo) by compositing on clean white instead of a gradient.
 */
/**
 * Try to isolate the *icon* from a combination mark (icon + name) for a crisp
 * square favicon. Combination marks almost always read "icon, gap, name" (icon
 * on the left, or stacked on top), so we take the *leading* content block up to
 * the first real gap: position, not density (the company name is often bolder
 * than a fine-lined icon, which is why a density score picks the wrong part).
 * Returns null when there's no clean leading icon (icon fused into the text, or
 * a near-square mark) so the caller can use the whole logo instead.
 */
export function extractIconRegion(
  src: HTMLCanvasElement,
): HTMLCanvasElement | null {
  const cropped = cropToContent(src, 0);
  const W = cropped.width;
  const H = cropped.height;
  if (W < 12 || H < 12) return null;
  const d = cropped
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, W, H).data;
  const A = 40; // alpha "ink" threshold

  // One O(W*H) pass precomputes per-row and per-column ink coverage, so the
  // band scans below are O(1) per line instead of rescanning the whole image.
  const rowInk = new Float32Array(H);
  const colInk = new Float32Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > A) {
        rowInk[y]++;
        colInk[x]++;
      }
    }
  }
  for (let y = 0; y < H; y++) rowInk[y] /= W;
  for (let x = 0; x < W; x++) colInk[x] /= H;

  // The leading content band along an axis, ended by the first real gap.
  // axis "row" → the band on TOP (stacked icon-over-name); "col" → the band on
  // the LEFT (icon-then-name). We don't guess the layout from aspect (a tall
  // icon over a wide name reads "wide" but is stacked); we try both and keep
  // whichever yields the more icon-shaped block.
  const leading = (axis: "row" | "col"): HTMLCanvasElement | null => {
    const N = axis === "row" ? H : W;
    const M = axis === "row" ? W : H;
    const onT = 0.04;
    const gapT = 0.012;
    const gapLen = Math.max(2, Math.round(M * 0.05));
    const ink = (i: number) => (axis === "row" ? rowInk[i] : colInk[i]);
    let i = 0;
    while (i < N && ink(i) <= onT) i++;
    const start = i;
    // Separate at the LARGEST interior gap (ink on both sides), not the first
    // one: an icon with internal splits (stacked bars, a globe horizon) has
    // small gaps inside itself, while the icon-to-name separator is normally
    // the widest gap on the axis. First-gap splitting truncated such icons.
    let bestGapStart = -1;
    let bestGapLen = 0;
    while (i < N) {
      if (ink(i) <= gapT) {
        const g = i;
        while (i < N && ink(i) <= gapT) i++;
        const runLen = i - g;
        // i < N → ink resumes after the run, so the gap is interior.
        if (i < N && runLen >= gapLen && runLen > bestGapLen) {
          bestGapLen = runLen;
          bestGapStart = g;
        }
      } else i++;
    }
    if (bestGapStart < 0) return null; // no interior gap → not separable
    const end = bestGapStart;
    const len = end - start;
    if (len < 6) return null;
    const out = document.createElement("canvas");
    if (axis === "row") {
      out.width = W;
      out.height = len;
      out
        .getContext("2d", { willReadFrequently: true })!
        .drawImage(cropped, 0, start, W, len, 0, 0, W, len);
    } else {
      out.width = len;
      out.height = H;
      out
        .getContext("2d", { willReadFrequently: true })!
        .drawImage(cropped, start, 0, len, H, 0, 0, len, H);
    }
    const tight = cropToContent(out, 0);
    const a = tight.width / tight.height;
    if (a < 0.45 || a > 2.2) return null; // not icon-shaped
    if (tight.width >= W * 0.95 && tight.height >= H * 0.95) return null; // ≈ whole logo
    if (transparentFraction(tight) > 0.97) return null; // basically empty
    return tight;
  };

  const top = leading("row");
  const left = leading("col");
  const squareness = (c: HTMLCanvasElement | null) =>
    c ? Math.abs(Math.log(c.width / c.height)) : Infinity;
  // Prefer the more square (icon-like) of the two candidate blocks.
  return squareness(top) <= squareness(left) ? top : left;
}

/**
 * The square mark to use for icons/favicons. Combination marks ("icon + name")
 * use their isolated icon, falling back to the *whole logo* (never invented
 * initials) when the icon can't be cleanly separated. Icon / abstract / emblem /
 * monogram logos use the mark as-is. Only a pure wordmark (or a logo whose
 * background couldn't be removed) gets a clean initials monogram.
 */
export function iconMark(
  transFull: HTMLCanvasElement,
  cutoutOk: boolean,
  logoType: string,
  companyName: string,
  brandColor: string,
): HTMLCanvasElement {
  if (logoType === "wordmark") {
    // A wide wordmark genuinely can't be a square favicon → clean initials.
    return monogramGlyph(initialsFrom(companyName), brandColor);
  }
  if (!cutoutOk) {
    // Background removal failed (gradient/textured bg). The mark itself is
    // still the icon for symbol-led types: use the real artwork (with its
    // background) rather than inventing an initials glyph that looks nothing
    // like the logo. Only icon+name needs the separable icon, which we can't
    // isolate without transparency, so it falls back to initials.
    return logoType === "icon-name"
      ? monogramGlyph(initialsFrom(companyName), brandColor)
      : transFull;
  }
  if (logoType === "icon-name")
    return extractIconRegion(transFull) ?? transFull;
  // icon / abstract / emblem / monogram → the mark itself is the icon.
  return transFull;
}

/**
 * A small representative preview (PNG data URL) for each brand-kit category,
 * rendered from the user's own logo. Shown in the pre-build selector so people
 * see what each category looks like before choosing to spend on the AI ones.
 */
export async function categoryPreviews(
  img: HTMLImageElement,
  transparent: HTMLCanvasElement,
  ctx: { logoType: string; companyName: string; brandColor: string },
): Promise<Record<string, string>> {
  const { logoType, companyName, brandColor } = ctx;
  const cutoutOk = transparentFraction(transparent) > 0.06;
  const transFull = cropToContent(transparent, 0.02);
  const full: HTMLImageElement | HTMLCanvasElement = cutoutOk ? transFull : img;
  const markGlyph = iconMark(
    transFull,
    cutoutOk,
    logoType,
    companyName,
    brandColor,
  );
  // Ink polarity: a light logo would vanish on a white card, a dark one on the
  // near-black card, so each preview's backdrop flips to keep the mark legible.
  const ink = inkStats(transFull);
  const lightInk = cutoutOk && ink.luma > INK_LIGHT;
  const darkInk = cutoutOk && ink.luma < INK_DARK;
  // Same partial-dark-ink reading the builders use, so the previews show the
  // exact treatment the real assets will get.
  const darkFrac = cutoutOk ? darkInkFraction(transFull) : 0;
  const reversed =
    cutoutOk && !lightInk && darkFrac > 0.1 ? reverseForDark(transFull) : null;
  const markLight = inkStats(markGlyph).luma > INK_LIGHT;
  const u = (c: HTMLCanvasElement) => c.toDataURL("image/png");
  const W = 320;
  const H = 240;
  // Center-crop a square merch plate composite into the 4:3 preview tile.
  const merchPreview = (sq: HTMLCanvasElement) => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const srcH = (sq.width * H) / W;
    c.getContext("2d")!.drawImage(
      sq,
      0,
      (sq.height - srcH) / 2,
      sq.width,
      srcH,
      0,
      0,
      W,
      H,
    );
    return u(c);
  };
  const plan = merchPrintPlan(img, transFull, cutoutOk, lightInk);
  const tee = MERCH_PLATES[0];
  return {
    "Logo variants": u(
      scaleOnto(
        darkInk ? full : (reversed ?? full),
        W,
        H,
        darkInk ? LIGHT_SURFACE : DARK_SURFACE,
        0.18,
      ),
    ),
    "Icons & favicons": u(
      tileWith(
        markGlyph,
        240,
        markLight ? toneAt(brandColor, 0.22) : shade(brandColor, 0.9),
        0.2,
        0.24,
      ),
    ),
    "Web & social": cutoutOk
      ? u(
          onGradient(
            reversed ?? full,
            W,
            H,
            lightInk || reversed ? toneAt(brandColor, 0.3) : brandColor,
            0.44,
            0.5,
            0.5,
          ),
        )
      : u(onSolid(full, W, H, "#ffffff", 0.42)),
    Merch: merchPreview(
      await merchComposite(
        plan.logo,
        plan.onDark ? tee.dark : tee.light,
        plan.onDark,
      ),
    ),
  };
}

export function deterministicAssetSpecs(
  img: HTMLImageElement,
  transparent: HTMLCanvasElement,
  ctx: DeterministicCtx,
): AssetSpec[] {
  const png = (canvas: HTMLCanvasElement) => () => canvasToBlob(canvas);
  const { logoType, companyName, brandColor } = ctx;

  const cutoutOk = transparentFraction(transparent) > 0.06;
  const transFull = cropToContent(transparent, 0.02);
  // What to use when compositing the *full* logo into scenes.
  const fullForComposite: HTMLImageElement | HTMLCanvasElement = cutoutOk
    ? transFull
    : img;

  // The icon/favicon mark: the logo's own icon when it has one (a combination
  // mark's isolated symbol included), and a monogram only when there's genuinely
  // no usable symbol (pure wordmark / fused mark / un-removable background).
  const markGlyph = iconMark(
    transFull,
    cutoutOk,
    logoType,
    companyName,
    brandColor,
  );

  // Ink polarity (measured on the cutout): drives every backdrop choice below
  // so the logo reads whether it's dark, light, or colored. `monoInk` gates the
  // recolor paths, so a colorful mark is never flattened to a silhouette.
  const ink = inkStats(transFull);
  const lightInk = cutoutOk && ink.luma > INK_LIGHT;
  const darkInk = cutoutOk && ink.luma < INK_DARK;
  const monoInk = ink.chroma < INK_MONO_CHROMA;
  // A logo can pass the mean-luma check yet still carry a chunk of near-black
  // ink (dark lettering beside a colored icon). That part is illegible on any
  // dark or brand-toned surface, so those surfaces get the reversed form.
  const darkFrac = cutoutOk ? darkInkFraction(transFull) : 0;
  const reversed =
    cutoutOk && !lightInk && darkFrac > 0.1 ? reverseForDark(transFull) : null;
  // The icon/favicon mark can differ from the whole logo (e.g. an isolated
  // symbol), so measure it on its own to tone the tile behind it.
  const markLight = inkStats(markGlyph).luma > INK_LIGHT;

  // Tile behind the icon/app-icon/avatar: a light tint normally, but a deep
  // brand tone when the mark is light (else a white mark vanishes on white).
  const tileBg = markLight ? toneAt(brandColor, 0.22) : shade(brandColor, 0.9);
  const appTile = tileWith(markGlyph, 1024, tileBg, 0.18, 0.22);

  // Composite the full logo on a brand gradient, or clean white if no cutout.
  // Light logos and reversed logos (white lettering) both need a deepened
  // gradient so they don't wash out on a pale one.
  const gradientHex =
    lightInk || reversed ? toneAt(brandColor, 0.3) : brandColor;
  const composite = (
    w: number,
    h: number,
    maxFrac: number,
    cx = 0.5,
    cy = 0.5,
  ) =>
    cutoutOk
      ? onGradient(
          reversed ?? fullForComposite,
          w,
          h,
          gradientHex,
          maxFrac,
          cx,
          cy,
        )
      : onSolid(fullForComposite, w, h, "#ffffff", maxFrac);

  // ── Logo variants ──────────────────────────────────────
  // Deliberately condensed to the three files people actually reach for
  // (plus the auto-traced SVG the hook appends): transparent for overlaying
  // anywhere, and the on-light / on-dark pair that always reads. The old
  // original + monochrome pair were filler that diluted the kit.
  const variants: AssetSpec[] = [];
  if (cutoutOk) {
    variants.push(
      {
        group: "Logo variants",
        name: "Transparent",
        filename: "variants/logo-transparent.png",
        build: png(scaleOnto(transFull, 1024, 1024, null, 0.04)),
      },
      {
        group: "Logo variants",
        name: "On light",
        filename: "variants/logo-on-light.png",
        // A monochrome light logo would vanish on white, so present it in its
        // dark form (the reversed pair you'd actually use on a light surface).
        build: png(
          scaleOnto(
            lightInk && monoInk
              ? recolor(transFull, DARK_SURFACE, true)
              : transFull,
            1024,
            1024,
            LIGHT_SURFACE,
            0.14,
          ),
        ),
      },
      {
        group: "Logo variants",
        name: "On dark",
        filename: "variants/logo-on-dark.png",
        // A monochrome dark logo would vanish on near-black, so it flips to its
        // white form; a mixed logo gets its dark ink reversed to white.
        build: png(
          scaleOnto(
            darkInk && monoInk
              ? recolor(transFull, LIGHT_SURFACE, true)
              : (reversed ?? transFull),
            1024,
            1024,
            DARK_SURFACE,
            0.14,
          ),
        ),
      },
    );
  } else {
    // The border flood fill couldn't key this background (gradient / texture).
    // Ship the real artwork on light, plus a white form from a plain global
    // color key (tolerates non-flat backgrounds) so dark surfaces stay usable.
    variants.push({
      group: "Logo variants",
      name: "On light",
      filename: "variants/logo-on-light.png",
      build: png(scaleOnto(img, 1024, 1024, "#ffffff", 0.14)),
    });
    const keyed = globalKeyCutout(img);
    if (keyed) {
      const keyedCrop = cropToContent(keyed, 0.02);
      variants.push({
        group: "Logo variants",
        name: "On dark",
        filename: "variants/logo-on-dark.png",
        build: png(
          scaleOnto(
            recolor(keyedCrop, "#ffffff", true),
            1024,
            1024,
            DARK_SURFACE,
            0.14,
          ),
        ),
      });
    }
  }

  // ── Icons & favicons ───────────────────────────────────
  // Two files only: the 1024 app icon (every store / PWA pipeline resizes
  // from one big square) and a ready-to-drop favicon. The old six-size set
  // was zip padding nobody asked for.
  const icons: AssetSpec[] = [
    {
      group: "Icons & favicons",
      name: "App icon",
      filename: "icons/app-icon-1024.png",
      build: png(appTile),
    },
    {
      group: "Icons & favicons",
      name: "Favicon",
      filename: "icons/favicon-32.png",
      build: png(scaleOnto(appTile, 32, 32, null, 0)),
    },
  ];

  // ── Web & social ───────────────────────────────────────
  const social: AssetSpec[] = [
    {
      group: "Web & social",
      name: "Avatar",
      filename: "social/avatar-512.png",
      build: png(tileWith(markGlyph, 512, tileBg, 0.22, 0)),
    },
    {
      group: "Web & social",
      name: "Open Graph",
      filename: "social/og-1200x630.png",
      build: png(
        onSolid(
          fullForComposite,
          1200,
          630,
          // Pale brand card normally; a deep brand card holds a light logo.
          lightInk ? toneAt(brandColor, 0.2) : shade(brandColor, 0.93),
          0.46,
        ),
      ),
    },
    {
      group: "Web & social",
      name: "Social banner",
      filename: "social/banner-1500x500.png",
      build: png(composite(1500, 500, 0.52, 0.26, 0.5)),
    },
  ];

  const merch = merchMockups(img, transFull, cutoutOk, lightInk);
  return [...merch, ...variants, ...social, ...icons];
}

type Drawable = HTMLImageElement | HTMLCanvasElement;

// ── Merch mockups (real photo plates, deterministic composites) ──────────
// Photoreal blank-product photography shipped with the app (public/merch/*,
// one light and one dark colorway per product, generated once with FLUX and
// hand-picked). The print happens on-device: ink multiplies onto the light
// plates and screens onto the dark ones, so fabric weave and ceramic shading
// show through the artwork exactly like a real transfer. These replaced the
// AI tee/tote/mug renders, which kept coming back looking fake; they're also
// free and instant, so merch no longer costs AI credits.

type MerchBox = { cx: number; cy: number; w: number; h: number };
type MerchColorway = { src: string; box: MerchBox };
type MerchPlate = {
  name: string;
  filename: string;
  light: MerchColorway;
  dark: MerchColorway;
  /** Cylinder half-angle (radians): wraps the print around the mug. */
  wrap?: number;
};

// Print boxes are fractions of the plate, hand-tuned against the photos.
const MERCH_PLATES: MerchPlate[] = [
  {
    name: "T-shirt",
    filename: "merch/tshirt.png",
    light: {
      src: "/merch/tee-light.webp",
      box: { cx: 0.5, cy: 0.43, w: 0.24, h: 0.2 },
    },
    dark: {
      src: "/merch/tee-dark.webp",
      box: { cx: 0.5, cy: 0.44, w: 0.24, h: 0.2 },
    },
  },
  {
    name: "Coffee mug",
    filename: "merch/mug.png",
    light: {
      src: "/merch/mug-light.webp",
      box: { cx: 0.47, cy: 0.54, w: 0.28, h: 0.2 },
    },
    dark: {
      src: "/merch/mug-dark.webp",
      box: { cx: 0.48, cy: 0.53, w: 0.26, h: 0.2 },
    },
    wrap: 0.55,
  },
  {
    name: "Tote bag",
    filename: "merch/tote-bag.png",
    light: {
      src: "/merch/tote-light.webp",
      box: { cx: 0.5, cy: 0.62, w: 0.26, h: 0.22 },
    },
    dark: {
      src: "/merch/tote-dark.webp",
      box: { cx: 0.5, cy: 0.64, w: 0.26, h: 0.22 },
    },
  },
];

/** Mean luma of the raster's four corners: the backdrop tone when there's no cutout. */
function backdropLuma(img: HTMLImageElement): number {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const bctx = c.getContext("2d")!;
  bctx.drawImage(img, 0, 0, 8, 8);
  const d = bctx.getImageData(0, 0, 8, 8).data;
  const at = (x: number, y: number) => {
    const i = (y * 8 + x) * 4;
    return (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255;
  };
  return (at(0, 0) + at(7, 0) + at(0, 7) + at(7, 7)) / 4;
}

/**
 * Level the raster so its backdrop keys away under the print blend: scaled to
 * pure white for multiply, floored to pure black for screen. Without this, a
 * warm off-white (or near-black) background prints as a faint box on the
 * product. Only needed when the background couldn't be cut out.
 */
function normalizeForPrint(
  img: HTMLImageElement,
  screenBlend: boolean,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const w = (c.width = img.naturalWidth || img.width);
  const h = (c.height = img.naturalHeight || img.height);
  const nctx = c.getContext("2d")!;
  nctx.drawImage(img, 0, 0);
  const data = nctx.getImageData(0, 0, w, h);
  const px = data.data;
  const corner = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const cs = [
    corner(2, 2),
    corner(w - 3, 2),
    corner(2, h - 3),
    corner(w - 3, h - 3),
  ];
  const bg = [0, 1, 2].map(
    (ch) => cs.reduce((s, cc) => s + cc[ch], 0) / cs.length,
  );
  for (let i = 0; i < px.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const v = px[i + ch];
      px[i + ch] = screenBlend
        ? Math.max(0, ((v - bg[ch]) * 255) / Math.max(1, 255 - bg[ch]))
        : Math.min(255, (v * 255) / Math.max(8, bg[ch]));
    }
  }
  nctx.putImageData(data, 0, 0);
  return c;
}

/** Composite the logo onto one plate photo; returns the plate-sized canvas. */
async function merchComposite(
  logo: Drawable,
  colorway: MerchColorway,
  screenBlend: boolean,
  wrap?: number,
): Promise<HTMLCanvasElement> {
  const photo = await loadImage(colorway.src);
  const W = photo.naturalWidth || photo.width;
  const H = photo.naturalHeight || photo.height;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(photo, 0, 0, W, H);

  // Flatten the print into one buffer first, so warp and blend apply to a
  // single bitmap instead of per-source-pixel surprises.
  const box = colorway.box;
  const bw = box.w * W;
  const bh = box.h * H;
  const sw = (logo as HTMLImageElement).naturalWidth || logo.width;
  const sh = (logo as HTMLImageElement).naturalHeight || logo.height;
  const sc = Math.min(bw / sw, bh / sh);
  const dw = Math.max(1, Math.round(sw * sc));
  const dh = Math.max(1, Math.round(sh * sc));
  const buf = document.createElement("canvas");
  buf.width = dw;
  buf.height = dh;
  const bctx = buf.getContext("2d")!;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(logo, 0, 0, dw, dh);

  const cx = box.cx * W;
  const cy = box.cy * H;
  ctx.save();
  // Screen keys a dark backdrop away and lets light ink sit on the dark
  // products; multiply keys white away and soaks dark ink into the light
  // ones. Either way the product's own texture shows through the print.
  ctx.globalCompositeOperation = screenBlend ? "screen" : "multiply";
  if (wrap) {
    // Cylindrical wrap: vertical strips of the print land on the arc of the
    // mug face, compressing toward the seams like a real wrapped transfer.
    const R = dw / (2 * Math.sin(wrap));
    const strips = 64;
    for (let i = 0; i < strips; i++) {
      const u0 = i / strips;
      const u1 = (i + 1) / strips;
      const mid = ((u0 + u1) / 2 - 0.5) * 2 * wrap;
      const x0 = cx + R * Math.sin((u0 - 0.5) * 2 * wrap);
      const x1 = cx + R * Math.sin((u1 - 0.5) * 2 * wrap);
      // Columns tip away from the camera near the seams; a slight fade sells
      // the turn without geometry the photo doesn't have.
      ctx.globalAlpha = 0.95 * (0.72 + 0.28 * Math.cos(mid));
      ctx.drawImage(
        buf,
        (u0 * dw) | 0,
        0,
        Math.max(1, dw / strips),
        dh,
        x0,
        cy - dh / 2,
        Math.max(1, x1 - x0 + 0.7),
        dh,
      );
    }
  } else {
    ctx.globalAlpha = 0.95;
    ctx.drawImage(buf, cx - dw / 2, cy - dh / 2, dw, dh);
  }
  ctx.restore();
  return c;
}

/** Which artwork prints, and on which colorway. Shared by assets + preview. */
function merchPrintPlan(
  img: HTMLImageElement,
  transFull: HTMLCanvasElement,
  cutoutOk: boolean,
  lightInk: boolean,
): { logo: Drawable; onDark: boolean } {
  // Light artwork goes on the dark products (a white logo on a white tee
  // reads as nothing). Without a cutout, judge by the raster's own backdrop:
  // a dark backdrop means light artwork, so it lands on the dark colorway
  // where screen-blending keys that backdrop away.
  const onDark = cutoutOk ? lightInk : backdropLuma(img) < 0.5;
  const logo: Drawable = cutoutOk ? transFull : normalizeForPrint(img, onDark);
  return { logo, onDark };
}

export function merchMockups(
  img: HTMLImageElement,
  transFull: HTMLCanvasElement,
  cutoutOk: boolean,
  lightInk: boolean,
): AssetSpec[] {
  const { logo, onDark } = merchPrintPlan(img, transFull, cutoutOk, lightInk);
  return MERCH_PLATES.map((p) => ({
    group: "Merch",
    name: p.name,
    filename: p.filename,
    build: async () =>
      canvasToBlob(
        await merchComposite(logo, onDark ? p.dark : p.light, onDark, p.wrap),
      ),
  }));
}

export function paletteFiles(palette: string[]): { css: string; json: string } {
  const css =
    ":root {\n" +
    palette.map((hex, i) => `  --brand-${i + 1}: ${hex};`).join("\n") +
    "\n}\n";
  const json = JSON.stringify(
    palette.reduce<Record<string, string>>((acc, hex, i) => {
      acc[`brand-${i + 1}`] = hex;
      return acc;
    }, {}),
    null,
    2,
  );
  return { css, json };
}

export function readme(companyName: string, palette: string[]): string {
  const name = companyName || "Your logo";
  return `${name}: brand kit\nGenerated with LogoCreator.\n\nFOLDERS\n  variants/   transparent, on-light, on-dark + logo.svg (auto-traced vector)\n  merch/      your logo on real product photos (t-shirt, mug, tote) + AI business card & signage shots\n  social/     avatar, Open Graph card, social banner\n  icons/      app-icon-1024 + favicon-32\n  brand-colors.css / .json with the extracted palette: ${palette.join(", ")}\n  style-guide.pdf  printable brand guidelines: logo, clear space, color, type\n\nQUICK USE\n  - Favicon:   icons/favicon-32.png\n  - App/PWA:   icons/app-icon-1024.png (resize as needed)\n  - Link card: social/og-1200x630.png\n  - Header:    social/banner-1500x500.png\n  - Merch:     merch/ (ready-to-share product visuals)\n`;
}

export async function zipFiles(
  files: { path: string; data: Blob | string }[],
): Promise<Blob> {
  // Lazy-loaded: jszip (~880KB) is only needed when downloading a brand kit.
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.data);
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "logo"
  );
}

/** Image-to-image edit via /api/edit-logo (FLUX.2-pro). Returns a PNG blob. */
export async function editLogo(
  apiKey: string,
  image: string,
  prompt: string,
  width: number,
  height: number,
): Promise<Blob> {
  // Together's edit model is occasionally flaky (500/429): retry transient
  // failures a couple of times with backoff so a single hiccup doesn't leave a
  // permanently-failed brand-kit tile. Each attempt has its own timeout.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 100_000);
    try {
      const res = await fetch("/api/edit-logo", {
        method: "POST",
        body: JSON.stringify({
          userAPIKey: apiKey,
          image,
          prompt,
          width,
          height,
        }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const json = await res.json();
        const resp = await fetch(`data:image/png;base64,${json.b64_json}`);
        return resp.blob();
      }
      // 4xx other than rate-limit won't fix itself. Stop retrying.
      if (res.status < 500 && res.status !== 429)
        throw new Error("edit failed");
      lastErr = new Error(`status ${res.status}`);
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 2)
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw lastErr ?? new Error("edit failed");
}

/**
 * AI product mockups (FLUX.2-pro edits). Only real-world product shots are AI;
 * everything else (variants, icons, social, backgrounds, patterns) is built
 * deterministically on canvas for perfect logo fidelity. Each prompt makes the
 * *object* the subject and the logo a small/medium applied print, with explicit
 * size + a strict fidelity guard, so the logo is never enlarged, redrawn, or
 * boxed in a rectangle (the old prompts made the logo the subject → huge,
 * distorted results). Validated empirically across logo types.
 */
export function aiAssetSpecs(
  apiKey: string,
  image: string,
  lightInk = false,
): AssetSpec[] {
  // Reproduce-exactly + treat-background-as-transparent guard, appended to each.
  const FID =
    "Treat the logo's plain background as transparent: print only the colored logo artwork itself, never a white or colored rectangle behind it. Reproduce the logo exactly: same colors, shapes, spacing and proportions; do not enlarge it disproportionately, crop it, redraw it, or add any extra text.";

  // Product surfaces flip dark for a light logo so the print is visible (a
  // white logo on a bright white card reads as nothing).
  const card = lightInk ? "matte charcoal" : "bright white";
  const wall = lightInk ? "dark matte charcoal" : "light matte concrete";

  // These two live in the same "Merch" group as the deterministic photo-plate
  // prints (tee / mug / tote), listed after them; `ai` marks them as the only
  // metered renders in the kit.
  const mk = (
    name: string,
    filename: string,
    prompt: string,
    w = 1024,
    h = 1024,
  ): AssetSpec => ({
    group: "Merch",
    name,
    filename,
    ai: true,
    build: () => editLogo(apiKey, image, `${prompt} ${FID}`, w, h),
  });

  return [
    mk(
      "Business card",
      "merch/business-card.png",
      `Top-down photo of two ${card} standard landscape rectangular business cards (3.5 by 2 inch proportions, clearly wider than tall) on a soft neutral surface, one slightly overlapping the other. The top card shows the provided logo centered, occupying about 55% of the card width. Minimal elegant studio lighting.`,
      1344,
      768,
    ),
    mk(
      "Signage",
      "merch/signage.png",
      `Photorealistic architectural photo of the provided logo as clean dimensional signage mounted on a modern ${wall} wall beside a glass entrance, in soft daytime light. The logo sits in the left-center at a realistic, moderate size.`,
      1344,
      768,
    ),
  ];
}
