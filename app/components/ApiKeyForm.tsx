"use client";

import { Input } from "@/app/components/ui/input";

/**
 * The shared Together API-key field + "get a free key" link, reused by
 * ApiKeyDialog and the WelcomeModal so both look and behave identically.
 * Controlled: the parent owns the draft value and the save action.
 */
export default function ApiKeyForm({
  value,
  onChange,
  onSubmit,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <Input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Paste your API key"
        aria-label="Together AI API key"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
      />
      <a
        href="https://api.together.xyz/settings/api-keys"
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
      >
        Get a free key from Together AI →
      </a>
    </div>
  );
}
