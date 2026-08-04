// Normalize the style thumbnails so every mark is the same size + centered.
// Trims each PNG to its content bounding box, scales the longest side to a
// uniform target, and re-centers on a transparent square. Run after generating.
//
//   node scripts/normalize-thumbnails.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = "public/styles";
const SIZE = 768;
const SCALE = 0.8; // the mark occupies ~80% of the square

// Pass specific filenames to normalize only those (e.g. the new variant
// frames); with no args, normalize every PNG in the directory.
const only = process.argv.slice(2).map((f) => path.basename(f));
const files = (only.length ? only : fs.readdirSync(dir)).filter((f) =>
  f.endsWith(".png"),
);

for (const f of files) {
  const input = path.join(dir, f);
  const tmp = input + ".tmp.png";

  // 1) trim the transparent border to the content bbox
  const trimmed = await sharp(input).trim({ threshold: 12 }).toBuffer();

  // 2) scale the longest side to SIZE*SCALE, keeping aspect + transparency
  const target = Math.round(SIZE * SCALE);
  const { data, info } = await sharp(trimmed)
    .resize(target, target, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer({ resolveWithObject: true });

  // 3) center on a SIZE×SIZE transparent square
  const left = Math.round((SIZE - info.width) / 2);
  const top = Math.round((SIZE - info.height) / 2);
  await sharp(data)
    .extend({
      top,
      bottom: SIZE - info.height - top,
      left,
      right: SIZE - info.width - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(tmp);

  fs.renameSync(tmp, input);
  console.log(`• ${f.padEnd(16)} ${info.width}×${info.height} → centered in ${SIZE}²`);
}

console.log("\n✓ Normalized", files.length, "thumbnails");
