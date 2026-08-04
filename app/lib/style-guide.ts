import {
  bestTextColor,
  loadImage,
  pickBrandColor,
  toDataUrl,
} from "./brand-kit";
import type { GenParams } from "@/app/components/Gallery";

/**
 * Client-side brand style-guide PDF. Built from assets the brand kit already
 * holds in memory (the source logo + extracted palette + whichever variant
 * blobs were produced), so it adds no AI calls and ships inside the kit zip as
 * style-guide.pdf. jsPDF is lazy-imported on the download click, mirroring the
 * jszip/imagetracerjs pattern, so it stays out of the first-load bundle.
 *
 * Set in Helvetica (jsPDF built-in, zero font bytes): Satoshi is WOFF2-only and
 * jsPDF embeds TTF only, so a faithful Satoshi PDF would need an offline
 * conversion. A clean sans is the honest, lightweight choice for a mini guide.
 */

type GenLike = {
  companyName: string;
  name?: string;
  image: string;
  params: GenParams;
};

type ImgInfo = { dataUrl: string; w: number; h: number; fmt: "PNG" | "JPEG" };

// Page geometry (mm, A4 portrait) + a warm, quiet palette matching the app.
const W = 210;
const H = 297;
const M = 18;
const INK = "#15140f";
const MUTED = "#74726b";
const LINE = "#e5e4df";
const PAPER = "#faf9f6";
const DARK = "#0c0c0b";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read asset"));
    reader.readAsDataURL(blob);
  });
}

function fmtOf(dataUrl: string): "PNG" | "JPEG" {
  return /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
}

async function infoFromDataUrl(dataUrl: string): Promise<ImgInfo> {
  const img = await loadImage(dataUrl);
  return {
    dataUrl,
    w: img.naturalWidth || img.width,
    h: img.naturalHeight || img.height,
    fmt: fmtOf(dataUrl),
  };
}

const infoFromBlob = async (blob: Blob) =>
  infoFromDataUrl(await blobToDataUrl(blob));
const infoFromSrc = async (src: string) =>
  infoFromDataUrl(await toDataUrl(src));

