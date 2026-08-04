import { canvasToBlob, loadImage } from "./brand-kit";

/**
 * Vectorize a (flat, limited-color) raster logo to an SVG string by tracing it
 * on-device with imagetracerjs. Tuned for clean logo art: a small color count,
 * speckle removal, fills-only (no strokes), and a light blur to tame the JPEG/AA
 * edges. This is an auto-trace, not a hand-redraw: good enough for scalable
 * exports of these flat marks.
 */
const LOGO_TRACE_OPTS = {
  numberofcolors: 10,
  colorquantcycles: 3,
  mincolorratio: 0,
  pathomit: 24, // drop tiny paths, kills background speckle
  ltres: 1,
  qtres: 1,
  strokewidth: 0,
  linefilter: true,
  roundcoords: 2,
  blurradius: 2,
  blurdelta: 20,
  // Emit `<svg viewBox="0 0 w h">` with NO fixed width/height so the export
  // actually scales into a favicon slot, a CSS-sized <img>, or a print sheet.
  viewbox: true,
};

/**
 * Flatten a near-uniform background to one exact color before tracing. FLUX
 * outputs a "white" background that's actually full of faint noise, which the
 * tracer would otherwise turn into hundreds of tiny speckle paths. Snapping
 * every pixel within tolerance of the corner-sampled background to that single
 * color collapses it into one clean region.
 */
function flattenBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  // Sample only OPAQUE corners: a transparent corner's RGB is usually (0,0,0)
  // and would drag the reference toward black. The caller fills white first,
  // so this is belt-and-braces, but the shared pattern must stay alpha-aware
  // (the alpha-blind version of this is exactly what broke makeTransparent).
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
  if (nc === 0) return; // nothing opaque to key against
  br = Math.round(br / nc);
  bg = Math.round(bg / nc);
  bb = Math.round(bb / nc);
  const tol = 60 * 3; // generous: noisy "white" varies a fair bit
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 24) {
      // transparent → treat as the flat background too
      d[i] = br;
      d[i + 1] = bg;
      d[i + 2] = bb;
      d[i + 3] = 255;
      continue;
    }
    const dist =
      Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
    if (dist < tol) {
      d[i] = br;
      d[i + 1] = bg;
      d[i + 2] = bb;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * For key-out tracing: a chroma key the artwork itself doesn't use, so the
 * background layer can be stripped from the traced SVG without ever touching
 * an ink color. Sampled against the actual pixels; the candidate furthest
 * from every color in the artwork wins.
 */
function pickKeyColor(
  d: Uint8ClampedArray,
  w: number,
  h: number,
): [number, number, number] {
  const candidates: [number, number, number][] = [
    [255, 0, 255],
    [0, 255, 0],
    [0, 255, 255],
    [255, 128, 0],
  ];
  let best = candidates[0];
  let bestScore = -1;
  for (const cand of candidates) {
    let minDist = Infinity;
    for (let p = 0; p < w * h; p += 7) {
      if (d[p * 4 + 3] < 24) continue; // transparent: not artwork
      const dist =
        Math.abs(d[p * 4] - cand[0]) +
        Math.abs(d[p * 4 + 1] - cand[1]) +
        Math.abs(d[p * 4 + 2] - cand[2]);
      if (dist < minDist) minDist = dist;
    }
    if (minDist > bestScore) {
      bestScore = minDist;
      best = cand;
    }
  }
  return best;
}

export async function logoToSvgString(
  src: string,
  opts: { keyOut?: boolean } = {},
): Promise<string> {
  // Lazy-loaded: imagetracerjs is ~3.2MB and only needed on an SVG export click,
  // so it stays out of the first-load bundle.
  const { default: ImageTracer } = await import("imagetracerjs");
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");

  let key: [number, number, number] | null = null;
  if (opts.keyOut) {
    // Transparent-input path (the brand kit's cutout): flatten onto a chroma
    // key instead of white, trace, then strip the key-colored layers so the
    // SVG ships with a genuinely transparent background and real counter
    // holes instead of a baked backdrop.
    ctx.drawImage(img, 0, 0, w, h);
    const raw = ctx.getImageData(0, 0, w, h);
    key = pickKeyColor(raw.data, w, h);
    // Hard-edge the alpha so anti-aliased half-pixels don't blend with the
    // key and leave a tinted fringe for the tracer to keep.
    const rd = raw.data;
    for (let i = 3; i < rd.length; i += 4) rd[i] = rd[i] < 140 ? 0 : 255;
    ctx.putImageData(raw, 0, 0);
    const flat = document.createElement("canvas");
    flat.width = w;
    flat.height = h;
    const fctx = flat.getContext("2d", { willReadFrequently: true })!;
    fctx.fillStyle = `rgb(${key[0]},${key[1]},${key[2]})`;
    fctx.fillRect(0, 0, w, h);
    fctx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(flat, 0, 0);
  } else {
    // Opaque white base so transparent inputs flatten cleanly.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
  }
  flattenBackground(ctx, w, h);
  const imgdata = ctx.getImageData(0, 0, w, h);
  let svg: string = ImageTracer.imagedataToSVG(imgdata, LOGO_TRACE_OPTS);
  if (key) {
    const [kr, kg, kb] = key;
    svg = svg.replace(/<path\b[^>]*\/>/g, (tag) => {
      const m = tag.match(/fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"/);
      if (!m) return tag;
      const dist =
        Math.abs(+m[1] - kr) + Math.abs(+m[2] - kg) + Math.abs(+m[3] - kb);
      return dist < 96 ? "" : tag;
    });
  }
  return svg;
}

export async function logoToSvgBlob(
  src: string,
  opts: { keyOut?: boolean } = {},
): Promise<Blob> {
  const svg = await logoToSvgString(src, opts);
  return new Blob([svg], { type: "image/svg+xml" });
}

/**
 * Rasterize the (vectorized) logo to a clean square PNG at an arbitrary size.
 * Tracing to SVG first means 2048/4096 come out genuinely sharp for these flat
 * marks instead of an upscaled blur. The traced SVG is viewBox-only so it
 * scales in the DOM, but canvas rasterization needs explicit intrinsic
 * dimensions or some browsers draw nothing - so we inject width/height = size.
 */
export async function logoToHiResPngBlob(
  src: string,
  size: number,
): Promise<Blob> {
  const svg = (await logoToSvgString(src)).replace(
    /<svg([^>]*?)>/,
    (_m, attrs: string) =>
      `<svg${attrs.replace(
        /\s(?:width|height)="[^"]*"/g,
        "",
      )} width="${size}" height="${size}">`,
  );
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  return canvasToBlob(canvas);
}
