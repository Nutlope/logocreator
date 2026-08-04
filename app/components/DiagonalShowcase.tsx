"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "next-themes";
import { SHOWCASE } from "@/app/lib/showcase";

const ROWS = 4;
const ROW_CONFIG = [
  { dir: "marquee-left", dur: "46s" },
  { dir: "marquee-right", dur: "58s" },
  { dir: "marquee-left", dur: "52s" },
  { dir: "marquee-right", dur: "64s" },
];

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: n }, () => []);
  arr.forEach((item, i) => out[i % n].push(item));
  return out;
}

/**
 * One showcase card. The logo art is a background-removed PNG, so the card's
 * own surface is the only backdrop, and it fades in place once its image has
 * loaded instead of popping in whenever the network happens to deliver it.
 */
function Tile({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Covers images that completed from cache before hydration attached onLoad,
  // and re-runs the fade when a theme flip swaps the src to the other variant.
  useEffect(() => {
    setLoaded(ref.current?.complete ?? false);
  }, [src]);
  return (
    <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          const img = e.currentTarget;
          // A missing -dark.png variant falls back to the light image before
          // giving up, so dark mode never shows a sparse row just because one
          // variant wasn't shipped.
          if (img.src.endsWith("-dark.png")) {
            img.src = img.src.replace(/-dark\.png$/, ".png");
            return;
          }
          const tile = img.parentElement;
          if (tile) tile.style.display = "none";
        }}
        className={`size-full object-contain p-2 transition-opacity duration-700 ease-out ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/**
 * Animated background for the WelcomeModal: rows of example-brand logo cards
 * scrolling in alternating directions, tilted diagonally, with a vignette so
 * the foreground copy stays legible. Decorative + non-interactive.
 */
export default function DiagonalShowcase() {
  const rows = chunk(SHOWCASE, ROWS);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // In dark mode use the dark-background variants (<slug>-dark.png) so the wall
  // matches the theme instead of glowing white.
  const dark = mounted && resolvedTheme === "dark";
  const srcFor = (src: string) =>
    dark ? src.replace(/\.png$/, "-dark.png") : src;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-[-25%] flex flex-col justify-center gap-4 opacity-[0.85]"
        style={{ transform: "rotate(-12deg)" }}
      >
        {rows.map((row, i) => {
          const cfg = ROW_CONFIG[i % ROW_CONFIG.length];
          const tiles = [...row, ...row]; // duplicate → seamless -50% loop
          return (
            <div key={i} className="flex">
              <div
                className={`marquee-track flex gap-4 ${cfg.dir}`}
                style={{ "--marquee-dur": cfg.dur } as CSSProperties}
              >
                {tiles.map((logo, j) => (
                  <Tile key={`${i}-${j}`} src={srcFor(logo.src)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Vignette so cards fade out toward the edges + behind the copy. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 38%, hsl(var(--background) / 0.32) 75%, hsl(var(--background) / 0.72) 100%)",
        }}
      />
    </div>
  );
}
