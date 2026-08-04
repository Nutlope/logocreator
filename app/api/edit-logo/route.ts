import Together from "together-ai";
import { currentUser } from "@clerk/nextjs/server";
import { ipAddress } from "@vercel/functions";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { FREE_CREDITS, creditsKey } from "@/app/lib/credits";

/**
 * Image-to-image edit of an existing logo via FLUX.2-pro (image_url input).
 * Powers the brand kit's AI variants and the "keep editing" iterate flow. Uses
 * the user's own key when present, else the server key (so free-credit users
 * can edit too).
 */
export async function POST(req: Request) {
  const parsed = z
    .object({
      userAPIKey: z.string().max(200).optional(),
      // Only an inline image data URL, never an arbitrary http/file URL (which
      // the model backend would otherwise fetch server-side on our behalf).
      image: z
        .string()
        .regex(
          /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
          "Provide an image data URL.",
        ),
      prompt: z.string().max(2000),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response("Invalid edit request.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const data = parsed.data;

  // Cap payload size (~5 MB image) before forwarding it to the model.
  if (data.image.length > 7_000_000) {
    return new Response("That image is too large.", {
      status: 413,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // With Clerk configured, keyless (server-key) edits require a signed-in
  // user, the same friction as generations; BYOK works signed out.
  const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  let user = null;
  if (clerkEnabled && !data.userAPIKey) {
    user = await currentUser();
    if (!user) {
      return new Response(
        "Sign in to edit with free credits, or add your own Together AI key.",
        { status: 401, headers: { "Content-Type": "text/plain" } },
      );
    }
  }

  // In production, don't spend the owner's server key from a fully unprotected
  // deploy (no BYOK, no Clerk, no Upstash limiter). Allowed in local dev.
  const hasLimiter = !!process.env.UPSTASH_REDIS_REST_URL;
  if (
    process.env.NODE_ENV === "production" &&
    !data.userAPIKey &&
    !clerkEnabled &&
    !hasLimiter
  ) {
    return new Response("Add your own Together AI key to edit logos here.", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Keyless edits spend real money too, so they draw from the same ledger as
  // generations: a signed-in user's edit costs 1 free credit (atomic INCR,
  // refunded below if the edit fails). Without Clerk, anonymous keyless edits
  // keep the per-IP daily window so a loop can't drain the shared key.
  let remaining: number | undefined;
  let refundCredit: (() => Promise<void>) | undefined;
  if (hasLimiter && !data.userAPIKey) {
    const redis = Redis.fromEnv();
    if (user) {
      const key = creditsKey(user.id);
      const used = await redis.incr(key);
      if (used > FREE_CREDITS) {
        await redis.decr(key).catch(() => {});
        return new Response(
          "You've used your free credits. Add your own Together AI key to keep editing.",
          { status: 429, headers: { "Content-Type": "text/plain" } },
        );
      }
      remaining = FREE_CREDITS - used;
      refundCredit = async () => {
        await redis.decr(key).catch(() => {});
      };
    } else {
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(40, "1 d"),
        analytics: true,
        prefix: "logocreator-edit",
      });
      const ip = ipAddress(req) || "anonymous";
      const { success } = await ratelimit.limit(ip);
      if (!success) {
        return new Response(
          "You've hit the free edit limit for now. Add your own Together AI key to keep going.",
          { status: 429, headers: { "Content-Type": "text/plain" } },
        );
      }
    }
  }

  const apiKey = data.userAPIKey?.trim() || process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    return new Response("No API key available.", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const client = new Together({ apiKey });

  try {
    const body = {
      // FLUX.2-pro with image_url: bake-off verified 2026-07-13 that it
      // actually APPLIES instructed edits (all-caps text, recolors, lockup
      // re-arrangements, non-square sizes) while FLUX.1-kontext pro AND max
      // returned the input essentially unchanged on Together. Cheaper too
      // ($0.03 vs $0.04 per image).
      model: "black-forest-labs/FLUX.2-pro",
      prompt: data.prompt,
      image_url: data.image,
      width: Math.min(1536, Math.max(64, Math.round(data.width ?? 1024))),
      height: Math.min(1536, Math.max(64, Math.round(data.height ?? 1024))),
      response_format: "base64" as const,
    };
    const response = await client.images.generate(body);
    return Response.json(
      { ...response.data[0], ...(remaining !== undefined ? { remaining } : {}) },
      { status: 200 },
    );
  } catch (error) {
    // The edit never materialized, so the credit it reserved goes back.
    if (refundCredit) await refundCredit();
    const invalidApiKey = z
      .object({
        error: z.object({
          error: z.object({ code: z.literal("invalid_api_key") }),
        }),
      })
      .safeParse(error);
    if (invalidApiKey.success) {
      return new Response("Your API key is invalid.", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });
    }
    // Generic failure: the brand kit treats these as skippable; the edit flow
    // surfaces the text in a toast.
    return new Response("Couldn't apply that edit. Try again.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

export const runtime = "edge";
