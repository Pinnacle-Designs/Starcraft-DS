import { getAllUnitNames, normalizeUnitName } from "../counterService.js";
import { analyzeWithOllamaSafe, checkOllamaAvailable } from "./ollamaVision.js";
import { analyzeWithOpenAi, isOpenAiConfigured } from "./openaiVision.js";
import type { VisionResult } from "./shared.js";

export type { VisionResult } from "./shared.js";
export { checkOllamaAvailable, isOpenAiConfigured };

export type VisionProvider = "auto" | "openai" | "ollama";

function resolveProvider(): VisionProvider {
  const env = (process.env.VISION_PROVIDER ?? "auto").toLowerCase();
  if (env === "openai" || env === "ollama") return env;
  return "auto";
}

export async function getVisionStatus(): Promise<{
  openai: boolean;
  ollama: boolean;
  active: VisionProvider | null;
}> {
  const openai = isOpenAiConfigured();
  const ollama = await checkOllamaAvailable();
  const pref = resolveProvider();
  let active: VisionProvider | null = null;
  if (pref === "ollama" && ollama) active = "ollama";
  else if (pref === "openai" && openai) active = "openai";
  else if (pref === "auto") {
    if (ollama) active = "ollama";
    else if (openai) active = "openai";
  }
  return { openai, ollama, active };
}

/** Fallback: match unit names in free text */
export function detectFromText(text: string): VisionResult {
  const lower = text.toLowerCase();
  const found: VisionResult["detectedUnits"] = [];
  for (const name of getAllUnitNames()) {
    if (lower.includes(name.toLowerCase())) {
      found.push({ name, confidence: "low", notes: "text match" });
    }
  }
  return { detectedUnits: found, mode: "heuristic" };
}

export async function analyzeScreenshot(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  const pref = resolveProvider();
  const ollamaUp = await checkOllamaAvailable();

  if (pref === "ollama" || (pref === "auto" && ollamaUp)) {
    if (ollamaUp) return analyzeWithOllamaSafe(imageBase64, mimeType);
    if (pref === "ollama") {
      return {
        detectedUnits: [],
        scene: "Ollama not reachable at OLLAMA_BASE_URL.",
        mode: "heuristic",
        provider: "ollama",
      };
    }
  }

  if (pref === "openai" || (pref === "auto" && isOpenAiConfigured())) {
    if (isOpenAiConfigured()) {
      return analyzeWithOpenAi(imageBase64, mimeType);
    }
  }

  if (isOpenAiConfigured()) {
    return analyzeWithOpenAi(imageBase64, mimeType);
  }

  return {
    detectedUnits: [],
    scene:
      "No vision provider. Start Ollama (`ollama pull llava`) or set OPENAI_API_KEY.",
    mode: "heuristic",
  };
}
