import { currentUser } from "@clerk/nextjs/server";
import { ipAddress } from "@vercel/functions";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import dedent from "dedent";
import Together from "together-ai";
import { z } from "zod";
import { FREE_CREDITS, creditsKey } from "@/app/lib/credits";
import { generateAtlasCloudLogo } from "./atlascloud";

// Nearest human color name for a hex: the model honors "blue (#2F6FF5)" far
// more reliably than a bare hex, and this also covers custom-picked colors.
const NAMED_COLORS: [string, [number, number, number]][] = [
  ["white", [255, 255, 255]],
  ["black", [18, 18, 17]],
  ["gray", [128, 128, 128]],
  ["light gray", [201, 200, 194]],
  ["dark gray", [60, 60, 58]],
  ["red", [229, 72, 77]],
  ["crimson", [160, 24, 44]],
  ["orange", [240, 140, 30]],
  ["amber", [242, 180, 20]],
  ["yellow", [242, 196, 15]],
  ["lime", [140, 200, 40]],
  ["green", [48, 164, 108]],
  ["emerald", [10, 130, 90]],
  ["teal", [20, 160, 160]],
  ["cyan", [40, 200, 220]],
  ["sky blue", [90, 170, 240]],
  ["blue", [47, 111, 245]],
  ["navy", [25, 45, 120]],
  ["indigo", [79, 70, 200]],
  ["purple", [150, 70, 210]],
  ["violet", [180, 100, 230]],
  ["magenta", [210, 60, 180]],
  ["pink", [240, 130, 180]],
  ["brown", [140, 90, 50]],
];

