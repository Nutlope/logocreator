"use client";

/**
 * Route-level error boundary: a render-time throw anywhere in the page now shows
 * this recoverable panel instead of a blank white screen (and the user's saved
 * logos, which live in IndexedDB, survive). Renders inside the root layout, so
 * the theme + fonts are available.
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
      <p className="max-w-sm text-pretty text-sm text-muted-foreground">
        The app hit an unexpected error. Your saved logos are stored on this
        device and should still be here.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Try again
      </button>
    </div>
  );
}
