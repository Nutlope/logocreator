// Generate the welcome-modal showcase logos: ~32 FICTIONAL brands across all 8
// styles, as combination marks (icon + name) on white, so the diagonal carousel
// reads like a wall of real brand cards. No real brand names/marks (IP-safe).
//
//   node scripts/gen-showcase.mjs            # all, skips existing (resumable)
//   node scripts/gen-showcase.mjs cobalt     # just one slug
//   CONCURRENCY=3 node scripts/gen-showcase.mjs
//
// Requires TOGETHER_API_KEY in .env.local. Writes public/showcase/<slug>.png.
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

// Mirrors the app's own styleLookup phrasing (form, not color).
const STYLE = {
  Minimal:
    "Minimal and timeless: two or three simple geometric shapes with generous negative space, clean and flat.",
  Geometric:
    "Geometric and precise: built from angular polygonal shapes, grid-aligned with sharp, clean edges; modern and structured.",
  Gradient:
    "Sleek and contemporary: smooth gradient shading that flows across soft, fluid shapes for a dynamic, modern feel.",
  Mascot:
    "A friendly mascot character: rounded, expressive and approachable, built from bold, confident shapes.",
  "Hand-drawn":
    "Hand-drawn and organic: sketchy, natural linework with imperfect strokes and a human, crafted feel.",
  Luxury:
    "Elegant and luxurious: fine, thin monoline work, refined, minimal and premium.",
  Retro:
    "Retro and vintage: a classic heritage badge feel with nostalgic, time-worn detailing.",
  "3D": "Modern and dimensional: soft three-dimensional depth with gentle lighting and subtle shadows, smooth and polished.",
};

// 32 invented brands (4 per style), varied industries + colors.
const BRANDS = [
  // Minimal
  { slug: "tidewell", name: "Tidewell", industry: "wellness studio", style: "Minimal", color: "teal" },
  { slug: "northpeak", name: "Northpeak", industry: "outdoor gear", style: "Minimal", color: "slate blue" },
  { slug: "lumen", name: "Lumen", industry: "smart home", style: "Minimal", color: "amber" },
  { slug: "paperline", name: "Paperline", industry: "stationery", style: "Minimal", color: "black" },
  // Geometric
  { slug: "cobalt", name: "Cobalt", industry: "developer tools", style: "Geometric", color: "cobalt blue" },
  { slug: "axiom", name: "Axiom", industry: "fintech", style: "Geometric", color: "indigo" },
  { slug: "hexa", name: "Hexa", industry: "logistics", style: "Geometric", color: "orange" },
  { slug: "vertex", name: "Vertex", industry: "architecture firm", style: "Geometric", color: "charcoal" },
  // Gradient
  { slug: "halcyon", name: "Halcyon", industry: "banking app", style: "Gradient", color: "blue to violet" },
  { slug: "novastream", name: "Nova", industry: "music streaming", style: "Gradient", color: "pink to purple" },
  { slug: "auric", name: "Auric", industry: "crypto wallet", style: "Gradient", color: "gold to orange" },
  { slug: "prism", name: "Prism", industry: "design platform", style: "Gradient", color: "teal to magenta" },
  // Mascot
  { slug: "ferncrest", name: "Ferncrest", industry: "summer camp", style: "Mascot", color: "forest green" },
  { slug: "pawsome", name: "Pawsome", industry: "pet care", style: "Mascot", color: "orange" },
  { slug: "hootly", name: "Hootly", industry: "learning app", style: "Mascot", color: "purple" },
  { slug: "bramble", name: "Bramble", industry: "kids brand", style: "Mascot", color: "berry red" },
  // Hand-drawn
  { slug: "emberoak", name: "Ember & Oak", industry: "restaurant", style: "Hand-drawn", color: "terracotta" },
  { slug: "marigold", name: "Marigold", industry: "florist", style: "Hand-drawn", color: "coral" },
  { slug: "wildhoney", name: "Wildhoney", industry: "bakery", style: "Hand-drawn", color: "honey amber" },
  { slug: "saltwater", name: "Saltwater", industry: "surf brand", style: "Hand-drawn", color: "ocean blue" },
  // Luxury
  { slug: "vellum", name: "Vellum", industry: "publishing house", style: "Luxury", color: "gold on black" },
  { slug: "noirco", name: "Noir & Co", industry: "fashion label", style: "Luxury", color: "black and gold" },
  { slug: "aurelia", name: "Aurelia", industry: "fine jewelry", style: "Luxury", color: "champagne gold" },
  { slug: "monarch", name: "Monarch", industry: "boutique hotels", style: "Luxury", color: "deep navy and gold" },
  // Retro
  { slug: "sunsetdiner", name: "Sunset Diner", industry: "diner", style: "Retro", color: "orange and cream" },
  { slug: "riverside", name: "Riverside", industry: "coffee roasters", style: "Retro", color: "brown and cream" },
  { slug: "route9", name: "Route 9", industry: "motorcycles", style: "Retro", color: "red and cream" },
  { slug: "goldenrod", name: "Goldenrod", industry: "record label", style: "Retro", color: "mustard yellow" },
  // 3D
  { slug: "quanta", name: "Quanta", industry: "AI platform", style: "3D", color: "blue" },
  { slug: "volt", name: "Volt", industry: "EV charging", style: "3D", color: "green" },
  { slug: "orbital", name: "Orbital", industry: "space tech", style: "3D", color: "purple" },
  { slug: "cubeworks", name: "Cubeworks", industry: "game studio", style: "3D", color: "magenta" },
];

