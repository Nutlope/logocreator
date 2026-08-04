import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/app/components/ui/toaster";
import { TooltipProvider } from "@/app/components/ui/tooltip";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import AuthProvider from "@/app/components/AuthProvider";

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Satoshi-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Satoshi-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const title = "LogoCreator: Generate a logo in seconds";
const description =
  "Create a clean, professional logo for your brand in seconds. Free and open source.";
const canonicalUrl = "https://www.logo-creator.io/";
const sitename = "LogoCreator";

// Resolve the OG/Twitter card image against the origin actually serving THIS
// build, not a hardcoded canonical domain. Pointing the card at
// logo-creator.io from a preview or fork deploy tells scrapers to fetch it from
// the live production site, which still hosts the old pre-redesign image — that
// is exactly why a stale OG kept unfurling on shared preview links. In
// production we use the project's stable production domain; on previews, the
// deploy's own URL; locally, the canonical domain (nothing scrapes localhost).
const deployOrigin =
  process.env.VERCEL_ENV === "production" &&
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : canonicalUrl;

// The ?v= tag busts the social scrapers' image cache. Slack/X/Facebook key
// their stored thumbnail on the exact image URL, so an unchanged og-image.png
// filename would keep serving the card they scraped before the redesign. Bump
// this whenever the card art changes.
const ogimage = new URL("/og-image.png?v=2", deployOrigin).toString();

export const metadata: Metadata = {
  metadataBase: new URL(deployOrigin),
  title,
  description,
  // Canonical stays the production domain for SEO, even when the card image is
  // served from a preview/fork origin.
  alternates: { canonical: canonicalUrl },
  openGraph: {
    images: [{ url: ogimage, width: 1200, height: 630, alt: title }],
    title,
    description,
    url: canonicalUrl,
    siteName: sitename,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: [ogimage],
    title,
    description,
  },
};

// viewport-fit=cover lets env(safe-area-inset-*) resolve to real values on
// notched/gesture phones (otherwise they're 0); themeColor tints the mobile
// browser chrome to match the app's light/dark background.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0b" },
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {/* AuthProvider sits inside ThemeProvider so Clerk's modals follow
              the app theme; it renders children untouched without Clerk keys. */}
          <AuthProvider>
            <TooltipProvider delayDuration={200} skipDelayDuration={300}>
              {children}
            </TooltipProvider>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
