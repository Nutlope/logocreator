"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Package,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Tip } from "@/app/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PRICE_PER_AI_ASSET, formatUsd } from "@/app/lib/pricing";
import type { BrandKitItem, BrandKitPhase } from "@/app/hooks/use-brand-kit";
import type { Generation } from "./Gallery";

// Short "what's inside" blurbs; costs are derived per item from the ai flag.
const CATEGORY_META: Record<string, { blurb: string }> = {
  "Logo variants": {
    blurb: "Transparent, on-light, on-dark + SVG",
  },
  Merch: {
    blurb: "Real-photo tee, mug & tote + AI card & signage",
  },
  "Web & social": { blurb: "Avatar, Open Graph card & banner" },
  "Icons & favicons": { blurb: "App icon + favicon" },
};

// Merch leads: the product shots are the most compelling thing to hand
// someone, so they open the kit; the working files follow.
const GROUP_ORDER = [
  "Merch",
  "Logo variants",
  "Web & social",
  "Icons & favicons",
];

export default function BrandKitModal({
  open,
  gen,
  items,
  palette,
  previews,
  prepareError,
  restoring,
  saved,
  phase,
  doneCount,
  total,
  zipping,
  guiding,
  onMinimize,
  onDiscard,
  onRebuild,
  onRemoveKit,
  onDownloadAll,
  onDownloadGuide,
  onBuild,
  onRetry,
}: {
  open: boolean;
  gen: Generation | null;
  items: BrandKitItem[];
  palette: string[];
  previews: Record<string, string>;
  prepareError: boolean;
  restoring: boolean;
  saved: boolean;
  phase: BrandKitPhase;
  doneCount: number;
  total: number;
  zipping: boolean;
  guiding: boolean;
  onMinimize: () => void;
  onDiscard: () => void;
  onRebuild: () => void;
  onRemoveKit: () => void;
  onDownloadAll: () => void;
  onDownloadGuide: () => void;
  onBuild: (groups: string[]) => void;
  onRetry: () => void;
}) {
  // The asset being viewed large (null = none).
  const [zoomed, setZoomed] = useState<BrandKitItem | null>(null);
  // Two-click guard for Discard once assets (some paid) have been built.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Two-click guard for permanently deleting a SAVED kit.
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Close the lightbox if the kit modal itself closes.
  useEffect(() => {
    if (!open) {
      setZoomed(null);
      setConfirmDiscard(false);
      setConfirmRemove(false);
    }
  }, [open]);

  // Hidden items (favicon size variants) build + zip but are never shown.
  const visibleItems = items.filter((i) => !i.hidden);
  const groups = GROUP_ORDER.filter((g) =>
    visibleItems.some((i) => i.group === g),
  );
  const nowRendering = visibleItems.find((i) => i.status === "building")?.name;
  const pct = total > 0 ? (doneCount / total) * 100 : 0;
  // Only the AI renders cost credits; each carries its own flag, so mixed
  // groups (Merch = photo prints + two AI shots) still count honestly.
  const aiCount = visibleItems.filter((i) => i.ai).length;
  const aiCost = aiCount * PRICE_PER_AI_ASSET;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          // Any close gesture (X / Esc / outside) minimizes, keeps building.
          if (!o) onMinimize();
        }}
      >
        {gen && restoring ? (
          <DialogContent className="flex max-w-md flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
            <DialogTitle className="text-base">
              Opening your brand kit
            </DialogTitle>
            <DialogDescription className="sr-only">
              Restoring the saved brand kit for {gen.companyName || "your logo"}
              .
            </DialogDescription>
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading {gen.companyName || "your logo"}&apos;s saved assets…
            </p>
          </DialogContent>
        ) : gen && phase === "configure" ? (
          <ConfigureView
            gen={gen}
            items={items}
            previews={previews}
            prepareError={prepareError}
            onBuild={onBuild}
            onDiscard={onDiscard}
            onRetry={onRetry}
          />
        ) : gen ? (
          <DialogContent className="flex max-h-[88svh] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
            <DialogHeader className="space-y-1 border-b border-border px-6 py-5 pr-12 text-left">
              <DialogTitle className="text-lg">
                {phase === "done"
                  ? "Your brand kit is ready"
                  : "Building your brand kit"}
              </DialogTitle>
              <DialogDescription>
                {gen.companyName || "Your logo"}: merch, logo variants, social
                assets, icons and a color palette.
              </DialogDescription>
              <p
                className="text-xs text-muted-foreground"
                title="Together AI bills only the two AI product shots (business card + signage) to your key. Everything else (variants, merch photo prints, social, icons) is generated on-device for free."
              >
                ~{formatUsd(aiCost)} in AI credits · {aiCount} AI render
                {aiCount === 1 ? "" : "s"}, everything else free
              </p>
            </DialogHeader>

            {/* Progress */}
            <div className="border-b border-border px-6 py-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {doneCount} of {total || "…"} assets
                </span>
                {phase === "building" ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Sparkles className="size-3 shrink-0 animate-pulse text-primary" />
                    <span className="truncate">
                      {nowRendering
                        ? `Rendering ${nowRendering}…`
                        : "Preparing your assets…"}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-primary">
                    <Check className="size-3" strokeWidth={3} /> Done
                  </span>
                )}
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
                {phase === "building" && (
                  <div className="indeterminate-bar pointer-events-none absolute inset-0" />
                )}
              </div>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {palette.length > 0 && (
                <div>
                  <span className="label-eyebrow mb-2.5 block">
                    Color palette
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {palette.map((hex) => (
                      <span
                        key={hex}
                        title={hex}
                        className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-2.5"
                      >
                        <span
                          className="size-5 rounded-full ring-1 ring-foreground/10"
                          style={{ backgroundColor: hex }}
                        />
                        <span className="text-xs font-medium uppercase text-muted-foreground">
                          {hex}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {groups.map((group) => {
                // Photographic groups get bigger tiles (they read as scenes).
                const showcase = group === "Merch" || group === "Web & social";
                const groupItems = visibleItems.filter(
                  (i) => i.group === group,
                );
                return (
                  <div key={group}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="label-eyebrow">{group}</span>
                      <GroupProgress items={groupItems} />
                    </div>
                    <div
                      className={cn(
                        "grid gap-3",
                        showcase
                          ? "grid-cols-2 sm:grid-cols-3"
                          : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
                      )}
                    >
                      {groupItems.map((item) => (
                        <AssetTile
                          key={item.filename}
                          item={item}
                          wide={showcase}
                          onZoom={setZoomed}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              {phase === "done" ? (
                // Saved on its logo, so there's nothing to lose by closing. Offer a
                // rebuild and an explicit (guarded) delete instead of a "discard".
                <div className="flex items-center gap-3">
                  {saved && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Check className="size-3.5" strokeWidth={3} />
                      Saved to this logo
                    </span>
                  )}
                  <Tip label="Build this kit again from scratch" side="top">
                    <button
                      type="button"
                      onClick={onRebuild}
                      className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" />
                      Rebuild
                    </button>
                  </Tip>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmRemove) {
                        setConfirmRemove(true);
                        return;
                      }
                      setConfirmRemove(false);
                      onRemoveKit();
                    }}
                    onMouseLeave={() => setConfirmRemove(false)}
                    onBlur={() => setConfirmRemove(false)}
                    aria-label={
                      confirmRemove
                        ? "Confirm: permanently delete this saved kit"
                        : "Delete this saved kit"
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-medium transition-colors",
                      confirmRemove
                        ? "text-destructive"
                        : "text-muted-foreground hover:text-destructive",
                    )}
                  >
                    <Trash2 className="size-3.5" />
                    {confirmRemove ? "Delete kit?" : "Delete"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // The in-progress build isn't saved yet and the AI renders cost
                    // real credits, so a single misclick shouldn't bin them.
                    if (doneCount > 0 && !confirmDiscard) {
                      setConfirmDiscard(true);
                      return;
                    }
                    setConfirmDiscard(false);
                    onDiscard();
                  }}
                  onMouseLeave={() => setConfirmDiscard(false)}
                  onBlur={() => setConfirmDiscard(false)}
                  aria-label={
                    confirmDiscard
                      ? "Confirm discard: this deletes every built asset"
                      : "Discard this brand kit"
                  }
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:justify-start sm:py-1",
                    confirmDiscard
                      ? "text-destructive"
                      : "text-muted-foreground hover:text-destructive",
                  )}
                >
                  <Trash2 className="size-3.5" />
                  {confirmDiscard ? "Discard everything?" : "Discard"}
                </button>
              )}
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                <span className="hidden text-xs text-muted-foreground lg:block">
                  {phase === "done"
                    ? "Reopen this kit anytime from the logo."
                    : "Close anytime, it keeps building in the background."}
                </span>
                {phase === "done" && (
                  <Button
                    variant="secondary"
                    onClick={onDownloadGuide}
                    disabled={doneCount === 0 || guiding}
                    className="w-full rounded-lg font-semibold sm:w-auto"
                  >
                    {guiding ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                    Style guide
                  </Button>
                )}
                <Button
                  onClick={onDownloadAll}
                  disabled={doneCount === 0 || zipping}
                  className="w-full rounded-lg font-bold sm:w-auto"
                >
                  {zipping ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Package className="size-4" />
                  )}
                  Download all (.zip)
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
      <AssetLightbox item={zoomed} onClose={() => setZoomed(null)} />
    </>
  );
}

// ── Enlarged single-asset viewer ──────────────────────────────────────────
function AssetLightbox({
  item,
  onClose,
}: {
  item: BrandKitItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!item?.url} onOpenChange={(o) => !o && onClose()}>
      {item?.url && (
        <DialogContent className="max-w-[min(94vw,52rem)] border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{item.name}</DialogTitle>
          <div className="flex flex-col items-center gap-3">
            {/* Checkerboard so transparent / white assets stay visible */}
            <div
              className="flex max-h-[78svh] items-center justify-center overflow-hidden rounded-2xl ring-1 ring-white/15"
              style={{
                backgroundColor: "#f7f5f1",
                backgroundImage:
                  "linear-gradient(45deg,#e3e0d8 25%,transparent 25%),linear-gradient(-45deg,#e3e0d8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e3e0d8 75%),linear-gradient(-45deg,transparent 75%,#e3e0d8 75%)",
                backgroundSize: "22px 22px",
                backgroundPosition: "0 0,0 11px,11px -11px,-11px 0",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.name}
                className="max-h-[78svh] w-auto object-contain"
              />
            </div>
            <div className="flex max-w-[90vw] items-center gap-3 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur">
              <span className="min-w-0 truncate text-sm font-medium text-white">
                {item.name}
              </span>
              <a
                href={item.url}
                download={item.filename.split("/").pop()}
                className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/60 sm:py-1"
              >
                <Download className="size-3.5" />
                Download
              </a>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

// ── Pre-build category selector ───────────────────────────────────────────
function ConfigureView({
  gen,
  items,
  previews,
  prepareError,
  onBuild,
  onDiscard,
  onRetry,
}: {
  gen: Generation;
  items: BrandKitItem[];
  previews: Record<string, string>;
  prepareError: boolean;
  onBuild: (groups: string[]) => void;
  onDiscard: () => void;
  onRetry: () => void;
}) {
  const categories = useMemo(() => {
    return GROUP_ORDER.filter((g) => items.some((i) => i.group === g)).map(
      (group) => {
        const groupItems = items.filter((i) => i.group === group && !i.hidden);
        const aiItems = groupItems.filter((i) => i.ai).length;
        const cost = aiItems * PRICE_PER_AI_ASSET;
        return {
          group,
          count: groupItems.length,
          paid: cost > 0,
          cost,
          blurb: CATEGORY_META[group]?.blurb ?? "",
          preview: previews[group],
        };
      },
    );
  }, [items, previews]);

  const allGroups = categories.map((c) => c.group).join("|");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Default: everything selected. Reset whenever the category list changes.
  useEffect(() => {
    setSelected(new Set(allGroups ? allGroups.split("|") : []));
  }, [allGroups]);

  const ready = categories.length > 0;
  const totalCost = categories
    .filter((c) => selected.has(c.group))
    .reduce((sum, c) => sum + c.cost, 0);
  const selectedCount = categories
    .filter((c) => selected.has(c.group))
    .reduce((sum, c) => sum + c.count, 0);

  const toggle = (group: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  return (
    <DialogContent className="flex max-h-[88svh] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
      <DialogHeader className="space-y-1 border-b border-border px-6 py-5 pr-12 text-left">
        <DialogTitle className="text-lg">
          Build {gen.companyName || "your"} brand kit
        </DialogTitle>
        <DialogDescription>
          Pick what to include. Almost everything is generated free on your
          device; only the two AI product shots use credits.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {!ready ? (
          prepareError ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 px-6 text-center text-sm">
              <p className="text-muted-foreground">
                Couldn&apos;t prepare this logo&apos;s assets. The image may
                have failed to load.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onDiscard}>
                  Close
                </Button>
                <Button type="button" onClick={onRetry}>
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            // Skeleton grid in the FINAL layout, so the modal opens at its true
            // size with structure instead of a small spinner that then jumps to
            // the full grid while the heavy canvas prep runs.
            <div
              aria-label="Preparing your assets"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
                >
                  <div className="aspect-[16/10] w-full animate-pulse bg-secondary/60" />
                  <div className="flex flex-col gap-2 p-3">
                    <div className="h-3.5 w-1/2 animate-pulse rounded bg-secondary/60" />
                    <div className="h-2.5 w-4/5 animate-pulse rounded bg-secondary/50" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const on = selected.has(cat.group);
              return (
                <button
                  key={cat.group}
                  type="button"
                  onClick={() => toggle(cat.group)}
                  aria-pressed={on}
                  className={cn(
                    "group/cat relative flex flex-col overflow-hidden rounded-xl border bg-card text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "border-primary/60 ring-1 ring-primary/30"
                      : "border-border opacity-70 hover:opacity-100",
                  )}
                >
                  {/* Preview */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary/40">
                    {cat.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={cat.preview}
                        src={cat.preview}
                        alt=""
                        className="h-full w-full animate-in object-cover fade-in duration-300 transition-transform group-hover/cat:scale-[1.04]"
                      />
                    ) : (
                      // The previews render just after the cards; a matching
                      // shimmer holds the space so nothing pops or reflows.
                      <div className="h-full w-full animate-pulse bg-secondary/60" />
                    )}
                    {/* Selection check */}
                    <span
                      className={cn(
                        "absolute right-2 top-2 flex size-5 items-center justify-center rounded-full border transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-white/60 bg-black/30 text-transparent backdrop-blur-sm",
                      )}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {/* Cost badge */}
                    <span
                      className={cn(
                        "absolute bottom-2 left-2 rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold backdrop-blur-sm",
                        cat.paid
                          ? "bg-amber-400/90 text-amber-950"
                          : "bg-emerald-400/90 text-emerald-950",
                      )}
                    >
                      {cat.paid ? `~${formatUsd(cat.cost)}` : "Free"}
                    </span>
                  </div>
                  {/* Meta */}
                  <div className="flex flex-1 flex-col gap-0.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {cat.group}
                      </span>
                      <span className="shrink-0 text-[0.6875rem] font-medium tabular-nums text-muted-foreground">
                        {cat.count}
                      </span>
                    </div>
                    <span className="text-[0.7rem] leading-snug text-muted-foreground">
                      {cat.blurb}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={onDiscard}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="size-3.5" />
          Cancel
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3 sm:flex-none">
          <span className="hidden text-xs text-muted-foreground sm:block">
            {selectedCount} asset{selectedCount === 1 ? "" : "s"} ·{" "}
            {totalCost > 0 ? `~${formatUsd(totalCost)} credits` : "all free"}
          </span>
          <Button
            onClick={() => onBuild(Array.from(selected))}
            disabled={selectedCount === 0}
            className="min-w-0 flex-1 rounded-lg font-bold sm:flex-none"
          >
            <Sparkles className="size-4" />
            Build kit{totalCost > 0 ? ` · ~${formatUsd(totalCost)}` : ""}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function GroupProgress({ items }: { items: BrandKitItem[] }) {
  const done = items.filter((i) => i.status === "done").length;
  const busy = items.some((i) => i.status === "building");
  return (
    <span className="flex items-center gap-1 text-[0.6875rem] font-medium tabular-nums text-muted-foreground">
      {busy && <Loader2 className="size-2.5 animate-spin" />}
      {done}/{items.length}
    </span>
  );
}

function AssetTile({
  item,
  wide = false,
  onZoom,
}: {
  item: BrandKitItem;
  wide?: boolean;
  onZoom: (item: BrandKitItem) => void;
}) {
  const loading = item.status === "building";
  return (
    <div
      className={cn(
        "group/tile relative overflow-hidden rounded-lg border border-border bg-secondary/40",
        wide ? "aspect-[4/3]" : "aspect-square",
        loading && "shimmer",
      )}
    >
      {item.url ? (
        <button
          type="button"
          onClick={() => onZoom(item)}
          aria-label={`View ${item.name} larger`}
          className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.name}
            className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover/tile:scale-[1.06]"
          />
          {/* Enlarge hint */}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover/tile:bg-black/15 group-hover/tile:opacity-100">
            <span className="flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
              <Maximize2 className="size-3.5" />
            </span>
          </span>
        </button>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center">
          {item.status === "building" ? (
            <span className="spinner-ring size-5" />
          ) : item.status === "error" ? (
            <X className="size-4 text-muted-foreground/40" />
          ) : (
            <span className="animate-tile-breathe size-1.5 rounded-full bg-muted-foreground/40" />
          )}
          <span className="line-clamp-2 text-[0.6875rem] font-medium leading-tight text-muted-foreground">
            {item.status === "error" ? `${item.name}: failed` : item.name}
          </span>
        </div>
      )}

      {item.status === "done" && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}

      {item.url && (
        <Tip label="Download">
          <a
            href={item.url}
            download={item.filename.split("/").pop()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Download ${item.name}`}
            className="absolute bottom-1.5 left-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 outline-none backdrop-blur transition-opacity hover:bg-black/80 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/60 group-hover/tile:opacity-100 [@media(hover:none)]:size-8 [@media(hover:none)]:opacity-100"
          >
            <Download className="size-3" />
          </a>
        </Tip>
      )}
    </div>
  );
}
