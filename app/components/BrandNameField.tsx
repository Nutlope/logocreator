"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Globe, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Tip } from "./ui/tooltip";

export type BrandImportResult = {
  name?: string | null;
  themeColor?: string | null;
  logoDataUrl?: string | null;
  source: string;
};

export type ImportedBrand = {
  source: string;
  color: string;
  name?: string | null;
  logo?: string | null;
  palette?: string[];
};

function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// A calm, confident ease for the in-place morph between name ⇄ import.
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The Company name field, with "start from your brand" folded in. It's normally
 * a plain (slightly narrowed) name input with a quiet "From website" affordance
 * on the right; tapping it morphs the SAME field into a URL importer that pulls
 * the company's name AND brand color (or upload a logo to match its colors).
 * After an import it morphs back, name filled, with a color dot that re-opens
 * the detected palette. No vision model, no credits.
 *
 * One persistent <input> serves both modes (its value/placeholder/handlers just
 * switch) so the morph never mounts/unmounts the field: focus and caret carry
 * across, and there's no presence-tracking state to wedge. Only the small
 * leading/trailing ornaments cross-fade.
 */
export default function BrandNameField({
  companyName,
  onCompanyNameChange,
  onResult,
  imported,
  onClear,
  onPickColor,
  disabled,
}: {
  companyName: string;
  onCompanyNameChange: (v: string) => void;
  onResult: (r: BrandImportResult) => void | Promise<void>;
  imported: ImportedBrand | null;
  onClear: () => void;
  onPickColor: (hex: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<"name" | "url">("name");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState<false | "url" | "file">(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = disabled || loading !== false;
  const isUrl = mode === "url";

  // Close the color picker on outside click / Escape.
  useEffect(() => {
    if (!pickOpen) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setPickOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setPickOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickOpen]);

  // A short brand-color flash on the field border, confirming the match landed.
  function flashPulse() {
    setPulse(true);
    window.setTimeout(() => setPulse(false), 720);
  }

  function openImport() {
    if (busy) return;
    setUrl("");
    setPickOpen(false);
    setMode("url");
    // Same element, just re-aimed at the URL; move the caret into it.
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function cancelImport() {
    setMode("name");
    setUrl("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function finishImport() {
    setUrl("");
    setMode("name");
    flashPulse();
  }

  async function importUrl() {
    const u = url.trim();
    if (!u || busy) return;
    setLoading("url");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch("/api/import-brand", {
        method: "POST",
        body: JSON.stringify({ url: u }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        toast({
          variant: "destructive",
          title: "Couldn't import that site",
          description: msg || "Try another URL, or upload your logo instead.",
        });
        return;
      }
      const data = await res.json();
      await onResult({
        name: data.name,
        themeColor: data.themeColor,
        logoDataUrl: data.logoDataUrl,
        source: data.sourceUrl || u,
      });
      finishImport();
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      toast({
        variant: "destructive",
        title: "Couldn't import that site",
        description: aborted
          ? "That site took too long. Try another URL or upload your logo."
          : "Check the URL and try again.",
      });
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  async function importFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Use an image file",
        description: "PNG, JPG, SVG or WebP.",
      });
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast({ variant: "destructive", title: "That image is too large" });
      return;
    }
    setLoading("file");
    try {
      const dataUrl = await Promise.race([
        new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error("read"));
          fr.readAsDataURL(file);
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 10_000),
        ),
      ]);
      await onResult({
        logoDataUrl: dataUrl,
        source: file.name.replace(/\.[^.]+$/, "") || "your logo",
      });
      finishImport();
    } catch {
      toast({ variant: "destructive", title: "Couldn't read that image" });
    } finally {
      setLoading(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isUrl) return; // name mode: let Enter submit the form as usual
    if (e.key === "Enter") {
      e.preventDefault();
      importUrl();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelImport();
    }
  }

  const urlHost = url
    .trim()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  // Which trailing control to show (also the cross-fade key).
  const trailing = isUrl ? "import" : imported ? "brand" : "from-web";

  return (
    <div>
      {/* Label morphs with the mode so it always describes the field. */}
      <div className="mb-2 h-4 overflow-hidden">
        <motion.span
          key={isUrl ? "url" : "name"}
          className="label-eyebrow block"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          {isUrl ? "Start from your website" : "Company name"}
        </motion.span>
      </div>

      <div className="relative">
        {/* Brand-color pulse ring on a successful match. The keyframe ends at
            opacity 0 and `pulse` clears itself after 720ms, so no exit needed. */}
        {pulse && imported && (
          <motion.span
            key="pulse"
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 rounded-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0] }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            style={{ boxShadow: `0 0 0 2px ${imported.color}` }}
          />
        )}

        <div
          className={cn(
            "relative flex h-11 items-center gap-2 rounded-lg border bg-background pl-3 pr-1.5 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
            isUrl ? "border-primary/50" : "border-input",
          )}
        >
          {/* Leading slot: globe in import mode, brand marker once imported.
              A plain keyed motion element (no AnimatePresence) just fades in on
              change; nothing to wedge, and it never pushes the layout. */}
          {(isUrl || imported) && (
            <motion.span
              key={isUrl ? "globe" : "brand-mark"}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="flex shrink-0"
            >
              {isUrl ? (
                <Globe className="size-4 text-primary" />
              ) : imported!.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imported!.logo}
                  alt=""
                  className="size-6 rounded-md bg-background object-contain p-0.5 ring-1 ring-border"
                />
              ) : (
                <span
                  className="size-2.5 rounded-full ring-1 ring-foreground/20"
                  style={{ backgroundColor: imported!.color }}
                />
              )}
            </motion.span>
          )}

          {/* The one persistent field, re-aimed at name or URL by `mode`. */}
          <input
            ref={inputRef}
            id={isUrl ? "brand-url" : "company-name"}
            value={isUrl ? url : companyName}
            onChange={(e) =>
              isUrl
                ? setUrl(e.target.value)
                : onCompanyNameChange(e.target.value)
            }
            onKeyDown={onInputKeyDown}
            placeholder={isUrl ? "yourcompany.com" : "Solstice Coffee"}
            required={!isUrl}
            disabled={disabled || (isUrl && loading !== false)}
            inputMode={isUrl ? "url" : undefined}
            autoCapitalize={isUrl ? "off" : undefined}
            autoCorrect={isUrl ? "off" : undefined}
            spellCheck={isUrl ? false : undefined}
            aria-label={isUrl ? "Your website URL" : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[0.9375rem]"
          />

          {/* Trailing slot: From website ▸ Import ▸ brand dot + clear. Keyed
              fade-in (no AnimatePresence) so the swap can't wedge or jump. */}
          <div className="flex shrink-0 items-center">
            <motion.div
              key={trailing}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="flex items-center"
            >
              {trailing === "import" ? (
                <button
                  type="button"
                  onClick={importUrl}
                  disabled={busy || !url.trim()}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-semibold text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading === "url" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      Import
                      <ArrowRight className="size-3.5" />
                    </>
                  )}
                </button>
              ) : trailing === "brand" && imported ? (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setPickOpen((o) => !o)}
                    aria-label="Pick brand color from detected palette"
                    aria-haspopup="dialog"
                    aria-expanded={pickOpen}
                    title={`Brand color ${imported.color} (click to re-pick)`}
                    className="flex size-8 items-center justify-center rounded-md outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="size-5 rounded-full ring-1 ring-foreground/20"
                      style={{ backgroundColor: imported.color }}
                    />
                  </button>
                  <Tip label="Remove imported brand" side="top">
                    <button
                      type="button"
                      onClick={() => {
                        setPickOpen(false);
                        onClear();
                      }}
                      aria-label="Remove imported brand"
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3.5" />
                    </button>
                  </Tip>
                </div>
              ) : (
                <Tip
                  label="Auto-fill the name & brand color from your site"
                  side="top"
                >
                  <button
                    type="button"
                    onClick={openImport}
                    disabled={busy}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <Globe className="size-3.5 shrink-0" />
                    <span className="whitespace-nowrap">From website</span>
                  </button>
                </Tip>
              )}
            </motion.div>
          </div>
        </div>

        {/* Detected-palette picker, anchored to the field. */}
        {pickOpen &&
          imported &&
          imported.palette &&
          imported.palette.length > 0 && (
            <div
              ref={popRef}
              role="dialog"
              aria-label="Detected brand colors"
              className="absolute right-0 top-[3.25rem] z-50 w-48 rounded-xl border border-border bg-popover p-2.5 shadow-xl"
            >
              <span className="label-eyebrow mb-2 block">Detected colors</span>
              <div className="grid grid-cols-6 gap-1.5">
                {imported.palette.map((hex) => {
                  const selected =
                    hex.toLowerCase() === imported.color.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      aria-label={hex}
                      onClick={() => {
                        onPickColor(hex);
                        setPickOpen(false);
                      }}
                      style={{ backgroundColor: hex }}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-full ring-offset-1 ring-offset-popover",
                        selected
                          ? "ring-2 ring-foreground"
                          : "ring-1 ring-foreground/15 hover:ring-foreground/50",
                      )}
                    >
                      {selected && (
                        <Check
                          strokeWidth={3.5}
                          className={cn(
                            "size-3",
                            isLight(hex) ? "text-black/70" : "text-white",
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPickOpen(false);
                  openImport();
                }}
                className="mt-2.5 flex w-full items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Globe className="size-3" />
                Import a different site
              </button>
            </div>
          )}
      </div>

      {/* Import-mode helper row: progress, or the upload + cancel fallbacks.
          Enter-only (no exit) so it can never wedge mid-collapse; leaving import
          mode unmounts it at once, under the cover of the field's own morph. */}
      {isUrl && (
        <motion.div
          key="helper"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.18, ease: EASE }}
          className="overflow-hidden"
        >
          <div className="mt-1.5 flex items-center gap-2.5 text-xs text-muted-foreground">
            {loading === "url" ? (
              <span aria-live="polite" className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Reading {urlHost || "your site"}…
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="flex items-center gap-1 rounded outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {loading === "file" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Upload className="size-3" />
                  )}
                  Upload a logo instead
                </button>
                <span aria-hidden className="text-border">
                  ·
                </span>
                <button
                  type="button"
                  onClick={cancelImport}
                  className="rounded outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        aria-label="Upload your logo"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
