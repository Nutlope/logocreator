import { clerkMiddleware } from "@clerk/nextjs/server";
import { geolocation } from "@vercel/functions";
import { NextResponse, NextFetchEvent } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 renamed the "middleware" file convention to "proxy": same runtime
// and matcher semantics, minus the deprecation warning at boot.
export default async function proxy(req: NextRequest, evt: NextFetchEvent) {
  // `req.geo` was removed from NextRequest in Next 15; read it from the Vercel
  // edge geolocation helper instead (country is undefined off-Vercel, fine here).
  const { country } = geolocation(req);
  // Check for Russian traffic first as there's too much spam from Russia
  if (country === "RU") {
    return new NextResponse("Access Denied", { status: 403 });
  }

  // If not from Russia, proceed with Clerk authentication.
  // Dev fallback: with no Clerk key set, skip auth so the app renders.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return NextResponse.next();
  }
  return clerkMiddleware()(req, evt);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
