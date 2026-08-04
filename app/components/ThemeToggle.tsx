"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Tip } from "@/app/components/ui/tooltip";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch: render a stable placeholder until mounted.
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Tip
      label={!mounted ? "Theme" : isDark ? "Light mode" : "Dark mode"}
      side="bottom"
    >
      <button
        type="button"
        aria-label={
          !mounted
            ? "Toggle theme"
            : isDark
              ? "Switch to light mode"
              : "Switch to dark mode"
        }
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="group relative flex size-10 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-9"
      >
        {mounted && (
          <>
            <SunIcon
              className={`absolute size-[1.05rem] transition-all duration-300 ${
                isDark
                  ? "-rotate-90 scale-0 opacity-0"
                  : "rotate-0 scale-100 opacity-100"
              }`}
            />
            <MoonIcon
              className={`absolute size-[1.05rem] transition-all duration-300 ${
                isDark
                  ? "rotate-0 scale-100 opacity-100"
                  : "rotate-90 scale-0 opacity-0"
              }`}
            />
          </>
        )}
      </button>
    </Tip>
  );
}
