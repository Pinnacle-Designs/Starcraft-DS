import { buildTrainingPromptSection } from "../training/trainingPrompt.js";
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

function visionModelName(): string {
  return (process.env.OLLAMA_VISION_MODEL ?? "llava").toLowerCase();
}

function modelInstalled(
  tags: { models?: { name?: string }[] } | null,
  model: string
): boolean {
  const models = tags?.models ?? [];
  const key = model.toLowerCase();
  return models.some((entry) => {
    const name = (entry.name || "").toLowerCase();
    return name === key || name.startsWith(`${key}:`);
  });
}

export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const tags = (await res.json()) as { models?: { name?: string }[] };
    return modelInstalled(tags, visionModelName());
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for Ollama + vision model after auto-start (npm run dev). */
export async function waitForOllamaVision(
  maxMs = Number(process.env.OLLAMA_STARTUP_WAIT_MS || 30000)
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await checkOllamaAvailable()) return true;
    await sleep(1000);
  }
  return false;
}

export async function analyzeWithOllama(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  const model = process.env.OLLAMA_VISION_MODEL ?? "llava";
  const trainingSection = buildTrainingPromptSection();
  const prompt = `${loadSystemPrompt()}${trainingSection}\n\n${VISION_USER_TEXT}`;
  const images = [imageBase64];

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
          images,
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
