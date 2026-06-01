import { getAllUnitNames, getAliasEntries } from "../counterService.js";
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

/** Fallback: match unit names in free text (word boundaries, longest names first). */
export function detectFromText(text: string): VisionResult {
  const lower = text.toLowerCase();
  const found: VisionResult["detectedUnits"] = [];
  const seen = new Set<string>();

  const matchPhrase = (phrase: string, unit: string) => {
    if (seen.has(unit)) return;
    const pattern = phrase
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    if (new RegExp(`(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`).test(lower)) {
      seen.add(unit);
      found.push({ name: unit, confidence: "low", notes: "text match" });
    }
  };

  const names = getAllUnitNames().sort((a, b) => b.length - a.length);
  for (const name of names) {
    matchPhrase(name.toLowerCase(), name);
  }

  const aliases = getAliasEntries().sort(
    (a, b) => b.alias.length - a.alias.length
  );
  for (const { alias, unit } of aliases) {
    matchPhrase(alias.toLowerCase(), unit);
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
