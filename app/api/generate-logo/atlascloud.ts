const ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1";
const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type AtlasPredictionData = {
  id?: string;
  status?: string;
  output?: string | string[];
  outputs?: string | string[];
  error?: unknown;
  urls?: { result?: string };
};

type AtlasPrediction = AtlasPredictionData & {
  data?: AtlasPredictionData;
  message?: string;
};

class AtlasCloudError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AtlasCloudError";
  }
}

function predictionData(prediction: AtlasPrediction): AtlasPredictionData {
  return prediction.data ?? prediction;
}

function predictionError(prediction: AtlasPrediction): string | undefined {
  const error = predictionData(prediction).error ?? prediction.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return prediction.message;
}

async function parseAtlasResponse(
  response: Response,
): Promise<AtlasPrediction> {
  const text = await response.text();
  try {
    return JSON.parse(text) as AtlasPrediction;
  } catch {
    return { error: text };
  }
}

async function atlasResponse(response: Response): Promise<AtlasPrediction> {
  const prediction = await parseAtlasResponse(response);
  if (!response.ok) {
    throw new AtlasCloudError(
      predictionError(prediction) ?? "Atlas Cloud request failed.",
      response.status,
    );
  }
  return prediction;
}

function outputValue(prediction: AtlasPrediction): string | undefined {
  const data = predictionData(prediction);
  const output = data.outputs ?? data.output;
  return Array.isArray(output) ? output[0] : output;
}

async function imageToBase64(output: string): Promise<string> {
  if (output.startsWith("data:")) {
    const comma = output.indexOf(",");
    if (comma < 0 || !output.slice(0, comma).includes(";base64")) {
      throw new AtlasCloudError("Atlas Cloud returned an invalid data URL.");
    }
    return output.slice(comma + 1);
  }

  if (!output.startsWith("https://")) {
    return output.replace(/\s/g, "");
  }

  const response = await fetch(output);
  if (!response.ok) {
    throw new AtlasCloudError("Atlas Cloud output could not be downloaded.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new AtlasCloudError("Atlas Cloud output exceeded the size limit.");
  }

  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

export async function generateAtlasCloudLogo(
  prompt: string,
  apiKey: string,
): Promise<{ b64_json: string }> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const submitted = await atlasResponse(
    await fetch(`${ATLAS_BASE_URL}/model/generateImage`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "black-forest-labs/flux-dev",
        prompt,
        size: "1024*1024",
        num_images: 1,
        enable_base64_output: true,
      }),
    }),
  );
  const initialData = predictionData(submitted);
  const predictionId = initialData.id;

  if (!predictionId) {
    throw new AtlasCloudError("Atlas Cloud did not return a prediction id.");
  }

  const resultUrl = initialData.urls?.result;
  const pollUrl = resultUrl?.startsWith("https://")
    ? resultUrl
    : `${ATLAS_BASE_URL}/model/prediction/${predictionId}`;
  let prediction = submitted;

  for (let attempt = 0; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    const data = predictionData(prediction);
    if (data.status === "completed" || data.status === "succeeded") {
      const output = outputValue(prediction);
      if (!output) {
        throw new AtlasCloudError(
          "Atlas Cloud completed without an output image.",
        );
      }
      return { b64_json: await imageToBase64(output) };
    }
    if (data.status === "failed") {
      throw new AtlasCloudError(
        predictionError(prediction) ?? "Atlas Cloud generation failed.",
      );
    }
    if (attempt === MAX_POLL_ATTEMPTS) break;

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    prediction = await atlasResponse(await fetch(pollUrl, { headers }));
  }

  throw new AtlasCloudError("Atlas Cloud generation timed out.");
}
