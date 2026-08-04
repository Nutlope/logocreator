"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileCode2,
  FolderOpen,
  History,
  Loader2,
  Package,
  Sparkles,
  Star,
  Trash2,
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
import { toast } from "@/hooks/use-toast";
import { downloadBlob, slugify } from "@/app/lib/brand-kit";
import { logoToSvgBlob } from "@/app/lib/svg-export";
import type { GenParams, Generation } from "./Gallery";

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dateLabel(ts: number | undefined): string {
  if (!ts) return "Earlier";
  const diffDays = Math.round(
    (startOfDay(Date.now()) - startOfDay(ts)) / 86400000,
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" }
      : {}),
  });
}

export default function HistoryDashboard({
  open,
  onClose,
  generations,
  savedKitIds,
  onOpen,
  onCreateBrandKit,
  onLoad,
  onDelete,
  onClear,
  onToggleFavorite,
}: {
  open: boolean;
  onClose: () => void;
  generations: Generation[];
  savedKitIds: Set<string>;
  onOpen: (gen: Generation) => void;
  onCreateBrandKit: (gen: Generation) => void;
  onLoad: (params: GenParams) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onToggleFavorite: (gen: Generation) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [favOnly, setFavOnly] = useState(false);

  const favCount = generations.filter((g) => g.favorite).length;
  const shown = favOnly ? generations.filter((g) => g.favorite) : generations;

  // Unfavoriting the last favorite while filtered would strand the user on a
  // blank grid with the (now unmounted) toggle stuck on: drop the filter.
  useEffect(() => {
    if (favOnly && favCount === 0) setFavOnly(false);
  }, [favOnly, favCount]);

  // Group consecutive same-day logos (the list is already newest-first).
  const groups: { label: string; items: Generation[] }[] = [];
  for (const gen of shown) {
    const label = dateLabel(gen.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(gen);
    else groups.push({ label, items: [gen] });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setConfirmClear(false);
        }
      }}
    >
      <DialogContent className="flex h-[88svh] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-6 py-5 pr-12 text-left">
          <div>
            <DialogTitle className="text-lg">Your logo history</DialogTitle>
            <DialogDescription>
              {generations.length} {generations.length === 1 ? "logo" : "logos"}{" "}
              saved on this device.
            </DialogDescription>
          </div>
          {generations.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5">
              {favCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFavOnly((v) => !v)}
                  aria-pressed={favOnly}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    favOnly
                      ? "border-amber-300/40 bg-amber-300/10 text-amber-600 dark:text-amber-400"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Star
                    className={cn(
                      "size-3.5",
                      favOnly && "fill-amber-400 text-amber-400",
                    )}
                  />
                  Favorites
                </button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirmClear) {
                    onClear();
                    setConfirmClear(false);
                  } else {
                    setConfirmClear(true);
                  }
                }}
                onMouseLeave={() => setConfirmClear(false)}
                onBlur={() => setConfirmClear(false)}
                aria-label={
                  confirmClear
                    ? "Confirm clear all history"
                    : "Clear all history"
                }
                className={cn(
                  "rounded-lg text-xs",
                  confirmClear && "text-destructive",
                )}
              >
                <Trash2 className="size-3.5" />
                {confirmClear ? "Clear all?" : "Clear all"}
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {generations.length === 0 ? (
            <div className="flex h-full min-h-[20rem] flex-col items-center justify-center text-center">
              <History className="size-10 text-muted-foreground/40" />
              <p className="mt-4 text-sm font-medium text-foreground">
                No logos yet
              </p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Generate a logo and it&apos;ll be saved here automatically, only
                on this device.
              </p>
            </div>
          ) : (
            <div className="space-y-7">
              {groups.map((g, gi) => (
                <div key={`${g.label}-${gi}`}>
                  <span className="label-eyebrow mb-3 block">{g.label}</span>
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {g.items.map((gen) => (
                      <HistoryTile
                        key={gen.id}
                        gen={gen}
                        hasKit={savedKitIds.has(gen.id)}
                        onOpen={onOpen}
                        onCreateBrandKit={onCreateBrandKit}
                        onLoad={onLoad}
                        onDelete={onDelete}
                        onToggleFavorite={onToggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryTile({
  gen,
  hasKit,
  onOpen,
  onCreateBrandKit,
  onLoad,
  onDelete,
  onToggleFavorite,
}: {
  gen: Generation;
  hasKit: boolean;
  onOpen: (gen: Generation) => void;
  onCreateBrandKit: (gen: Generation) => void;
  onLoad: (params: GenParams) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (gen: Generation) => void;
}) {
  const [svgBusy, setSvgBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const displayName = gen.name || gen.companyName || "Untitled";

  async function handleSvg() {
    if (svgBusy) return;
    setSvgBusy(true);
    try {
      const blob = await logoToSvgBlob(gen.image);
      downloadBlob(blob, `${slugify(displayName)}.svg`);
    } catch {
      toast({ variant: "destructive", title: "Couldn't vectorize this logo" });
    } finally {
      setSvgBusy(false);
    }
  }

  const pill =
    "flex size-7 items-center justify-center rounded-full bg-black/45 text-white/90 outline-none backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/60 [@media(hover:none)]:size-8";

  return (
    <div
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={() => onOpen(gen)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(gen);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${displayName}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={gen.image}
        alt={displayName}
        className="size-full object-contain"
      />
      {/* Favorite star: persistent when favorited, else on hover/focus */}
      <Tip
        label={gen.favorite ? "Remove from favorites" : "Add to favorites"}
        side="bottom"
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
            "absolute left-2 top-2 z-20 flex size-6 items-center justify-center rounded-full bg-black/45 outline-none backdrop-blur-sm transition-all focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/60 [@media(hover:none)]:size-8",
            gen.favorite
              ? "text-amber-300 opacity-100"
              : "text-white/85 opacity-0 hover:text-white group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <Star className={cn("size-3", gen.favorite && "fill-amber-300")} />
        </button>
      </Tip>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/65 via-black/0 to-black/10 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <div className="pointer-events-auto flex items-start justify-between gap-1 p-2 pl-9">
          <span className="truncate rounded bg-black/45 px-1.5 py-0.5 text-[0.65rem] font-medium text-white backdrop-blur-sm">
            {displayName}
          </span>
          <Tip
            label={confirmDel ? "Click again to delete" : "Delete"}
            side="bottom"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirmDel) onDelete(gen.id);
                else setConfirmDel(true);
              }}
              onMouseLeave={() => setConfirmDel(false)}
              onBlur={() => setConfirmDel(false)}
              aria-label={confirmDel ? "Confirm delete" : "Delete"}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-white/90 backdrop-blur-sm transition-colors [@media(hover:none)]:size-8",
                confirmDel ? "bg-destructive" : "bg-black/45 hover:bg-black/65",
              )}
            >
              <Trash2 className="size-3" />
            </button>
          </Tip>
        </div>

        <div className="pointer-events-auto flex items-center justify-center gap-1 p-2">
          <Tip label="Download PNG">
            <a
              href={gen.image}
              download={`${slugify(displayName)}.png`}
              onClick={(e) => e.stopPropagation()}
              aria-label="Download PNG"
              className={pill}
            >
              <Download className="size-3.5" />
            </a>
          </Tip>
          <Tip label="Download SVG (auto-traced)">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSvg();
              }}
              disabled={svgBusy}
              aria-label="Download SVG"
              className={pill}
            >
              {svgBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileCode2 className="size-3.5" />
              )}
            </button>
          </Tip>
          <Tip label={hasKit ? "Open brand kit" : "Create brand kit"}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateBrandKit(gen);
              }}
              aria-label={hasKit ? "Open brand kit" : "Create brand kit"}
              className={cn(pill, hasKit && "text-primary")}
            >
              {hasKit ? (
                <Package className="size-3.5" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
            </button>
          </Tip>
          <Tip label="Load into creator">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLoad(gen.params);
              }}
              aria-label="Load into creator"
              className={pill}
            >
              <FolderOpen className="size-3.5" />
            </button>
          </Tip>
        </div>
      </div>
    </div>
  );
}
