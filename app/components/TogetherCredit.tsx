/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/** "Powered by" + the official together.ai lockup (dark on light theme, white on dark). */
export default function TogetherCredit({ className }: { className?: string }) {
  return (
    <a
      href="https://togetherai.link/?utm_source=logocreator&utm_medium=referral&utm_campaign=example-app"
      target="_blank"
      rel="noreferrer"
      aria-label="Powered by Together AI"
      className={cn("inline-flex select-none items-center gap-2", className)}
    >
      <span className="text-xs text-muted-foreground">Powered by</span>
      <img
        src="/together-logo-light.png"
        alt="Together AI"
        className="h-[1.15rem] w-auto dark:hidden"
      />
      <img
        src="/together-logo-dark.png"
        alt="Together AI"
        className="hidden h-[1.15rem] w-auto dark:block"
      />
    </a>
  );
}
