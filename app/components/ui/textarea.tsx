import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // 16px on phones (text-base) so iOS Safari doesn't auto-zoom on focus;
        // back to the tighter 15px from sm+ where zoom isn't a concern.
        "flex min-h-[76px] w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-base transition-colors placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 sm:text-[0.9375rem]",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
