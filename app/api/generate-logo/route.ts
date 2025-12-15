import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import dedent from "dedent";
import Together from "together-ai";
import { z } from "zod";
import { DEFAULT_FLAGS, parseFeatureFlagEnvVar } from "@/app/lib/feature-flags";
import { models } from "@/app/constants/models";

// Helper function to sanitize input
function sanitizeInput(text: string): string {
  return text
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .trim();
}

let ratelimit: Ratelimit | undefined;

export async function POST(req: Request) {
  const featureFlags = { ...DEFAULT_FLAGS, ...parseFeatureFlagEnvVar() };
  const authEnabled = featureFlags.AUTH.enabled;

  let user = null;
  if (authEnabled) {
    user = await currentUser();
    if (!user) {
      return new Response("", { status: 404 });
    }
  }

  const json = await req.json();
  const data = z
    .object({
      userAPIKey: z.string().optional(),
      companyName: z.string().transform(sanitizeInput),
      selectedStyle: z.string(),
      selectedModel: z.string().default("black-forest-labs/FLUX.1.1-pro"),
      selectedPrimaryColor: z.string(),
      selectedBackgroundColor: z.string(),
      additionalInfo: z.string().optional().transform(val => val ? sanitizeInput(val) : ''),
      referenceImage: z.string().optional(),
    })
    .parse(json);

  // Validate that the model exists in our allowed list
  const selectedModel = models.find(m => m.modelString === data.selectedModel);
  if (!selectedModel) {
    return new Response("Invalid model selected", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Validate reference image is provided when required
  if (selectedModel.requiresReferenceImage && !data.referenceImage) {
    return new Response("This model requires a reference image", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Add observability if a Helicone key is specified, otherwise skip
  const options: ConstructorParameters<typeof Together>[0] = {};
  if (process.env.HELICONE_API_KEY) {
    options.baseURL = "https://together.helicone.ai/v1";
    options.defaultHeaders = {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      "Helicone-Property-LOGOBYOK": data.userAPIKey ? "true" : "false",
    };
  }

  // Add rate limiting if Upstash API keys are set & no BYOK, otherwise skip
  if (process.env.UPSTASH_REDIS_REST_URL && !data.userAPIKey && authEnabled) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      // Allow 3 requests per 2 months on prod
      limiter: Ratelimit.fixedWindow(3, "60 d"),
      analytics: true,
      prefix: "logocreator",
    });
  }

  const client = new Together(options);

  if (data.userAPIKey) {
    client.apiKey = data.userAPIKey;
    if (authEnabled && user) {
      (await clerkClient()).users.updateUserMetadata(user.id, {
        unsafeMetadata: {
          remaining: "BYOK",
        },
      });
    }
  }

  if (ratelimit && user) {
    const identifier = user.id;
    const { success, remaining } = await ratelimit.limit(identifier);
    if (authEnabled) {
      (await clerkClient()).users.updateUserMetadata(user.id, {
        unsafeMetadata: {
          remaining,
        },
      });
    }

    if (!success) {
      return new Response(
        "You've used up all your credits. Enter your own Together API Key to generate more logos.",
        {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }
  }

  const flashyStyle =
    "Professional and impactful corporate design with modern dynamic elements. Use bright professional colors with refined metallic accents and clean glossy finishes.";

  const techStyle =
    "Professional tech-focused design with precise geometric elements. Clean, high-contrast layout with subtle depth effects and modern typography.";

  const modernStyle =
    "Contemporary business design utilizing clean geometric shapes and professional layout. Emphasize whitespace and subtle gradients for a refined corporate look.";

  const playfulStyle =
    "Approachable business design with friendly geometric elements. Use professional color combinations and smooth curved shapes for an inviting corporate identity.";

  const abstractStyle =
    "Contemporary corporate design using refined geometric patterns. Professional composition with clean shapes and business-appropriate artistic elements.";

  const minimalStyle =
    "Elegant corporate design focusing on simplicity and clarity. Single-color professional layout with strategic use of whitespace and refined typography.";

  const styleLookup: Record<string, string> = {
    Flashy: flashyStyle,
    Tech: techStyle,
    Modern: modernStyle,
    Playful: playfulStyle,
    Abstract: abstractStyle,
    Minimal: minimalStyle,
  };

  const getColorInstructions = (primaryColor: string, backgroundColor: string) => {
    const isHex = (color: string) => color.startsWith('#');
    const primaryIsHex = isHex(primaryColor);
    const bgIsHex = isHex(backgroundColor);

    return `The logo must strictly use ${primaryIsHex ? `the exact color ${primaryColor}` : primaryColor.toLowerCase()} as the primary/dominant color for the main elements. ${bgIsHex ? `Use exactly ${backgroundColor}` : `Use ${backgroundColor.toLowerCase()}`} as the background color. Maintain strong contrast between the logo elements and background. If accent colors are needed, derive them from the primary color while maintaining color harmony. Ensure the colors are precisely as specified for consistent branding.`;
  };

  const prompt = dedent`Create a professional, clean, family-friendly business logo that is strictly safe for work and absolutely must not contain any adult, inappropriate, offensive, or NSFW content. Generate a single, high-quality, award-winning corporate design suitable for both digital and print media. The logo should only contain simple vector shapes and typography, ${styleLookup[data.selectedStyle]}

  ${getColorInstructions(data.selectedPrimaryColor, data.selectedBackgroundColor)}
  
  The company name is ${data.companyName}, make sure to include the company name in the logo in a professional business font. Keep the design clean, corporate, and family-friendly. Ensure all elements are appropriate for a professional business context. ${data.additionalInfo ? `Additional design context: ${data.additionalInfo}` : ""}`;

  try {
    const response = await client.images.create({
      prompt,
      model: data.selectedModel,
      width: 768,
      height: 768,
      steps: selectedModel.defaultSteps,
      // @ts-expect-error - this is not typed in the API
      response_format: "base64",
      image_url: data.referenceImage ? `data:image/png;base64,${data.referenceImage}` : undefined,
    });
    return Response.json(response.data[0], { status: 200 });
  } catch (error) {
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

    const nsfwError = z
      .object({
        error: z.object({
          error: z.object({ message: z.string(), type: z.string() }),
        }),
      })
      .safeParse(error);

    if (nsfwError.success && nsfwError.data.error.error.message.includes("NSFW content")) {
      return new Response(
        "Your prompt may contain sensitive content. Please modify your company name or additional information to be more business-appropriate and try again.",
        {
          status: 422,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }

    throw error;
  }
}

export const runtime = "edge";
