"use client";

/**
 * Last-resort boundary for a throw in the root layout itself. It replaces the
 * whole document (so it must render its own html/body and cannot rely on the
 * app's CSS), hence the inline styles.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#100f0d",
          color: "#f5f4ef",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h2>
        <p style={{ maxWidth: "24rem", fontSize: "0.875rem", opacity: 0.7, margin: 0 }}>
          The app hit an unexpected error. Reload to try again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: "0.5rem",
            border: "1px solid #3a3a38",
            background: "transparent",
            color: "inherit",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
