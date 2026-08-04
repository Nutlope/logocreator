"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  Download,
  FileCode2,
  ImageOff,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  SpellCheck,
  Star,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Tip } from "@/app/components/ui/tooltip";
import { Textarea } from "@/app/components/ui/textarea";
import { downloadBlob, slugify } from "@/app/lib/brand-kit";
import { logoToHiResPngBlob, logoToSvgBlob } from "@/app/lib/svg-export";
import { PRICE_PER_AI_ASSET, formatUsd } from "@/app/lib/pricing";
import { toast } from "@/hooks/use-toast";
import { LOGO_TYPES } from "./LogoTypeSelect";
import type { Generation } from "./Gallery";

function typeLabel(key: string) {
  return LOGO_TYPES.find((t) => t.key === key)?.label ?? key;
}

// One-tap iterations, curated so each reads as a clean edit instruction.
const QUICK_EDITS: { label: string; prompt: string }[] = [
  { label: "Bolder", prompt: "make the design bolder and a little thicker" },
  { label: "Simpler", prompt: "simplify the design: cleaner and more minimal" },
  { label: "More modern", prompt: "make it feel more modern and contemporary" },
  { label: "More detail", prompt: "add more refined detail and depth" },
  { label: "Vintage", prompt: "give it a vintage, retro feel" },
  { label: "Flat color", prompt: "make it a flat, single-color version" },
];

function Chip({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground/80"
    >
      {children}
    </span>
  );
}

function ColorChip({ label, hex }: { label: string; hex: string }) {
  if (hex === "auto") {
    return (
      <Chip title={`${label}: auto`}>
        <Sparkles className="size-3 text-primary" />
        {label} · Auto
      </Chip>
    );
  }
  return (
    <Chip title={`${label}: ${hex.toUpperCase()}`}>
      <span
        className="size-2.5 rounded-full ring-1 ring-foreground/15"
        style={{ backgroundColor: hex }}
      />
      {label}
    </Chip>
  );
}

// PNG export sizes. 1024 is the native generation size (download the original
// bytes untouched); 2048/4096 vectorize then re-rasterize for genuinely sharp
// print output instead of an upscaled blur.
const PNG_SIZES: { size: number; label: string; sub: string }[] = [
  { size: 1024, label: "Standard", sub: "1024px" },
  { size: 2048, label: "High-res", sub: "2048px" },
  { size: 4096, label: "Print", sub: "4096px" },
];

