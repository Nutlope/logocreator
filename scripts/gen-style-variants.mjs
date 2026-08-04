// Generate EXTRA style-picker frames so each style can cycle through several
// different logos on hover. Same styles as gen-style-thumbnails.mjs, but with
// new subjects (mountain, rocket) so the picker shows the style applied to
// visibly different marks. Knocks white → transparent. Run normalize after.
//
//   node scripts/gen-style-variants.mjs            # all styles, all subjects
//   node scripts/gen-style-variants.mjs minimal    # just one style
//
// Requires TOGETHER_API_KEY in .env.local. Writes public/styles/<key>-<n>.png.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import Together from "together-ai";

const env = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";
const KEY = (env.match(/^TOGETHER_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) {
  console.error("✗ No TOGETHER_API_KEY found in .env.local");
  process.exit(1);
}

// Hover frames: the same subjects rendered in every style so the picker shows
// the style applied to visibly different marks (frames 1-4).
const SUBJECTS = [
  { n: 1, subject: "a mountain peak" },
  { n: 2, subject: "a rocket" },
  { n: 3, subject: "a bird in flight" },
  { n: 4, subject: "a water droplet" },
];

// Our own brand mark, rendered per style → becomes the new resting thumbnail
// (<key>-logo.png), replacing the fox at frame 0.
const LOGO_SUBJECT =
  "an abstract app icon of two overlapping rounded-corner squares with a small four-pointed sparkle star centered in the front square";

// Per-style prompt, parameterized by subject (mirrors gen-style-thumbnails.mjs).
const STYLE_PROMPT = {
  minimal: (s) =>
    `a minimal ${s} logo in a bold vivid indigo-blue, two simple geometric shapes, generous negative space, single flat saturated color (never white or grey)`,
  geometric: (s) =>
    `a geometric ${s} logo built from precise angular polygons, two-tone, sharp clean edges, grid-aligned`,
  gradient: (s) =>
    `a ${s} logo filled with a smooth modern mesh gradient blending vibrant colors, fluid soft shapes`,
  mascot: (s) =>
    `a cute friendly ${s} mascot character logo, rounded shapes, expressive, bold colors, flat cartoon`,
  "hand-drawn": (s) =>
    `a hand-drawn organic ${s} logo, sketchy ink linework, warm earthy colors, natural imperfect strokes`,
  luxury: (s) =>
    `an elegant luxury ${s} logo, a refined solid emblem in deep emerald green with metallic gold linework accents, sophisticated and premium`,
  retro: (s) =>
    `a retro vintage ${s} logo inside a circular badge, 70s heritage style, warm muted color palette`,
  "3d": (s) =>
    `a modern 3D ${s} logo in a vivid indigo-blue, soft depth, gentle lighting and shadows, smooth dimensional finish (never plain white or grey)`,
};

const client = new Together({ apiKey: KEY, maxRetries: 6, timeout: 240000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = path.join("public", "styles");
fs.mkdirSync(outDir, { recursive: true });

/** Flood-fill near-white pixels inward from the edges → transparent. */
function knockoutWhite(png, threshold = 236) {
  const { width, height, data } = png;
  const visited = new Uint8Array(width * height);
  const stack = [];
  const isWhite = (p) =>
    data[p * 4] >= threshold &&
    data[p * 4 + 1] >= threshold &&
    data[p * 4 + 2] >= threshold;
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (isWhite(p)) {
      data[p * 4 + 3] = 0;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    visit(0, y);
    visit(width - 1, y);
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    const y = (p / width) | 0;
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }
  return png;
}

const only = process.argv.slice(2);
const keys = Object.keys(STYLE_PROMPT).filter(
  (k) => !only.length || only.includes(k),
);
const CONCURRENCY = Number(process.env.CONCURRENCY || 2);

// Build the work list, skipping any frame that already exists (resumable).
const jobs = [];
for (const key of keys) {
  // Our brand mark in this style → the new resting frame.
  const logoOut = path.join(outDir, `${key}-logo.png`);
  if (fs.existsSync(logoOut)) {
    console.log(`• ${key}-logo … skip (exists)`);
  } else {
    jobs.push({ key, n: "logo", subject: LOGO_SUBJECT, out: logoOut });
  }
  for (const { n, subject } of SUBJECTS) {
    const out = path.join(outDir, `${key}-${n}.png`);
    if (fs.existsSync(out)) {
      console.log(`• ${key}-${n} … skip (exists)`);
      continue;
    }
    jobs.push({ key, n, subject, out });
  }
}

async function genOne({ key, n, subject, out }) {
  const t0 = Date.now();
  const ATTEMPTS = 5;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await client.images.generate({
        model: "black-forest-labs/FLUX.2-pro",
        prompt: `${STYLE_PROMPT[key](subject)}. A single clean, centered logo mark, no text or lettering, on a plain solid white background.`,
        width: 768,
        height: 768,
        response_format: "base64",
        output_format: "png",
      });
      const png = knockoutWhite(
        PNG.sync.read(Buffer.from(res.data[0].b64_json, "base64")),
      );
      fs.writeFileSync(out, PNG.sync.write(png));
      console.log(`✓ ${key}-${n} done (${((Date.now() - t0) / 1000) | 0}s)`);
      return;
    } catch (err) {
      const msg = String(err?.message || err).slice(0, 80);
      if (attempt === ATTEMPTS) {
        console.log(`✗ ${key}-${n} FAILED after ${ATTEMPTS}: ${msg}`);
        return;
      }
      // Exponential back-off with jitter (4s, 9s, 16s, 25s …): eases 429s.
      const wait = attempt * attempt * 1000 + Math.floor(Math.random() * 2000);
      console.log(`… ${key}-${n} retry ${attempt} in ${(wait / 1000) | 0}s (${msg})`);
      await sleep(wait);
    }
  }
}

// Concurrency pool.
let idx = 0;
async function worker() {
  while (idx < jobs.length) {
    await genOne(jobs[idx++]);
  }
}
console.log(`Generating ${jobs.length} frames, ${CONCURRENCY} at a time…`);
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker),
);

console.log("\n✓ Variant frames written to public/styles/");
