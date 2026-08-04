/**
 * Approximate Together AI costs, shown only to BYOK users so they have a rough
 * sense of spend. Figures are estimates (verify at together.ai/pricing); the
 * UI always frames them with "~"/"≈".
 */

// FLUX.2-pro ≈ $0.03 per 1024² image (text-free icon / abstract marks).
export const PRICE_PER_LOGO = 0.03;
// Text-bearing types (wordmark / monogram / emblem / icon-name) route to
// Gemini Flash Image 3.1 for accurate lettering. Together quotes $0.047 at
// 512² and scales with size; ~$0.05 is the honest ballpark for 1024².
export const PRICE_PER_TEXT_LOGO = 0.05;

/** Per-logo estimate for a given logo type (text types cost more than FLUX). */
export function pricePerLogo(logoType: string | undefined): number {
  return ["icon-name", "wordmark", "monogram", "emblem"].includes(
    logoType ?? "icon-name",
  )
    ? PRICE_PER_TEXT_LOGO
    : PRICE_PER_LOGO;
}

// FLUX.2-pro edits ≈ $0.03 per image. The brand kit's only metered work is the
// AI renders: 2 product mockups (business card + signage), plus up to 4 logo
// lockups for combination marks. The modal derives the live estimate from the
// actual asset list; everything else is free canvas work.
export const PRICE_PER_AI_ASSET = 0.03;

/** Format a USD amount with sensible precision (e.g. 0.03 → "$0.03"). */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
