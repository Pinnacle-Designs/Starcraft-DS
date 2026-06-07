import { buildTrainingPromptSection } from "../training/trainingPrompt.js";
import { prepareVisionImages } from "./prepareImage.js";
import {
  loadSystemPrompt,
  parseVisionJson,
  VISION_USER_TEXT,
  type VisionResult,
} from "./shared.js";
import { getUnitReferenceCollageBase64 } from "./unitReference.js";

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

function useReferenceCollage(): boolean {
  return process.env.OLLAMA_USE_REFERENCE_IMAGE !== "false";
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

function mergeVisionResults(results: VisionResult[]): VisionResult {
  const merged = new Map<string, VisionResult["detectedUnits"][number]>();
  for (const result of results) {
    for (const unit of result.detectedUnits) {
      const key = `${unit.name}:${unit.wave ?? 0}`;
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, unit);
        continue;
      }
      const count = (prev.count ?? 1) + (unit.count ?? 1);
      merged.set(key, {
        ...prev,
        count,
        confidence:
          prev.confidence === "high" || unit.confidence === "high"
            ? "high"
            : "medium",
        notes: `×${count}${unit.notes ? ` — ${unit.notes}` : ""}`,
      });
    }
  }
  const detectedUnits = [...merged.values()];
  const scene = results.map((r) => r.scene).filter(Boolean).join(" | ");
  return {
    detectedUnits,
    scene: scene || undefined,
    mode: "ai",
    provider: "ollama",
  };
}

function buildOllamaPrompt(tileMode: boolean, hasCollage: boolean): string {
  const trainingSection = buildTrainingPromptSection();
  let layoutHint = tileMode
    ? "Images 1-4 are zoomed battlefield quadrants (top-left, top-right, bottom-left, bottom-right). Scan every quadrant for enemy unit sprites."
    : "Image 1 is the gameplay viewport — scan the full battlefield for enemy unit sprites and clusters.";
  let referenceHint = "";
  if (hasCollage) {
    referenceHint = tileMode
      ? "Image 5 is a labeled SC2 unit portrait reference sheet — match battlefield sprites to those names."
      : "Image 2 is a labeled SC2 unit portrait reference sheet — match battlefield sprites to those names.";
  }
  return `${loadSystemPrompt()}${trainingSection}

${layoutHint}
${referenceHint}

${VISION_USER_TEXT}`;
}

async function callOllamaVision(
  images: string[],
  tileMode: boolean,
  hasCollage: boolean
): Promise<VisionResult> {
  const model = process.env.OLLAMA_VISION_MODEL ?? "llava";
  const prompt = buildOllamaPrompt(tileMode, hasCollage);

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

export async function analyzeWithOllama(
  imageBase64: string,
  _mimeType: string
): Promise<VisionResult> {
  const prepared = await prepareVisionImages(imageBase64);
  const collage = useReferenceCollage() ? getUnitReferenceCollageBase64() : null;

  const viewportImages = [prepared.viewportBase64];
  if (collage) viewportImages.push(collage);

  const primary = await callOllamaVision(viewportImages, false, Boolean(collage));
  if (primary.detectedUnits.length > 0) return primary;

  if (prepared.tileBase64.length > 0) {
    const tileImages = [...prepared.tileBase64];
    if (collage) tileImages.push(collage);
    const tiled = await callOllamaVision(tileImages, true, Boolean(collage));
    if (tiled.detectedUnits.length > 0) {
      return mergeVisionResults([primary, tiled]);
    }
    return tiled;
  }

  return primary;
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
