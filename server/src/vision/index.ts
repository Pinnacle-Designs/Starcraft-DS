import { analyzeWithOllamaSafe, checkOllamaAvailable } from "./ollamaVision.js";
import {
  analyzeWithOpenAi,
  isOpenAiConfigured,
  isOpenAiQuotaError,
} from "./openaiVision.js";
import { detectFromText } from "./textDetection.js";
import { analyzeWithTesseractSafe } from "./tesseractOcr.js";
import type { VisionResult } from "./shared.js";

export type { VisionResult } from "./shared.js";
export { checkOllamaAvailable, isOpenAiConfigured };
export { detectFromText };

export type VisionProvider = "auto" | "openai" | "ollama" | "ocr" | "tesseract";

function resolveProvider(): VisionProvider {
  const env = (process.env.VISION_PROVIDER ?? "ocr").toLowerCase();
  if (env === "openai" || env === "ollama" || env === "ocr" || env === "tesseract") {
    return env === "tesseract" ? "ocr" : env;
  }
  return "auto";
}

export async function getVisionStatus(): Promise<{
  openai: boolean;
  ollama: boolean;
  ocr: boolean;
  active: VisionProvider | null;
}> {
  const openai = isOpenAiConfigured();
  const ollama = await checkOllamaAvailable();
  const pref = resolveProvider();
  let active: VisionProvider | null = null;

  if (pref === "ocr") active = "ocr";
  else if (pref === "ollama" && ollama) active = "ollama";
  else if (pref === "openai" && openai) active = "openai";
  else if (pref === "auto") {
    active = "ocr";
  }

  return { openai, ollama, ocr: true, active };
}

export async function analyzeScreenshot(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  const pref = resolveProvider();
  const ollamaUp = await checkOllamaAvailable();

  if (pref === "ocr") {
    return analyzeWithTesseractSafe(imageBase64, mimeType);
  }

  if (pref === "auto") {
    return analyzeWithTesseractSafe(imageBase64, mimeType);
  }

  if (pref === "ollama") {
    if (ollamaUp) return analyzeWithOllamaSafe(imageBase64, mimeType);
    return {
      detectedUnits: [],
      scene: "Ollama not reachable at OLLAMA_BASE_URL.",
      mode: "heuristic",
      provider: "ollama",
    };
  }

  if (pref === "openai") {
    if (isOpenAiConfigured()) {
      try {
        return await analyzeWithOpenAi(imageBase64, mimeType);
      } catch (err) {
        if (isOpenAiQuotaError(err)) {
          const ocr = await analyzeWithTesseractSafe(imageBase64, mimeType);
          return {
            ...ocr,
            scene:
              "OpenAI quota exceeded — fell back to free OCR. " +
              (ocr.scene ?? ""),
          };
        }
        throw err;
      }
    }
    return {
      detectedUnits: [],
      scene: "OPENAI_API_KEY missing — set it in server/.env or use VISION_PROVIDER=ocr.",
      mode: "heuristic",
      provider: "openai",
    };
  }

  return analyzeWithTesseractSafe(imageBase64, mimeType);
}
