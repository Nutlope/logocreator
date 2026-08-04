// Knock out each showcase logo's baked-in background so every tile of the
// welcome wall sits on the SAME card surface instead of 32 slightly
// different rectangles. Works like the style-thumbnail knockout, but keyed
// to whatever backdrop the image actually has (median border color), so it
// handles the white, cream and near-black variants alike. White (or dark)
// INSIDE a mark survives: only pixels reachable from the border are removed.
//
//   node scripts/knockout-showcase.mjs            # all of public/showcase
//   node scripts/knockout-showcase.mjs vellum     # only files starting with…
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const dir = path.join("public", "showcase");
const only = process.argv.slice(2);
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".png"))
  .filter((f) => !only.length || only.some((s) => f.startsWith(s)));

function knockout(png) {
  const { width: w, height: h, data } = png;

  // The backdrop key: median border color (robust to a mark grazing an edge).
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const median = (ch) =>
    border.map((p) => data[p * 4 + ch]).sort((a, b) => a - b)[
      border.length >> 1
    ];
  const bg = [median(0), median(1), median(2)];
  const distBg = (p) =>
    Math.abs(data[p * 4] - bg[0]) +
    Math.abs(data[p * 4 + 1] - bg[1]) +
    Math.abs(data[p * 4 + 2] - bg[2]);

  // Seeds must sit close to the key; growth may drift further (soft vignettes
  // shift the backdrop tone toward the center) but only via small local
  // steps, so it never jumps across a mark's crisp edge.
  const SEED = 60;
  const DRIFT = 160;
  const STEP = 48;
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (const p of border) {
    if (!visited[p]) {
      visited[p] = 1;
      if (distBg(p) < SEED) {
        data[p * 4 + 3] = 0;
        stack.push(p);
      }
    }
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    for (const q of [p + 1, p - 1, p + w, p - w]) {
      if (q < 0 || q >= w * h) continue;
      if (Math.abs((q % w) - x) > 1) continue; // no row wrap
      if (visited[q]) continue;
      visited[q] = 1;
      const dLocal =
        Math.abs(data[q * 4] - data[p * 4]) +
        Math.abs(data[q * 4 + 1] - data[p * 4 + 1]) +
        Math.abs(data[q * 4 + 2] - data[p * 4 + 2]);
      if (dLocal < STEP && distBg(q) < DRIFT) {
        data[q * 4 + 3] = 0;
        stack.push(q);
      }
    }
  }
  return png;
}

let removedTotal = 0;
for (const f of files) {
  const fp = path.join(dir, f);
  const png = PNG.sync.read(fs.readFileSync(fp));
  knockout(png);
  let clear = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] === 0) clear++;
  const frac = clear / (png.width * png.height);
  removedTotal++;
  fs.writeFileSync(fp, PNG.sync.write(png));
  console.log(`• ${f}: ${(frac * 100).toFixed(0)}% backdrop removed`);
}
console.log(`done (${removedTotal} files)`);
