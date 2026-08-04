import { currentUser } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { FREE_CREDITS, creditsKey } from "@/app/lib/credits";

/**
 * Server-truth read of the signed-in user's free-credit balance (the Upstash
 * ledger the generate/edit routes spend from). `remaining: null` means there
 * is nothing trustworthy to show: signed out, auth disabled, or no Upstash
 * configured (in which case nothing is being metered anyway).
 */
export async function GET() {
  const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!clerkEnabled) {
    return Response.json({ enabled: false, remaining: null });
  }
  const user = await currentUser();
  if (!user || !process.env.UPSTASH_REDIS_REST_URL) {
    return Response.json({ enabled: true, remaining: null });
  }
  try {
    const used = Number(
      (await Redis.fromEnv().get(creditsKey(user.id))) ?? 0,
    );
    return Response.json({
      enabled: true,
      remaining: Math.max(0, FREE_CREDITS - (Number.isFinite(used) ? used : 0)),
    });
  } catch {
    // Redis hiccup: report "unknown" rather than failing the page.
    return Response.json({ enabled: true, remaining: null });
  }
}

export const runtime = "edge";
