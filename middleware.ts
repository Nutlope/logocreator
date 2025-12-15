import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, NextFetchEvent } from "next/server";
import type { NextRequest } from "next/server";
import { parseFeatureFlagEnvVar } from "@/app/lib/feature-flags";

export default async function middleware(
  req: NextRequest,
  evt: NextFetchEvent,
) {
  const country = req.geo?.country;
  // Check for Russian traffic first as there's too much spam from Russia
  if (country === "RU") {
    return new NextResponse("Access Denied", { status: 403 });
  }

  // Check if AUTH feature flag is enabled
  const featureFlags = parseFeatureFlagEnvVar();
  const isAuthEnabled = featureFlags['AUTH'] ?? true; // Default to true for safety

  // Only apply Clerk middleware if authentication is enabled
  if (isAuthEnabled) {
    return clerkMiddleware()(req, evt);
  }

  // If auth is disabled, allow the request to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
