"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The LogoCreator mark: two offset rounded "canvases" (the act of generating
 * logo variations) on a smooth brand gradient, with a soft lens dot. The
 * gradient is self-contained, so the mark stays clean and identical in both
 * light and dark, instead of going heavy-black in light mode.
 */
export function LogoMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const grad = `lcg-${uid}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={grad}
          x1="9"
          y1="9"
          x2="28"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7E8BF6" />
          <stop offset="1" stopColor="#4D5DE2" />
        </linearGradient>
        <linearGradient
          id={`${grad}-b`}
          x1="4"
          y1="4"
          x2="21"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#C7CEFB" />
          <stop offset="1" stopColor="#A2AEF7" />
        </linearGradient>
      </defs>
      {/* Back canvas: a lighter echo peeking top-left (the "variations" stack) */}
      <rect
        x="4"
        y="4"
        width="17"
        height="17"
        rx="5.4"
        fill={`url(#${grad}-b)`}
      />
      {/* Front canvas: the gradient */}
      <rect
        x="11"
        y="11"
        width="17"
        height="17"
        rx="5.4"
        fill={`url(#${grad})`}
      />
      {/* Spark: the "create with AI" motif, echoing the app's sparkle */}
      <path
        d="M19.5 15.4c.27 2.12 1.49 3.34 3.6 3.6-2.11.27-3.33 1.49-3.6 3.6-.27-2.11-1.49-3.33-3.6-3.6 2.11-.26 3.33-1.48 3.6-3.6Z"
        fill="#fff"
        fillOpacity="0.95"
      />
    </svg>
  );
}

export default function Logo({
  className,
  markClassName,
  wordmark = true,
}: {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex select-none items-center gap-2.5", className)}
    >
      <LogoMark className={cn("size-7 shrink-0", markClassName)} />
      {wordmark && (
        <span className="text-[1.0625rem] font-bold leading-none tracking-[-0.02em] text-foreground">
          LogoCreator
        </span>
      )}
    </span>
  );
}
