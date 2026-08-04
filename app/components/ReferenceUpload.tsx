"use client";

import { useRef, type DragEvent } from "react";
import { ImagePlus, X } from "lucide-react";

export type ReferenceState = {
  dataUrl: string;
  description: string;
  styleGuess: string | null;
  dominantColor: string;
  keywords?: string[];
};

export type ReferenceStatus = "idle" | "reading" | "ready" | "error";

export default function ReferenceUpload({
  value,
  status,
  onFile,
  onClear,
}: {
  value: ReferenceState | null;
  status: ReferenceStatus;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        aria-label="Upload a reference logo"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {!value && status === "reading" ? (
        // The file was just picked: the bytes are still being read/rasterized,
        // so show the busy state instantly instead of a silent idle dropzone
        // (which reads as "nothing happened" and invites a second click).
        <div className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-dashed border-border bg-background px-3 py-6 text-center">
          <span className="spinner-ring size-4" />
          <span className="text-sm font-medium text-muted-foreground">
            Preparing your reference…
          </span>
        </div>
      ) : !value ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background px-3 py-5 text-center transition-colors hover:border-foreground/30"
        >
          <ImagePlus className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Upload reference
          </span>
          <span className="text-xs text-muted-foreground">
            PNG, JPG, WebP or SVG · up to 5 MB
          </span>
        </button>
      ) : (
        <div className="flex gap-3 rounded-xl border border-border bg-background p-3">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.dataUrl}
              alt="Reference"
              className="size-full object-contain"
            />
            {status === "reading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <span className="spinner-ring size-5" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              {/* aria-live so screen readers hear reading → detected/error too */}
              <span className="label-eyebrow" aria-live="polite">
                {status === "reading"
                  ? "Reading…"
                  : status === "error"
                    ? "Couldn't read"
                    : "Detected"}
              </span>
              <button
                type="button"
                onClick={onClear}
                aria-label="Remove reference"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {status === "ready" && (
              <>
                {value.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {value.description}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {value.styleGuess && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-medium text-foreground">
                      {value.styleGuess}
                    </span>
                  )}
                  {value.dominantColor !== "auto" && (
                    <span className="flex items-center gap-1 text-[0.6875rem] uppercase text-muted-foreground">
                      <span
                        className="size-3 rounded-full ring-1 ring-foreground/15"
                        style={{ backgroundColor: value.dominantColor }}
                      />
                      {value.dominantColor}
                    </span>
                  )}
                </div>
              </>
            )}
            {status === "reading" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Reading your reference…
              </p>
            )}
            {status === "error" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Reading needs chat access on your Together plan. Try another
                image, or just describe it in the box above.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
