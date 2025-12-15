import type { Metadata } from "next";
import { Jura } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/app/components/providers/ClientProviders";
import { parseFeatureFlagEnvVar, DEFAULT_FLAGS } from "@/app/lib/feature-flags";

const jura = Jura({
  subsets: ["latin"],
  variable: "--font-jura",
});

const title = "Logo-creator.io – Generate a logo";
const description = "Generate a logo for your company";
const url = "https://www.logo-creator.io/";
const ogimage = "https://www.logo-creator.io/og-image.png";
const sitename = "logo-creator.io";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title,
  description,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    images: [ogimage],
    title,
    description,
    url: url,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Parse feature flags from environment
  const envFlags = parseFeatureFlagEnvVar();
  const featureFlags = Object.fromEntries(
    Object.entries(DEFAULT_FLAGS).map(([key, flag]) => [
      key,
      envFlags[key] ?? flag.enabled
    ])
  );

  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body
        className={`${jura.variable} dark min-h-full bg-[#343434] font-jura antialiased`}
      >
        <ClientProviders featureFlags={featureFlags}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