// DARK=1 generates a dark-mode variant (dark background + light text) into
// <slug>-dark.png, so the welcome-modal wall can match the theme.
const DARK = process.env.DARK === "1";

function buildPrompt(b) {
  if (DARK) {
    return `A professional, high-quality combination-mark logo for "${b.name}", a ${b.industry}. ${STYLE[b.style]} Use ${b.color} as the brand accent for the icon. The company name "${b.name}" set in clean, legible LIGHT typography (white or a light tint), paired with a distinctive original icon, centered with balanced composition on a plain solid very dark charcoal (#101010) background. Ensure strong contrast so every part is clearly visible on the dark background. No tagline, no extra text.`;
  }
  return `A professional, high-quality combination-mark logo for "${b.name}", a ${b.industry}. ${STYLE[b.style]} Use ${b.color} as the dominant brand color. The company name "${b.name}" set in clean, legible typography paired with a distinctive original icon, centered with balanced composition on a plain solid white background. No tagline, no extra text.`;
}

const client = new Together({ apiKey: KEY, maxRetries: 6, timeout: 240000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = path.join("public", "showcase");
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
const CONCURRENCY = Number(process.env.CONCURRENCY || 2);

const jobs = [];
for (const b of BRANDS) {
  if (only.length && !only.includes(b.slug)) continue;
  const out = path.join(outDir, `${b.slug}${DARK ? "-dark" : ""}.png`);
  if (fs.existsSync(out)) {
    console.log(`• ${b.slug} … skip (exists)`);
    continue;
  }
  jobs.push({ b, out });
}

async function genOne({ b, out }) {
  const t0 = Date.now();
  const ATTEMPTS = 5;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await client.images.generate({
        model: "black-forest-labs/FLUX.2-pro",
        prompt: buildPrompt(b),
        width: 768,
        height: 768,
        response_format: "base64",
        output_format: "png",
      });
      // Keep the white background (card look). Validate it decodes as PNG.
      const png = PNG.sync.read(Buffer.from(res.data[0].b64_json, "base64"));
      fs.writeFileSync(out, PNG.sync.write(png));
      console.log(`✓ ${b.slug} done (${((Date.now() - t0) / 1000) | 0}s)`);
      return;
    } catch (err) {
      const msg = String(err?.message || err).slice(0, 80);
      if (attempt === ATTEMPTS) {
        console.log(`✗ ${b.slug} FAILED after ${ATTEMPTS}: ${msg}`);
        return;
      }
      const wait = attempt * attempt * 1000 + Math.floor(Math.random() * 2000);
      console.log(`… ${b.slug} retry ${attempt} in ${(wait / 1000) | 0}s (${msg})`);
      await sleep(wait);
    }
  }
}

console.log(`Generating ${jobs.length} showcase logos, ${CONCURRENCY} at a time…`);
let idx = 0;
async function worker() {
  while (idx < jobs.length) {
    await genOne(jobs[idx++]);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
console.log("\n✓ Showcase logos written to public/showcase/");
