"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const AUTO_COLOR = "auto";

type Swatch = { name: string; color: string };

// A curated brand-color grid for the "+" popover (more than fits in the row).
const PALETTE: string[] = [
  "#2F6FF5",
  "#19337A",
  "#0EA5E9",
  "#14B8A6",
  "#30A46C",
  "#84CC16",
  "#F2C40F",
  "#E2682A",
  "#E5484D",
  "#D9488C",
  "#7C4DFF",
  "#9333EA",
  "#0F172A",
  "#475569",
  "#9CA3AF",
  "#FFFFFF",
];

// Perceived lightness, to choose a legible check-mark color on each swatch.
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toUpperCase()}` : null;
}

export default function ColorSwatches({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: Swatch[];
  value: string;
  onChange: (hex: string) => void;
}) {
  const isAuto = value === AUTO_COLOR;
  const v = value.toLowerCase();
  const matchedPreset = presets.some((p) => p.color.toLowerCase() === v);
  const customSelected = !isAuto && !matchedPreset;

  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState("");
  const [hexError, setHexError] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close the popover; optionally hand focus back to the "+" trigger (Escape
  // and pick-a-color do, a plain outside click must not steal pointer focus).
  function close(restoreFocus: boolean) {
    setOpen(false);
    setHexError(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function pick(hex: string) {
    onChange(hex);
    close(true);
  }

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHexError(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setHexError(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Keep keyboard focus inside the open popover (it's aria-modal).
  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const root = popRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled"));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const ring =
    "ring-offset-2 ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="min-w-0">
      <span id={`swatches-${label}`} className="label-eyebrow mb-2 block">
        {label}
      </span>
      {/* Exactly one color is active at a time → radio semantics, not toggles. */}
      <div
        role="radiogroup"
        aria-labelledby={`swatches-${label}`}
        className="flex items-center gap-2"
      >
        {/* Auto: let the AI choose a fitting color */}
        <button
          type="button"
          role="radio"
          title="Auto: let AI choose"
          aria-label={`Auto ${label.toLowerCase()}: let AI choose`}
          aria-checked={isAuto}
          onClick={() => onChange(AUTO_COLOR)}
          className={cn(
            "relative flex size-7 items-center justify-center rounded-full bg-secondary before:absolute before:-inset-y-2 before:content-['']",
            ring,
            isAuto
              ? "ring-2 ring-foreground"
              : "ring-1 ring-foreground/30 hover:ring-foreground/55",
          )}
        >
          <Sparkles
            className={cn(
              "size-3.5",
              isAuto ? "text-foreground" : "text-muted-foreground",
            )}
          />
        </button>

        {presets.map((swatch) => {
          const selected = swatch.color.toLowerCase() === v;
          return (
            <button
              key={swatch.name}
              type="button"
              role="radio"
              title={swatch.name}
              aria-label={swatch.name}
              aria-checked={selected}
              onClick={() => onChange(swatch.color)}
              style={{ backgroundColor: swatch.color }}
              className={cn(
                "relative flex size-7 items-center justify-center rounded-full before:absolute before:-inset-y-2 before:content-['']",
                ring,
                selected
                  ? "ring-2 ring-foreground"
                  : "ring-1 ring-foreground/30 hover:ring-foreground/55",
              )}
            >
              {selected && (
                <Check
                  strokeWidth={3.5}
                  className={cn(
                    "size-3.5",
                    isLight(swatch.color) ? "text-black/70" : "text-white",
                  )}
                />
              )}
            </button>
          );
        })}

        {/* Custom: opens a popover with a curated grid + hex input */}
        <div className="relative" ref={popRef}>
          <button
            ref={triggerRef}
            type="button"
            title="More colors"
            aria-label={
              customSelected
                ? `Custom ${label.toLowerCase()} ${value.toUpperCase()} selected, pick another`
                : `Pick a custom ${label.toLowerCase()}`
            }
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => {
              setHexDraft(
                customSelected ? value.replace(/^#/, "").toUpperCase() : "",
              );
              setHexError(false);
              setOpen((o) => !o);
            }}
            className={cn(
              "relative flex size-7 items-center justify-center overflow-hidden rounded-full before:absolute before:-inset-y-2 before:content-['']",
              ring,
              customSelected
                ? "ring-2 ring-foreground"
                : "ring-1 ring-foreground/30 hover:ring-foreground/55",
            )}
            style={customSelected ? { backgroundColor: value } : undefined}
          >
            {customSelected ? (
              <Check
                strokeWidth={3.5}
                className={cn(
                  "size-3.5",
                  isLight(value) ? "text-black/70" : "text-white",
                )}
              />
            ) : (
              <Plus className="size-3.5 text-muted-foreground" />
            )}
          </button>

          {open && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${label} colors`}
              onKeyDown={trapTab}
              // Right-anchored (the trigger is the right-most swatch) + width
              // capped to the viewport so it never spills off a phone screen.
              className="absolute right-0 top-9 z-50 w-[min(14rem,calc(100vw-2.5rem))] rounded-xl border border-border bg-popover p-3 shadow-xl"
            >
              <div
                role="radiogroup"
                aria-label={`${label} palette`}
                className="grid grid-cols-8 gap-1.5"
              >
                {PALETTE.map((hex) => {
                  const selected = hex.toLowerCase() === v;
                  return (
                    <button
                      key={hex}
                      type="button"
                      role="radio"
                      title={hex}
                      aria-label={hex}
                      aria-checked={selected}
                      onClick={() => pick(hex)}
                      style={{ backgroundColor: hex }}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full ring-offset-1 ring-offset-popover",
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

              <div className="mt-3 flex items-center gap-2">
                <div
                  className={cn(
                    "flex flex-1 items-center rounded-lg border bg-background px-2",
                    hexError ? "border-destructive" : "border-input",
                  )}
                >
                  <span className="text-sm text-muted-foreground">#</span>
                  <input
                    value={hexDraft}
                    onChange={(e) => {
                      // Store uppercased so the value matches what the CSS
                      // uppercase transform displays (copy/paste, SR output).
                      setHexDraft(
                        e.target.value
                          .replace(/[^0-9a-fA-F]/g, "")
                          .slice(0, 6)
                          .toUpperCase(),
                      );
                      setHexError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const norm = normalizeHex(hexDraft);
                        if (norm) pick(norm);
                        else setHexError(true);
                      }
                    }}
                    placeholder="2F6FF5"
                    aria-label={`${label} hex code`}
                    aria-invalid={hexError}
                    aria-describedby={
                      hexError ? `hex-error-${label}` : undefined
                    }
                    autoFocus
                    className="w-full bg-transparent py-1.5 text-base uppercase outline-none placeholder:text-muted-foreground/60 sm:text-sm"
                  />
                </div>
                <label
                  title="System color picker"
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-input ring-offset-2 ring-offset-popover focus-within:ring-2 focus-within:ring-ring"
                  style={{
                    background:
                      "conic-gradient(from 90deg, #ff5d5d, #f6c544, #36c46a, #2f6ff5, #a855f7, #ff5d5d)",
                  }}
                >
                  <input
                    type="color"
                    value={customSelected ? value : "#2F6FF5"}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label={`System ${label.toLowerCase()} picker`}
                    className="absolute size-0 opacity-0"
                  />
                </label>
              </div>
              {hexError && (
                <p
                  id={`hex-error-${label}`}
                  role="alert"
                  className="mt-1.5 text-[0.7rem] font-medium text-destructive"
                >
                  Enter a 3 or 6 digit hex, then press Enter.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
