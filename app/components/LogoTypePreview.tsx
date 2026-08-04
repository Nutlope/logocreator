"use client";

import type { ReactNode } from "react";

/**
 * Rich hover preview for the Logo type dropdown. Each entry renders a clean
 * schematic "blueprint" of how that logo type is structured, plus a short
 * description, so picking a type feels tangible before generating.
 *
 * Schematics use theme tokens directly (hsl(var(--…))) so they adapt to
 * light/dark automatically. Accent = the brand ink-blue; ink = foreground.
 */

const PRIMARY = "hsl(var(--primary))";
const BG = "hsl(var(--background))";
const ink = (a: number) => `hsl(var(--foreground) / ${a})`;

type Preview = { title: string; desc: string; art: ReactNode };

const PREVIEWS: Record<string, Preview> = {
  "icon-name": {
    title: "Icon + name",
    desc: "A symbol stacked with your company name: the most flexible, recognizable setup.",
    art: (
      <>
        <rect x="49" y="8" width="22" height="22" rx="6.5" fill={PRIMARY} />
        <circle cx="60" cy="19" r="4.3" fill={BG} />
        <rect
          x="33"
          y="40"
          width="54"
          height="8.5"
          rx="4.25"
          fill={ink(0.82)}
        />
        <rect
          x="44"
          y="54"
          width="32"
          height="4.5"
          rx="2.25"
          fill={ink(0.28)}
        />
      </>
    ),
  },
  icon: {
    title: "Icon only",
    desc: "Just the symbol, no text. Compact and bold, ideal as an app icon or avatar.",
    art: (
      <>
        <rect x="40" y="14" width="40" height="40" rx="12" fill={PRIMARY} />
        <circle cx="60" cy="34" r="11" fill={BG} />
        <circle cx="60" cy="34" r="5" fill={PRIMARY} />
      </>
    ),
  },
  wordmark: {
    title: "Wordmark",
    desc: "Your name as custom lettering. No symbol, a purely typographic identity.",
    art: (
      <>
        <rect x="18" y="22" width="18" height="18" rx="3.5" fill={ink(0.82)} />
        <rect x="40" y="22" width="26" height="18" rx="3.5" fill={ink(0.82)} />
        <rect x="70" y="22" width="14" height="18" rx="3.5" fill={PRIMARY} />
        <rect x="88" y="22" width="14" height="18" rx="3.5" fill={ink(0.82)} />
        <rect x="18" y="46" width="84" height="3" rx="1.5" fill={ink(0.16)} />
      </>
    ),
  },
  monogram: {
    title: "Monogram",
    desc: "Your initials drawn as a tight, balanced mark. Classic and timeless.",
    art: (
      <>
        <rect
          x="42"
          y="12"
          width="36"
          height="36"
          rx="10"
          fill="none"
          stroke={ink(0.4)}
          strokeWidth="2.5"
        />
        <text
          x="60"
          y="40"
          textAnchor="middle"
          fontSize="27"
          fontWeight="800"
          fill={PRIMARY}
          style={{ fontFamily: "inherit" }}
        >
          A
        </text>
      </>
    ),
  },
  emblem: {
    title: "Emblem / badge",
    desc: "Name and symbol locked into a badge or crest. Traditional and authoritative.",
    art: (
      <>
        <circle
          cx="60"
          cy="30"
          r="22"
          fill="none"
          stroke={ink(0.45)}
          strokeWidth="2.5"
        />
        <circle
          cx="60"
          cy="30"
          r="16"
          fill="none"
          stroke={ink(0.2)}
          strokeWidth="1.5"
        />
        <rect
          x="54"
          y="24"
          width="12"
          height="12"
          rx="2"
          fill={PRIMARY}
          transform="rotate(45 60 30)"
        />
        <rect x="40" y="52" width="40" height="11" rx="2" fill={ink(0.82)} />
        <rect x="46" y="56.5" width="28" height="3" rx="1.5" fill={BG} />
      </>
    ),
  },
  abstract: {
    title: "Abstract mark",
    desc: "A non-literal geometric mark that suggests your brand's idea or motion.",
    art: (
      <>
        <path
          d="M38 52 A24 24 0 0 1 80 22"
          fill="none"
          stroke={PRIMARY}
          strokeWidth="9"
          strokeLinecap="round"
        />
        <circle cx="79" cy="48" r="8.5" fill={ink(0.8)} />
      </>
    ),
  },
};

/** The one-line description for a logo type (for surfaces without the panel). */
export function typeDescription(typeKey: string): string {
  return (PREVIEWS[typeKey] ?? PREVIEWS["icon-name"]).desc;
}

export default function LogoTypePreview({ typeKey }: { typeKey: string }) {
  const p = PREVIEWS[typeKey] ?? PREVIEWS["icon-name"];
  return (
    <div className="flex h-full flex-col">
      <span className="label-eyebrow mb-2.5 block">Structure</span>
      <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-border bg-background/50 p-3">
        <svg
          viewBox="0 0 120 68"
          fill="none"
          className="w-full max-w-[9.5rem]"
          aria-hidden="true"
        >
          {p.art}
        </svg>
      </div>
      <div className="mt-3">
        <p className="text-sm font-semibold text-foreground">{p.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {p.desc}
        </p>
      </div>
    </div>
  );
}