function PngExportMenu({
  image,
  filename,
  className,
}: {
  image: string;
  filename: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busySize, setBusySize] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function download(size: number) {
    if (busySize !== null) return;
    setBusySize(size);
    try {
      if (size <= 1024) {
        // Native size: ship the original bytes, no re-raster (lossless).
        const blob = await (await fetch(image)).blob();
        downloadBlob(blob, `${filename}.png`);
      } else {
        const blob = await logoToHiResPngBlob(image, size);
        downloadBlob(blob, `${filename}-${size}.png`);
      }
      setOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Couldn't export this size" });
    } finally {
      setBusySize(null);
    }
  }

  const busy = busySize !== null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Button
        variant="secondary"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full rounded-lg"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        PNG
        <ChevronDown className="size-3 opacity-60" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="PNG export size"
          className="absolute bottom-full left-0 z-50 mb-1.5 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {PNG_SIZES.map((s) => (
            <button
              key={s.size}
              role="menuitem"
              type="button"
              disabled={busy}
              onClick={() => download(s.size)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="font-medium text-foreground">{s.label}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {busySize === s.size && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {s.sub}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GenerationModal({
  gen,
  editing,
  busy,
  hasOwnKey,
  credits,
  hasKit,
  onClose,
  onRegenerate,
  onCreateBrandKit,
  onEdit,
  onToggleFavorite,
  onRename,
}: {
  gen: Generation | null;
  editing: boolean;
  busy: boolean;
  hasOwnKey: boolean;
  credits: number;
  /** This logo already has a saved brand kit, so the button re-opens it. */
  hasKit: boolean;
  onClose: () => void;
  onRegenerate: (gen: Generation) => void;
  onCreateBrandKit: (gen: Generation) => void;
  onEdit: (gen: Generation, instruction: string) => Promise<boolean>;
  onToggleFavorite: (gen: Generation) => void;
  onRename: (gen: Generation, name: string) => void;
}) {
  const [svgBusy, setSvgBusy] = useState(false);
  const [editText, setEditText] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [imgFailed, setImgFailed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // A new logo (or a Redo swap) gets a fresh chance to load.
  useEffect(() => {
    setImgFailed(false);
  }, [gen?.image]);

  // Sync the editable name when a different logo opens.
  useEffect(() => {
    setNameDraft(gen?.name || gen?.companyName || "");
  }, [gen?.id, gen?.name, gen?.companyName]);

  // Clear the "keep editing" draft when a DIFFERENT logo opens (keyed on id only,
  // so a rename re-render doesn't wipe an in-progress instruction).
  useEffect(() => {
    setEditText("");
  }, [gen?.id]);

  function commitName() {
    if (!gen) return;
    const current = gen.name || gen.companyName || "";
    if (nameDraft.trim() !== current) onRename(gen, nameDraft);
  }

  async function applyEdit() {
    const t = editText.trim();
    if (!gen || editing || !t) return;
    // Keep the text if the edit fails so nothing typed is ever lost.
    const ok = await onEdit(gen, t);
    if (ok) setEditText("");
  }

  async function applyQuick(prompt: string) {
    if (!gen || editing) return;
    // Never silently drop typed text: a chip click while the composer has an
    // instruction runs BOTH (typed intent first, then the chip's tweak).
    const typed = editText.trim();
    const ok = await onEdit(gen, typed ? `${typed}. ${prompt}` : prompt);
    if (ok && typed) setEditText("");
  }

  async function handleSvg() {
    if (!gen || svgBusy) return;
    setSvgBusy(true);
    try {
      const blob = await logoToSvgBlob(gen.image);
      downloadBlob(blob, `${slugify(gen.name || gen.companyName)}.svg`);
    } catch {
      toast({ variant: "destructive", title: "Couldn't vectorize this logo" });
    } finally {
      setSvgBusy(false);
    }
  }

  const editHint = !hasOwnKey
    ? credits > 0
      ? `Uses 1 of ${credits} free credit${credits === 1 ? "" : "s"} · added as a new logo`
      : "Add your API key to keep editing"
    : `~${formatUsd(PRICE_PER_AI_ASSET)} per edit · added as a new logo`;

  return (
    <Dialog open={!!gen} onOpenChange={(o) => !o && onClose()}>
      {gen && (
        <DialogContent
          ref={contentRef}
          // Radix Dialog autofocuses the first focusable child on open; here
          // that's the favorite star, and Radix Tooltip opens on focus, so the
          // "Remove from favorites" tooltip popped up unprompted every time the
          // modal opened on a favorited logo. Land focus on the dialog itself
          // instead: still inside the dialog for keyboard users, but on no
          // control, so no tooltip fires.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            contentRef.current?.focus();
          }}
          className="max-w-[min(96vw,68rem)] gap-0 overflow-hidden rounded-2xl border-border p-0 sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">
            {gen.name || gen.companyName || "Generated logo"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Large preview and actions for this generated logo, including AI
            edits.
          </DialogDescription>

          {/* Stacks + scrolls as one on mobile; splits into image | sidebar on desktop */}
          <div className="flex max-h-[92svh] flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:overflow-hidden">
            {/* Preview */}
            <div className="relative flex items-center justify-center overflow-hidden bg-muted/30 p-6 sm:p-8 lg:p-10">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(58% 58% at 50% 42%, hsl(var(--primary) / 0.10), transparent 72%)",
                }}
              />
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {imgFailed ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageOff className="size-8 opacity-60" />
                    <span className="px-6 text-center text-sm">
                      This image can&apos;t be loaded anymore.
                    </span>
                  </div>
                ) : (
                  <Image
                    src={gen.image}
                    alt={gen.companyName ? `${gen.companyName} logo` : "Logo"}
                    width={1024}
                    height={1024}
                    unoptimized
                    priority
                    onError={() => setImgFailed(true)}
                    className="h-full w-full object-contain"
                  />
                )}
                {(editing || busy) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-background/75 backdrop-blur-sm">
                    <span className="spinner-ring size-9" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {editing ? "Editing…" : "Generating…"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-5 border-t border-border bg-card p-6 lg:max-h-[92svh] lg:overflow-y-auto lg:border-l lg:border-t-0">
              {/* Title + meta */}
              <div>
                <div className="flex items-center gap-2 pr-8">
                  <Tip
                    label={
                      gen.favorite
                        ? "Remove from favorites"
                        : "Add to favorites"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(gen)}
                      aria-label={
                        gen.favorite
                          ? "Remove from favorites"
                          : "Add to favorites"
                      }
                      aria-pressed={!!gen.favorite}
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        gen.favorite
                          ? "border-amber-300/40 bg-amber-300/10 text-amber-400"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Star
                        className={cn(
                          "size-4",
                          gen.favorite && "fill-amber-400",
                        )}
                      />
                    </button>
                  </Tip>
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    aria-label="Logo name (click to rename)"
                    aria-describedby="rename-hint"
                    title="Click to rename"
                    placeholder="Untitled"
                    className="-mx-1.5 w-full truncate rounded-md bg-transparent px-1.5 py-0.5 text-xl font-bold text-foreground outline-none transition-colors hover:bg-muted/50 focus:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span id="rename-hint" className="sr-only">
                    Press Enter to save the new name.
                  </span>
                </div>
                <p className="label-eyebrow mt-1.5">
                  {typeLabel(gen.params.logoType)}
                </p>
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  <Chip title="Style">{gen.params.selectedStyle}</Chip>
                  <Chip title="Detail level">{gen.params.detailLevel}</Chip>
                  {gen.params.monochrome && <Chip>Monochrome</Chip>}
                  <ColorChip label="Brand" hex={gen.params.primaryColor} />
                  <ColorChip
                    label="Background"
                    hex={gen.params.backgroundColor}
                  />
                </div>
              </div>

              {/* Keep editing: the star */}
              <div className="rounded-2xl border border-border bg-background p-3.5">
                <div className="flex items-center gap-1.5">
                  <Wand2 className="size-3.5 text-primary" />
                  <span className="label-eyebrow text-foreground/80">
                    Keep editing
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                  Describe a tweak. AI re-works this exact logo and saves it as
                  a new version.
                </p>
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      applyEdit();
                    }
                  }}
                  placeholder="e.g. make the icon bolder, try emerald green, add a small leaf…"
                  disabled={editing}
                  rows={3}
                  aria-label="Describe an edit to this logo"
                  className="mt-2.5 min-h-[5.25rem] text-base sm:text-sm"
                />
                <div
                  role="group"
                  aria-label="Quick edits"
                  className="mt-2 flex flex-wrap gap-2"
                >
                  {["icon-name", "wordmark", "monogram", "emblem"].includes(
                    gen.params.logoType,
                  ) && (
                    <button
                      type="button"
                      disabled={editing}
                      onClick={() =>
                        applyQuick(
                          `Correct the spelling of all text so it reads exactly "${gen.companyName}". Keep the same font, weight, colors and layout. Only fix the lettering, change nothing else.`,
                        )
                      }
                      title={`Fix the spelling to read exactly "${gen.companyName}"`}
                      className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 outline-none transition-colors hover:bg-amber-400/20 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300 sm:py-1"
                    >
                      <SpellCheck className="size-3" />
                      Fix text
                    </button>
                  )}
                  {QUICK_EDITS.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      disabled={editing}
                      onClick={() => applyQuick(q.prompt)}
                      title={`Apply: ${q.prompt}`}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:py-1"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={applyEdit}
                  disabled={editing || !editText.trim()}
                  className="mt-3 w-full rounded-lg font-semibold"
                >
                  {editing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Editing…
                    </>
                  ) : (
                    <>
                      <Wand2 className="size-4" />
                      Apply edit
                    </>
                  )}
                </Button>
                <p className="mt-2 text-center text-[0.7rem] text-muted-foreground">
                  {editHint}
                </p>
              </div>

              {/* Export & more */}
              <div className="mt-auto space-y-2">
                <Button
                  onClick={() => onCreateBrandKit(gen)}
                  variant="secondary"
                  className={cn(
                    "w-full rounded-lg font-semibold",
                    hasKit &&
                      "border border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15",
                  )}
                >
                  {hasKit ? (
                    <Package className="size-4 text-primary" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {hasKit ? "Open brand kit" : "Create brand kit"}
                </Button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <PngExportMenu
                    image={gen.image}
                    filename={slugify(gen.name || gen.companyName)}
                    className="col-span-2 sm:col-span-1"
                  />
                  <Tip label="Vector SVG (auto-traced)">
                    <Button
                      variant="secondary"
                      onClick={handleSvg}
                      disabled={svgBusy}
                      className="rounded-lg"
                    >
                      {svgBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FileCode2 className="size-4" />
                      )}
                      SVG
                    </Button>
                  </Tip>
                  <Tip
                    label={
                      busy ? "Generating…" : "Regenerate from the same settings"
                    }
                  >
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onRegenerate(gen)}
                      className="rounded-lg"
                    >
                      <RefreshCw className="size-4" />
                      Redo
                    </Button>
                  </Tip>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
