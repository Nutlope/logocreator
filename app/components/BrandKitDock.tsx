"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Package, X } from "lucide-react";
import type { Generation } from "./Gallery";

/**
 * Floating "return to your brand kit" chip. Appears whenever a brand kit exists
 * but its modal is minimized. Shows a live progress ring while building, a
 * check when ready. Click to restore; the small × discards it.
 */
export default function BrandKitDock({
  gen,
  visible,
  phase,
  doneCount,
  total,
  onOpen,
  onDiscard,
}: {
  gen: Generation | null;
  visible: boolean;
  phase: "configure" | "building" | "done";
  doneCount: number;
  total: number;
  onOpen: () => void;
  onDiscard: () => void;
}) {
  // Clamp: during the configure→building transition doneCount can momentarily
  // exceed a just-narrowed total, which would over-fill the ring.
  const pct = total > 0 ? Math.min(1, doneCount / total) : 0;
  const shownDone = total > 0 ? Math.min(doneCount, total) : doneCount;

  return (
    <AnimatePresence>
      {visible && gen && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-40 md:right-6"
        >
          <div className="group relative">
            <button
              type="button"
              onClick={onOpen}
              aria-label="Reopen brand kit"
              className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 py-2.5 pl-2.5 pr-4 text-left shadow-xl shadow-black/20 backdrop-blur transition-colors hover:border-foreground/30"
            >
              <DockRing phase={phase} pct={pct} />
              <span className="flex flex-col">
                <span className="text-[0.82rem] font-semibold leading-tight">
                  {phase === "done" ? "Brand kit ready" : "Building brand kit"}
                </span>
                <span className="text-[0.7rem] leading-tight text-muted-foreground">
                  {(gen.companyName || "Your logo") + " · "}
                  {phase === "done"
                    ? `${total} assets`
                    : total > 0
                      ? `${shownDone} of ${total}`
                      : "starting…"}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onDiscard}
              aria-label="Discard brand kit"
              className="absolute -right-1.5 -top-1.5 flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-md transition-all hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 sm:size-5 [@media(hover:none)]:opacity-100"
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DockRing({
  phase,
  pct,
}: {
  phase: "configure" | "building" | "done";
  pct: number;
}) {
  if (phase === "done") {
    return (
      <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-4" strokeWidth={3} />
      </span>
    );
  }
  const r = 15;
  const circ = 2 * Math.PI * r;
  return (
    <span className="relative flex size-9 items-center justify-center">
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <Package className="absolute size-3.5 text-muted-foreground" />
    </span>
  );
}