export async function buildStyleGuide(
  gen: GenLike,
  palette: string[],
  blobs: Map<string, Blob>,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  const company = (gen.name || gen.companyName || "Your brand").trim();
  const pal = palette.length ? palette : ["#2F6FF5"];
  const brand = pickBrandColor(gen.params.primaryColor, pal);

  const setFill = (hex: string) => doc.setFillColor(...hexToRgb(hex));
  const setText = (hex: string) => doc.setTextColor(...hexToRgb(hex));
  const setDraw = (hex: string) => doc.setDrawColor(...hexToRgb(hex));

  // Place an image contained (aspect-preserved, centered) inside a box.
  const place = (
    info: ImgInfo,
    x: number,
    y: number,
    bw: number,
    bh: number,
  ) => {
    const r = Math.min(bw / info.w, bh / info.h);
    const w = info.w * r;
    const h = info.h * r;
    doc.addImage(
      info.dataUrl,
      info.fmt,
      x + (bw - w) / 2,
      y + (bh - h) / 2,
      w,
      h,
    );
  };

  const header = (eyebrow: string, title: string) => {
    setText(brand);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(eyebrow.toUpperCase(), M, M + 3, { charSpace: 0.6 });
    setText(INK);
    doc.setFontSize(21);
    doc.text(title, M, M + 13);
    setDraw(LINE);
    doc.setLineWidth(0.3);
    doc.line(M, M + 18, W - M, M + 18);
  };

  const footer = (page: number, total: number) => {
    setText(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${company} · Brand guidelines`, M, H - 10);
    doc.text(`${page} / ${total}`, W - M, H - 10, { align: "right" });
  };

  // Resolve the images we'll embed. The source logo is always available; the
  // variant tiles render only when that category was built (graceful skip).
  const primary = await infoFromSrc(
    blobs.has("variants/logo-on-light.png")
      ? await blobToDataUrl(blobs.get("variants/logo-on-light.png")!)
      : gen.image,
  );

  const VARIANT_TILES: {
    key: string;
    bg: string;
    border: boolean;
    label: string;
    use: string;
  }[] = [
    {
      key: "variants/logo-on-light.png",
      bg: "#ffffff",
      border: true,
      label: "On light",
      use: "Default. Light or white backgrounds.",
    },
    {
      key: "variants/logo-on-dark.png",
      bg: DARK,
      border: false,
      label: "On dark",
      use: "Dark or photographic backgrounds.",
    },
    {
      key: "variants/logo-transparent.png",
      bg: "#f3f2ee",
      border: true,
      label: "Transparent",
      use: "Overlays, merch printing, watermarks.",
    },
  ];
  const tiles = await Promise.all(
    VARIANT_TILES.filter((t) => blobs.has(t.key)).map(async (t) => ({
      ...t,
      info: await infoFromBlob(blobs.get(t.key)!),
    })),
  );

  const total = tiles.length ? 5 : 4;
  let page = 0;

  // ── Page 1 · Cover ─────────────────────────────────────────────
  page++;
  setFill(PAPER);
  doc.rect(0, 0, W, H, "F");
  setFill(brand);
  doc.rect(0, 0, W, 5, "F"); // top accent band
  // Logo on a clean card.
  const cardY = 78;
  const cardH = 96;
  setFill("#ffffff");
  setDraw(LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, cardY, W - 2 * M, cardH, 4, 4, "FD");
  place(primary, M + 18, cardY + 14, W - 2 * M - 36, cardH - 28);
  // Title block.
  setText(brand);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("BRAND GUIDELINES", W / 2, cardY + cardH + 26, {
    align: "center",
    charSpace: 1.2,
  });
  setText(INK);
  doc.setFontSize(34);
  doc.text(company, W / 2, cardY + cardH + 40, { align: "center" });
  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    "Logo usage, color, and type, in one place.",
    W / 2,
    cardY + cardH + 50,
    { align: "center" },
  );
  setText(MUTED);
  doc.setFontSize(8);
  doc.text("Generated with LogoCreator", W / 2, H - 16, { align: "center" });

  // ── Page 2 · Logo & clear space ────────────────────────────────
  doc.addPage();
  page++;
  setFill(PAPER);
  doc.rect(0, 0, W, H, "F");
  header("The logo", "Logo & clear space");
  // Left: the logo in a frame with a dashed clear-space boundary.
  const fx = M;
  const fy = M + 28;
  const fw = 96;
  const fh = 96;
  setFill("#ffffff");
  setDraw(LINE);
  doc.setLineWidth(0.3);
  doc.rect(fx, fy, fw, fh, "FD");
  const pad = fw * 0.22; // 22% clear space all around
  place(primary, fx + pad, fy + pad, fw - 2 * pad, fh - 2 * pad);
  setDraw(brand);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.4, 1.4], 0);
  doc.rect(fx + pad, fy + pad, fw - 2 * pad, fh - 2 * pad);
  doc.setLineDashPattern([], 0);
  // Right: the rules.
  const tx = fx + fw + 14;
  const tw = W - M - tx;
  let ty = fy + 4;
  const rule = (title: string, body: string) => {
    setText(INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, tx, ty);
    ty += 5.5;
    setText(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(body, tw);
    doc.text(lines, tx, ty);
    ty += lines.length * 5 + 7;
  };
  rule(
    "Clear space",
    "Always keep clear space around the logo equal to at least 25% of its height (shown dashed). Keep other logos, text, and busy imagery out of this zone so the mark stays legible.",
  );
  rule(
    "Minimum size",
    "To stay sharp, never reproduce the logo smaller than 24px tall on screen, or 10mm tall in print. Use the icon-only mark when space is tighter than that.",
  );
  rule(
    "Placement",
    "Give the logo a calm, uncluttered background. On photos or color, use the on-dark or on-light variant so it always reads cleanly.",
  );
  footer(page, total);

  // ── Page 3 · Variants (only when that category was built) ──────
  if (tiles.length) {
    doc.addPage();
    page++;
    setFill(PAPER);
    doc.rect(0, 0, W, H, "F");
    header("Usage", "Logo variants");
    const gap = 10;
    const cols = 2;
    const tw2 = (W - 2 * M - gap) / cols;
    const th = 64; // tile image area
    let i = 0;
    for (const t of tiles) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = M + col * (tw2 + gap);
      const y = M + 28 + row * (th + 22);
      setFill(t.bg);
      if (t.border) {
        setDraw(LINE);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, tw2, th, 3, 3, "FD");
      } else {
        doc.roundedRect(x, y, tw2, th, 3, 3, "F");
      }
      place(t.info, x + 12, y + 10, tw2 - 24, th - 20);
      setText(INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(t.label, x, y + th + 7);
      setText(MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(doc.splitTextToSize(t.use, tw2), x, y + th + 12);
      i++;
    }
    footer(page, total);
  }

  // ── Page 4 · Color palette ─────────────────────────────────────
  doc.addPage();
  page++;
  setFill(PAPER);
  doc.rect(0, 0, W, H, "F");
  header("Color", "Palette");
  const swatches = pal.slice(0, 6);
  const rowH = 30;
  let cy = M + 30;
  swatches.forEach((hex, idx) => {
    const sw = 46;
    setFill(hex);
    setDraw(LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, cy, sw, rowH - 8, 2.5, 2.5, "FD");
    // role tag inside the swatch
    setText(bestTextColor(hex));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(idx === 0 ? "PRIMARY" : `BRAND ${idx + 1}`, M + 4, cy + 6);
    // text block
    const txx = M + sw + 10;
    const [r, g, b] = hexToRgb(hex);
    setText(INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(hex.toUpperCase(), txx, cy + 7);
    setText(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`RGB ${r}, ${g}, ${b}`, txx, cy + 13);
    doc.text(`CSS var --brand-${idx + 1}`, txx, cy + 18);
    cy += rowH;
  });
  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    doc.splitTextToSize(
      "These values ship as brand-colors.css and brand-colors.json in this kit. Use the primary for key actions and accents; keep large surfaces neutral.",
      W - 2 * M,
    ),
    M,
    cy + 6,
  );
  footer(page, total);

  // ── Page 5 · Typography & usage ────────────────────────────────
  doc.addPage();
  page++;
  setFill(PAPER);
  doc.rect(0, 0, W, H, "F");
  header("Type & usage", "Typography");
  // Specimen
  setText(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(64);
  doc.text("Aa", M, M + 52);
  setText(MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    doc.splitTextToSize(
      "Pair the logo with a clean, geometric sans-serif. This guide is set in Helvetica; Inter, Satoshi, or a system UI font are good companions. Use a bold weight for headings and a regular weight for body text.",
      W - 2 * M,
    ),
    M,
    M + 64,
  );
  // Do / Don't
  const colW = (W - 2 * M - 12) / 2;
  const listY = M + 92;
  const dosX = M;
  const dontsX = M + colW + 12;
  const heading = (x: number, hex: string, label: string) => {
    setText(hex);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(label, x, listY);
  };
  const items = (x: number, hex: string, list: string[]) => {
    let y = listY + 8;
    setText(INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const it of list) {
      setText(hex);
      doc.text("•", x, y);
      setText(INK);
      const lines = doc.splitTextToSize(it, colW - 6);
      doc.text(lines, x + 5, y);
      y += lines.length * 5 + 3;
    }
  };
  heading(dosX, "#2e7d54", "Do");
  items(dosX, "#2e7d54", [
    "Keep the clear space and minimum size.",
    "Use the supplied color and mono variants.",
    "Scale the logo proportionally.",
    "Choose the variant that contrasts with the background.",
  ]);
  heading(dontsX, "#b3402e", "Don't");
  items(dontsX, "#b3402e", [
    "Stretch, squash, or rotate the logo.",
    "Recolor it outside the palette.",
    "Add shadows, outlines, or other effects.",
    "Place it on a busy background with no contrast.",
  ]);
  footer(page, total);

  return doc.output("blob");
}
