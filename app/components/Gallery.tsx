"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  ImageOff,
  Package,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { slugify } from "@/app/lib/brand-kit";
import { Tip } from "./ui/tooltip";
import { LogoMark } from "./Logo";

export type GenParams = {
  companyName: string;
  selectedStyle: string;
  logoType: string;
  primaryColor: string;
  backgroundColor: string;
  detailLevel: string;
  monochrome: boolean;
  additionalInfo: string;
  referenceDescription?: string;
};

export type Generation = {
  id: string;
  image: string;
  companyName: string;
  params: GenParams;
  createdAt?: number;
  favorite?: boolean;
  name?: string; // user-given label, overrides companyName for display
  /** Hydrated from on-device history (skips the new-logo entry animation). */
  restored?: boolean;
};

const EASE = [0.22, 1, 0.36, 1] as const;

function SkeletonCell() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="shimmer relative flex aspect-square flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-border bg-card"
    >
      <span className="spinner-ring size-7" />
      <span className="text-xs font-medium text-muted-foreground">
        Generating…
      </span>
    </motion.div>
  );
}

function GenerationCell({
  gen,
  index,
  busy,
  hasKit,
  onVary,
  onOpen,
  onCreateBrandKit,
  onToggleFavorite,
}: {
  gen: Generation;
  index: number;
  busy: boolean;
  hasKit: boolean;
  onVary: (gen: Generation) => void;
  onOpen: (gen: Generation) => void;
  onCreateBrandKit: (gen: Generation) => void;
  onToggleFavorite: (gen: Generation) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const fallbackName = gen.name || gen.companyName || `Logo ${index + 1}`;
  return (
    <motion.div
      layout
      // Restored history cells paint in place: the entry stagger is for
      // genuinely new logos, not a reload of last week's.
      initial={gen.restored ? false : { opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{
        duration: 0.38,
        ease: EASE,
        delay: Math.min(index, 6) * 0.035,
      }}
      onClick={() => onOpen(gen)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(gen);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${fallbackName}`}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border border-border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {imgFailed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOff className="size-6 opacity-60" />
          <span className="px-3 text-center text-xs">Image unavailable</span>
        </div>
      ) : (
        <Image
          src={gen.image}
          alt={`${fallbackName} logo`}
          width={512}
          height={512}
          unoptimized
          priority={index < 3}
          onError={() => setImgFailed(true)}
          className="h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      )}
      {/* Favorite star: always visible when favorited, else on hover/focus */}
      <Tip
        label={gen.favorite ? "Remove from favorites" : "Add to favorites"}
        side="right"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(gen);
          }}
          aria-label={
            gen.favorite ? "Remove from favorites" : "Add to favorites"
          }
          aria-pressed={!!gen.favorite}
          className={cn(
            "absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-full border bg-black/45 outline-none backdrop-blur-md transition-all duration-200 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/60 [@media(hover:none)]:size-9",
            gen.favorite
              ? "border-amber-300/40 text-amber-300 opacity-100"
              : // No hover on touch: keep the star reachable there.
                "border-white/15 text-white/85 opacity-0 hover:text-white group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <Star className={cn("size-3.5", gen.favorite && "fill-amber-300")} />
        </button>
      </Tip>
      {/* Brand-kit badge: always visible on logos that have one, and a one-tap
          shortcut back into the saved kit. */}
      {hasKit && (
        <Tip label="Open brand kit" side="left">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateBrandKit(gen);
            }}
            aria-label="Open brand kit"
            className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-white/15 bg-primary/90 px-2 py-1 text-[0.65rem] font-semibold text-primary-foreground shadow-sm outline-none backdrop-blur-md transition-colors hover:bg-primary focus-visible:ring-2 focus-visible:ring-white/60 [@media(hover:none)]:py-1.5"
          >
            <Package className="size-3" strokeWidth={2.5} />
            Kit
          </button>
        </Tip>
      )}
      {/* Revealed on hover OR keyboard focus; always visible on touch (no hover there) */}
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/45 via-black/0 to-transparent opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <div className="pointer-events-auto mb-3 flex items-center gap-1 rounded-full border border-white/15 bg-black/55 p-1 backdrop-blur-md">
          <Tip label="Download PNG">
            <a
              href={gen.image}
              download={`${slugify(gen.companyName)}.png`}
              onClick={(e) => e.stopPropagation()}
              aria-label="Download PNG"
              className="flex size-8 items-center justify-center rounded-full text-white/90 outline-none transition-colors hover:bg-white/15 focus-visible:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 [@media(hover:none)]:size-9"
            >
              <Download className="size-4" />
            </a>
          </Tip>
          <Tip label={hasKit ? "Open brand kit" : "Create brand kit"}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateBrandKit(gen);
              }}
              aria-label={hasKit ? "Open brand kit" : "Create brand kit"}
              className="flex size-8 items-center justify-center rounded-full text-white/90 outline-none transition-colors hover:bg-white/15 focus-visible:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 [@media(hover:none)]:size-9"
            >
              {hasKit ? (
                <Package className="size-4" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </button>
          </Tip>
          <Tip label={busy ? "Still generating…" : "Make variations"}>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onVary(gen);
              }}
              aria-label="Make variations of this logo"
              className="flex size-8 items-center justify-center rounded-full text-white/90 outline-none transition-colors hover:bg-white/15 focus-visible:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-40 [@media(hover:none)]:size-9"
            >
              <RefreshCw className="size-4" />
            </button>
          </Tip>
        </div>
      </div>
    </motion.div>
  );
}

export default function Gallery({
  generations,
  pendingCount,
  savedKitIds,
  onVary,
  onOpen,
  onCreateBrandKit,
  onToggleFavorite,
}: {
  generations: Generation[];
  pendingCount: number;
  savedKitIds: Set<string>;
  onVary: (gen: Generation) => void;
  onOpen: (gen: Generation) => void;
  onCreateBrandKit: (gen: Generation) => void;
  onToggleFavorite: (gen: Generation) => void;
}) {
  if (generations.length === 0 && pendingCount === 0) {
    return (
      <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-8 py-16 text-center">
        <LogoMark className="animate-pulse-soft size-12 opacity-25" />
        <h2 className="mt-5 text-lg font-bold text-foreground">
          Your logos will appear here
        </h2>
        <p className="mt-1.5 max-w-xs text-pretty text-sm text-muted-foreground">
          Pick a quick-start preset or fill in the details, hit Generate, and
          every logo you make stacks up right here.
        </p>
      </div>
    );
  }

  // Favorites pin to the front of the gallery (newest-first within each group),
  // so a starred logo stays easy to find as more generations stack up. The sort
  // is stable, so it only lifts favorites above non-favorites and otherwise
  // keeps the incoming newest-first order. The layout animation on each cell
  // makes the star visibly float the logo to the top.
  const ordered =
    generations.some((g) => g.favorite) && generations.some((g) => !g.favorite)
      ? [...generations].sort(
          (a, b) => Number(!!b.favorite) - Number(!!a.favorite),
        )
      : generations;

  return (
    <div className="grid grid-cols-2 gap-3.5 p-5 sm:gap-4 sm:p-6 lg:grid-cols-3">
      <AnimatePresence initial={false}>
        {Array.from({ length: pendingCount }, (_, i) => (
          <SkeletonCell key={`skeleton-${i}`} />
        ))}
        {ordered.map((gen, i) => (
          <GenerationCell
            key={gen.id}
            gen={gen}
            index={i}
            busy={pendingCount > 0}
            hasKit={savedKitIds.has(gen.id)}
            onVary={onVary}
            onOpen={onOpen}
            onCreateBrandKit={onCreateBrandKit}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
