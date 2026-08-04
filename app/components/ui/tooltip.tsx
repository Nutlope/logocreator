"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    /** Render the little pointer arrow (default true). */
    arrow?: boolean;
  }
>(({ className, sideOffset = 6, arrow = true, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        // High-contrast inverted chip: pops in either theme.
        "z-[70] max-w-xs select-none rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background shadow-lg shadow-black/25",
        // Fast, smooth enter/exit from the trigger.
        "origin-[var(--radix-tooltip-content-transform-origin)] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
        className,
      )}
      {...props}
    >
      {children}
      {arrow && (
        <TooltipPrimitive.Arrow
          className="fill-foreground"
          width={11}
          height={5}
        />
      )}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Convenience wrapper for the common case: `<Tip label="Download">{button}</Tip>`.
 * Wraps a single element as the trigger. Use it on icon-only buttons that need
 * a quick hover hint. Renders nothing extra when `label` is empty.
 */
function Tip({
  label,
  side = "top",
  sideOffset,
  children,
}: {
  label: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  children: React.ReactNode;
}) {
  if (!label) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={sideOffset}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
