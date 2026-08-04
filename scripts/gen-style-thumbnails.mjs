// Generate the 8 style-picker thumbnails via FLUX, then knock out the white
// background to transparent (so they sit on both light & dark themes).
//
//   node scripts/gen-style-thumbnails.mjs
//
// Requires TOGETHER_API_KEY in .env.local. Writes public/styles/<key>.png.
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

// A single, consistent subject so the thumbnails differ ONLY by style.
const SUBJECT = "a fox head";

const STYLES = [
  {
    key: "minimal",
    prompt: `a minimal ${SUBJECT} logo, two simple geometric shapes, generous negative space, single flat color`,
  },
  {
    key: "geometric",
    prompt: `a geometric ${SUBJECT} logo built from precise angular polygons, two-tone, sharp clean edges, grid-aligned`,
  },
  {
    key: "gradient",
    prompt: `a ${SUBJECT} logo filled with a smooth modern mesh gradient blending vibrant colors, fluid soft shapes`,
  },
  {
    key: "mascot",
    prompt: `a cute friendly ${SUBJECT} mascot character logo, rounded shapes, expressive, bold colors, flat cartoon`,
  },
  {
    key: "hand-drawn",
    prompt: `a hand-drawn organic ${SUBJECT} logo, sketchy ink linework, warm earthy colors, natural imperfect strokes`,
  },
  {
    key: "luxury",
    prompt: `an elegant luxury ${SUBJECT} logo, a refined solid fox emblem in deep emerald green with metallic gold linework accents, sophisticated and premium`,
  },
  {
    key: "retro",
    prompt: `a retro vintage ${SUBJECT} logo inside a circular badge, 70s heritage style, warm muted color palette`,
  },
  {
    key: "3d",
    prompt: `a modern 3D ${SUBJECT} logo with soft depth, gentle lighting and shadows, smooth dimensional finish`,
  },
];

const client = new Together({ apiKey: KEY });
const outDir = path.join("public", "styles");
fs.mkdirSync(outDir, { recursive: true });

/** Flood-fill near-white pixels inward from the image edges → transparent.
 *  Preserves white *inside* the mark (it isn't reachable from the border). */
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

// Optional: pass style keys as args to regenerate only those (e.g. `… luxury`).
const only = process.argv.slice(2);
const todo = only.length ? STYLES.filter((s) => only.includes(s.key)) : STYLES;

for (const style of todo) {
  process.stdout.write(`• ${style.key} … `);
  try {
    const body = {
      model: "black-forest-labs/FLUX.2-pro",
      prompt: `${style.prompt}. A single clean, centered logo mark, no text or lettering, on a plain solid white background.`,
      width: 768,
      height: 768,
      response_format: "base64",
      output_format: "png",
    };
    const res = await client.images.generate(body);
    const b64 = res.data[0].b64_json;
    const png = knockoutWhite(PNG.sync.read(Buffer.from(b64, "base64")));
    fs.writeFileSync(path.join(outDir, `${style.key}.png`), PNG.sync.write(png));
    console.log("done");
  } catch (err) {
    console.log("FAILED:", err?.message || err);
  }
}

console.log("\n✓ Thumbnails written to public/styles/");
