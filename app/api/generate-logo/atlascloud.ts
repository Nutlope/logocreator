const ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1";

type AtlasPrediction = {
  data?: {
    id?: string;
    status?: string;
    output?: string | string[];
    outputs?: string | string[];
    error?: string;
  };
  id?: string;
  status?: string;
  output?: string | string[];
  outputs?: string | string[];
  error?: string;
};

function getOutputUrl(prediction: AtlasPrediction): string | undefined {
  const data = prediction.data ?? prediction;
  const output = data.outputs ?? data.output;

  if (Array.isArray(output)) {
    return output[0];
  }

  return output;
}

function getPredictionId(prediction: AtlasPrediction): string | undefined {
  return prediction.data?.id ?? prediction.id;
}

function getPredictionStatus(prediction: AtlasPrediction): string | undefined {
  return prediction.data?.status ?? prediction.status;
}

function getPredictionError(prediction: AtlasPrediction): string | undefined {
  return prediction.data?.error ?? prediction.error;
}

async function parseAtlasResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text) as AtlasPrediction;
  } catch {
    return { error: text };
  }
}

export async function generateAtlasCloudLogo(
  prompt: string,
  apiKey: string,
): Promise<{ url: string }> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const submitResponse = await fetch(`${ATLAS_BASE_URL}/model/generateImage`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "black-forest-labs/flux-dev",
      prompt,
      size: "768*768",
      num_images: 1,
    }),
  });

  const submitted = await parseAtlasResponse(submitResponse);

  if (!submitResponse.ok) {
    throw new Error(
      getPredictionError(submitted) ?? "Atlas Cloud request failed.",
    );
  }

  const predictionId = getPredictionId(submitted);

  if (!predictionId) {
    throw new Error("Atlas Cloud did not return a prediction id.");
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const pollResponse = await fetch(
      `${ATLAS_BASE_URL}/model/prediction/${predictionId}`,
      { headers },
    );
    const prediction = await parseAtlasResponse(pollResponse);

    if (!pollResponse.ok) {
      throw new Error(
        getPredictionError(prediction) ?? "Atlas Cloud polling failed.",
      );
    }

    const status = getPredictionStatus(prediction);

    if (status === "completed" || status === "succeeded") {
      const url = getOutputUrl(prediction);

      if (!url) {
        throw new Error("Atlas Cloud completed without an output image.");
      }

      return { url };
    }

    if (status === "failed") {
      throw new Error(
        getPredictionError(prediction) ?? "Atlas Cloud generation failed.",
      );
    }
  }

  throw new Error("Atlas Cloud generation timed out.");
}