function colorName(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  let best = NAMED_COLORS[0][0];
  let bestD = Infinity;
  for (const [name, [nr, ng, nb]] of NAMED_COLORS) {
    const d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export async function POST(req: Request) {
  const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const user = clerkEnabled ? await currentUser() : null;

  const parsed = z
    .object({
      userAPIKey: z.string().max(200).optional(),
      companyName: z.string().max(120),
      selectedStyle: z.string().max(40),
      logoType: z.string().max(40).optional(),
      primaryColor: z.string().max(40),
      backgroundColor: z.string().max(40),
      detailLevel: z.string().max(40).optional(),
      monochrome: z.boolean().optional(),
      additionalInfo: z.string().max(1500).optional(),
      referenceDescription: z.string().max(600).optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response("Invalid request. Please refresh and try again.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const data = parsed.data;
  const userAPIKey = data.userAPIKey?.trim();

  // With Clerk configured, the free (server-key) credits sit behind sign-in:
  // that friction keeps an anonymous loop from draining a paid image model.
  // Bringing your own key still works signed out; you spend your own money.
  if (clerkEnabled && !user && !userAPIKey) {
    return new Response(
      "Sign in to use your free credits, or add your own Together AI key.",
      { status: 401, headers: { "Content-Type": "text/plain" } },
    );
  }

  // In production, never spend the owner's server key from a fully unprotected
  // deploy: with no BYOK key, no Clerk identity, and no Upstash limiter, an
  // anonymous caller could drain it without limit. Require the caller's own key
  // in that case. (Skipped in local dev so a server key in .env.local works.)
  const hasLimiter = !!process.env.UPSTASH_REDIS_REST_URL;
  if (
    process.env.NODE_ENV === "production" &&
    !userAPIKey &&
    !clerkEnabled &&
    !hasLimiter
  ) {
    return new Response(
      "Add your own Together AI key to generate logos here.",
      { status: 401, headers: { "Content-Type": "text/plain" } },
    );
  }

  const imageProvider = process.env.IMAGE_PROVIDER?.toLowerCase() ?? "together";
  // A browser-provided key is a Together key throughout the v2 app (editing,
  // reference reading and brand kits use it too), so BYOK requests stay on
  // Together even when server-backed generation is routed through Atlas Cloud.
  const useAtlasCloud = imageProvider === "atlascloud" && !userAPIKey;
  const apiKey =
    userAPIKey ||
    (useAtlasCloud
      ? process.env.ATLASCLOUD_API_KEY?.trim()
      : process.env.TOGETHER_API_KEY?.trim());
  if (!apiKey) {
    return new Response(
      useAtlasCloud
        ? "Atlas Cloud is not configured on this deployment."
        : "No API key available.",
      {
        status: useAtlasCloud ? 503 : 401,
        headers: { "Content-Type": "text/plain" },
      },
    );
  }

  // ── Free-credit ledger (Upstash) ────────────────────────────────────────
  // A signed-in user gets a durable allotment of FREE_CREDITS images, spent
  // with an atomic INCR so a batch of parallel variation requests can never
  // oversubscribe it. A failed generation refunds its credit below. Without
  // Clerk configured, anonymous keyless callers fall back to a per-IP window
  // (forgiving on purpose: office NATs share an IP).
  let remaining: number | undefined;
  let refundCredit: (() => Promise<void>) | undefined;
  if (hasLimiter && !userAPIKey) {
    const redis = Redis.fromEnv();
    if (user) {
      const key = creditsKey(user.id);
      const used = await redis.incr(key);
      if (used > FREE_CREDITS) {
        // Undo the probe so the counter rests at the cap instead of creeping.
        await redis.decr(key).catch(() => {});
        return new Response(
          "You've used your free credits. Add your own Together AI key to keep generating.",
          { status: 429, headers: { "Content-Type": "text/plain" } },
        );
      }
      remaining = FREE_CREDITS - used;
      refundCredit = async () => {
        await redis.decr(key).catch(() => {});
      };
    } else {
      // Key anonymous callers by client IP so they don't all share one bucket.
      // The platform client IP (x-vercel-forwarded-for), which a caller can't
      // spoof via a forged x-forwarded-for header. Undefined off-Vercel → one
      // shared bucket, which is acceptable for local dev.
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(FREE_CREDITS, "30 d"),
        analytics: true,
        prefix: "logocreator",
      });
      const ip = ipAddress(req) || "anonymous";
      const { success, remaining: left } = await ratelimit.limit(ip);
      remaining = left;
      if (!success) {
        return new Response(
          "You've used up all your credits. Enter your own Together AI key to generate more logos.",
          { status: 429, headers: { "Content-Type": "text/plain" } },
        );
      }
    }
  }

  // Styles describe FORM / technique only: the color comes from the user's
  // brand color below, so a "hand-drawn blue" logo stays blue, not sepia.
  const styleLookup: Record<string, string> = {
    Minimal:
      "Minimal and timeless: two or three simple geometric shapes with generous negative space, clean and flat.",
    Geometric:
      "Geometric and precise: built from angular polygonal shapes, grid-aligned with sharp, clean edges; modern and structured.",
    Gradient:
      "Sleek and contemporary: smooth gradient shading that flows across soft, fluid shapes for a dynamic, modern feel.",
    Mascot:
      "A friendly mascot character: rounded, expressive and approachable, built from bold, confident shapes.",
    "Hand-drawn":
      "Hand-drawn and organic: sketchy, natural linework with imperfect strokes and a human, crafted feel.",
    Luxury:
      "Elegant and luxurious: fine, thin monoline work, refined, minimal and premium.",
    Retro:
      "Retro and vintage: a classic heritage badge feel with nostalgic, time-worn detailing.",
    "3D": "Modern and dimensional: soft three-dimensional depth with gentle lighting and subtle shadows, smooth and polished.",
  };

  const logoTypeLookup: Record<string, string> = {
    "icon-name":
      "a combination mark: a distinctive icon paired with the company name in clean, legible typography",
    icon: "an icon-only symbol: a single, standalone graphic mark",
    wordmark:
      "a wordmark: the company name set as distinctive, stylized typography, with no separate icon",
    monogram:
      "a monogram / lettermark built only from the company's initials, arranged into a single geometric mark",
    emblem:
      "an emblem / badge: the company name enclosed within a bordered shape such as a circle, shield or seal",
    abstract:
      "an abstract geometric mark, non-representational, modern and clean",
  };

  const detailLookup: Record<string, string> = {
    Minimal:
      "Keep it minimalist: two or three simple shapes, generous negative space, no fine detail, instantly recognizable even at favicon size.",
    Balanced:
      "Use a clean, balanced level of detail: simple enough to scale anywhere, with enough character to be memorable.",
    Detailed:
      "Allow refined, considered detail and craftsmanship, while keeping it a clean, scalable logo.",
  };

  const logoType = data.logoType ?? "icon-name";
  const hasText = ["icon-name", "wordmark", "monogram", "emblem"].includes(
    logoType,
  );

  // Medium anchor: most styles read best as clean flat vector art; only 3D and
  // Gradient keep depth/shading. FLUX needs this stated, or Minimal/Geometric/
  // Luxury marks come back shaded or photo-real.
  const flatStyle = !["3D", "Gradient"].includes(data.selectedStyle);
  const mediumClause = flatStyle
    ? "Flat 2D vector logo, built from solid-color shapes with crisp, clean edges"
    : "Modern, polished logo with smooth, clean rendering";

  // Positive phrasing throughout: FLUX attends to what you describe, not to
  // prohibitions, so "no text" is stated as a graphic-only description instead.
  const textClause = !hasText
    ? "Render it as a purely graphic symbol with no lettering: use clean shapes and open negative space where text would otherwise sit."
    : logoType === "monogram"
      ? `Build it from only the initials of "${data.companyName}", each letter clean, complete and correctly formed.`
      : `Set the company name "${data.companyName}" as clean, evenly-spaced lettering with every letter clear, complete and correctly spelled.`;

  // Which parts of the logo the brand color must paint (so it's never just the
  // text, or just the icon: the whole logo reads as one brand color).
  const colorTargets: Record<string, string> = {
    "icon-name": "both the icon and the company-name text",
    icon: "the symbol",
    wordmark: "the lettering",
    monogram: "the monogram lettering",
    emblem: "the symbol, the lettering and the border",
    abstract: "the mark",
  };
  const targets = colorTargets[logoType] ?? "the entire logo";

  // "auto" → let the model pick a fitting color instead of forcing one. Works
  // for either the brand color, the background, or both.
  const primaryAuto = data.primaryColor === "auto";
  const bgAuto = data.backgroundColor === "auto";

  const brandColorPhrase = primaryAuto
    ? `a single cohesive brand color of your choice that best suits ${data.companyName || "the brand"} and this style`
    : `${colorName(data.primaryColor)} (exact hex ${data.primaryColor})`;
  // "Perfectly even, flat, single-color" is load-bearing: FLUX likes to add
  // vignettes / soft gradients behind marks, which later defeats the brand
  // kit's edge flood-fill background removal.
  const bgPhrase = bgAuto
    ? `a perfectly even, flat, single-color background of your choice (white or a soft neutral usually works best), uniform across the whole frame with no vignette, gradient, shadow or texture`
    : `a perfectly even, flat ${colorName(data.backgroundColor)} (${data.backgroundColor}) background, uniform across the whole frame with no vignette, gradient, shadow or texture`;

  // Bind the hex to the concrete logo parts ("the icon and the lettering are
  // ink blue (#19337A)") rather than to an abstract "brand color" role: BFL's
  // guidance is that hex codes hold best when tied to specific objects. Flat
  // styles get strictly solid fills; only 3D / Gradient keep tonal depth.
  const depthAllowance = flatStyle
    ? "Every fill is solid and flat"
    : "Lighter and darker tones of that same color are fine for depth";
  const colorClause = data.monochrome
    ? `Color: ${targets} ${targets.includes(" and ") ? "are all" : "is"} one solid flat shade of ${brandColorPhrase}, a single color throughout. Place it on ${bgPhrase}, keeping every part clearly legible against that background.`
    : `Color: ${targets} ${targets.includes(" and ") ? "are" : "is"} ${brandColorPhrase}${primaryAuto ? "" : ", even where this style is conventionally drawn in other colors"}. ${depthAllowance}, with no unrelated colors introduced. Place it on ${bgPhrase}, keeping every part clearly legible against that background.`;

  const prompt = dedent`${mediumClause}: ${logoTypeLookup[logoType] ?? logoTypeLookup["icon-name"]} for "${data.companyName || "the brand"}". ${styleLookup[data.selectedStyle] ?? ""} ${detailLookup[data.detailLevel ?? "Balanced"] ?? ""}

  ${textClause} ${colorClause} Centered, balanced composition with crisp, clean edges on a solid, uncluttered background. Professional and instantly recognizable, scalable from favicon to signage.${data.referenceDescription ? ` Take visual inspiration from this reference's composition, shapes and overall feel, but design an original mark rather than a copy: ${data.referenceDescription}.` : ""}${data.additionalInfo ? ` Additional direction: ${data.additionalInfo}.` : ""}`;

  // Caller-side problems fail on ANY model, so they must surface as-is
  // instead of triggering a pointless fallback attempt.
  const isCallerError = (e: unknown) =>
    z
      .object({
        error: z.object({
          error: z.object({
            code: z.literal("invalid_api_key").optional(),
            type: z.literal("request_blocked").optional(),
          }),
        }),
      })
      .safeParse(e).success &&
    ((e as { error: { error: { code?: string; type?: string } } }).error.error
      .code === "invalid_api_key" ||
      (e as { error: { error: { code?: string; type?: string } } }).error.error
        .type === "request_blocked");

  try {
    if (useAtlasCloud) {
      const response = await generateAtlasCloudLogo(prompt, apiKey);
      return Response.json(
        { ...response, ...(remaining !== undefined ? { remaining } : {}) },
        { status: 200 },
      );
    }

    const client = new Together({ apiKey });
    // Text-bearing types (wordmark / monogram / emblem / icon-name) embed the
    // company name letter-for-letter; Gemini Flash Image renders lettering
    // reliably AND follows structural instructions (e.g. "monogram") better
    // than Ideogram did, at roughly half Ideogram's latency (picked in the
    // 2026-07-10 side-by-side shootout). Keep FLUX.2-pro for text-free marks
    // (icon / abstract), where it still wins on polish.
    // Probed on Together 2026-07-13: flash-image-3.1 is SQUARE-ONLY
    // (512/1024/2048/4096), rejects image_url input, returns JPEG bytes, and
    // rate-limits bursts aggressively; the guards below exist for that.
    const body = {
      prompt,
      model: hasText ? "google/flash-image-3.1" : "black-forest-labs/FLUX.2-pro",
      width: 1024,
      height: 1024,
      response_format: "base64" as const,
      // Higher guidance = stricter prompt/color adherence, the right trade for
      // brand marks. Verified live: FLUX.2-pro accepts `guidance` (but NOT
      // `steps`) on Together; the Google model gets none.
      ...(hasText ? {} : { guidance: 7 }),
    };
    let response: Awaited<ReturnType<typeof client.images.generate>> | null =
      null;
    try {
      response = await client.images.generate(body);
    } catch (primaryError) {
      // FLUX requests already target the backstop model: nothing to fall
      // back to, so let the outer handler classify the error.
      if (!hasText || isCallerError(primaryError)) throw primaryError;
      // Gemini burst rate-limits judge a short window, so one spaced retry
      // usually clears a 429 (its rejections are near-instant, so this stays
      // well inside the edge time budget).
      if ((primaryError as { status?: number })?.status === 429) {
        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
        try {
          response = await client.images.generate(body);
        } catch {
          /* fall through to the FLUX backstop */
        }
      }
      // Last resort for a text logo: FLUX.2-pro. Weaker lettering than
      // Gemini, but a logo beats an error mid-batch.
      if (!response) {
        response = await client.images.generate({
          ...body,
          model: "black-forest-labs/FLUX.2-pro",
          guidance: 7,
        });
      }
    }
    // `remaining` rides along so the client can update its credits caption
    // without a second round-trip (undefined for BYOK / unlimited modes).
    return Response.json(
      { ...response.data[0], ...(remaining !== undefined ? { remaining } : {}) },
      { status: 200 },
    );
  } catch (error) {
    // The image never materialized, so the credit it reserved goes back.
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

    const modelBlocked = z
      .object({
        error: z.object({
          error: z.object({ type: z.literal("request_blocked") }),
        }),
      })
      .safeParse(error);

    if (modelBlocked.success) {
      return new Response(
        "Your Together AI account needs to be in Build Tier 2 ($50 credit pack purchase required) to use this model. Please make a purchase at: https://api.together.xyz/settings/billing",
        {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }

    // Anything else (upstream 5xx, timeout, rate limit): return an actionable
    // text/plain message so the client surfaces it instead of a bare 500.
    return new Response(
      "The image service had a problem generating your logo. Please try again in a moment.",
      { status: 502, headers: { "Content-Type": "text/plain" } },
    );
  }
}

export const runtime = "edge";
