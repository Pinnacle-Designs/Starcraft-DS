import {
  loadSystemPrompt,
  parseVisionJson,
  VISION_USER_TEXT,
  type VisionResult,
} from "./shared.js";

function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(
    /\/$/,
    ""
  );
}

export function isOllamaConfigured(): boolean {
  return process.env.VISION_PROVIDER === "ollama" || process.env.OLLAMA_ENABLED === "true" || !process.env.OPENAI_API_KEY;
}

export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function analyzeWithOllama(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  const model = process.env.OLLAMA_VISION_MODEL ?? "llava";
  const prompt = `${loadSystemPrompt()}\n\n${VISION_USER_TEXT}`;

  const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "user",
          content: prompt,
          images: [imageBase64],
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Ollama error (${res.status}): ${text.slice(0, 200)}. Is Ollama running? Try: ollama pull ${model}`
    );
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content ?? "";

  return {
    detectedUnits: parseVisionJson(content),
    scene: content.slice(0, 200),
    mode: "ai",
    provider: "ollama",
    raw: content,
  };
}

export async function analyzeWithOllamaSafe(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  try {
    return await analyzeWithOllama(imageBase64, mimeType);
  } catch (err) {
    return {
      detectedUnits: [],
      scene:
        err instanceof Error
          ? err.message
          : "Ollama vision failed. Run `ollama pull llava` and start Ollama.",
      mode: "heuristic",
      provider: "ollama",
    };
  }
}
