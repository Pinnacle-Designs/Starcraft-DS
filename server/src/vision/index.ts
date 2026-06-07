import {
  analyzeWithOllamaSafe,
  checkOllamaAvailable,
  waitForOllamaVision,
} from "./ollamaVision.js";
import {
  analyzeWithOpenAiResilient,
  isOpenAiConfigured,
  isOpenAiInsufficientQuotaError,
} from "./openaiVision.js";
import { detectFromText } from "./textDetection.js";
import { analyzeWithTesseractSafe } from "./tesseractOcr.js";
import type { VisionResult } from "./shared.js";

export type { VisionResult } from "./shared.js";
export { checkOllamaAvailable, isOpenAiConfigured, waitForOllamaVision };
export { detectFromText };

export type VisionProvider = "auto" | "openai" | "ollama" | "ocr" | "tesseract";

function resolveProvider(): VisionProvider {
  const env = (process.env.VISION_PROVIDER ?? "auto").toLowerCase();
  if (env === "openai" || env === "ollama" || env === "ocr" || env === "tesseract") {
    return env === "tesseract" ? "ocr" : env;
  }
  return "auto";
}

async function resolveOllamaReady(): Promise<boolean> {
  if (await checkOllamaAvailable()) return true;
  if (process.env.AUTO_START_OLLAMA === "false") return false;
  return waitForOllamaVision();
}

/** Ollama reads unit models on the screenshot; OCR only when visual AI is unavailable. */
async function analyzeVisualFirst(
  imageBase64: string,
  mimeType: string,
  ollamaUp: boolean
): Promise<VisionResult> {
  if (ollamaUp) {
    const visual = await analyzeWithOllamaSafe(imageBase64, mimeType);
    return {
      ...visual,
      scene:
        visual.scene ??
        (visual.detectedUnits.length > 0
          ? undefined
          : "No enemy units detected in this screenshot."),
    };
  }

  const ocr = await analyzeWithTesseractSafe(imageBase64, mimeType);
  return {
    ...ocr,
    scene:
      ocr.scene ??
      "No units detected. Install Ollama (ollama pull llava) for visual detection on screenshots.",
  };
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
  else if (pref === "ollama") active = ollama ? "ollama" : "ocr";
  else if (pref === "openai" && openai) active = "openai";
  else if (pref === "auto") {
    active = ollama ? "ollama" : "ocr";
  }

  return { openai, ollama, ocr: true, active };
}

export async function analyzeScreenshot(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  const pref = resolveProvider();
  const ollamaUp = await resolveOllamaReady();

  if (pref === "auto" || pref === "ollama") {
    return analyzeVisualFirst(imageBase64, mimeType, ollamaUp);
  }

  if (pref === "ocr") {
    const ocr = await analyzeWithTesseractSafe(imageBase64, mimeType);
    if (ocr.detectedUnits.length > 0 || !ollamaUp) return ocr;
    return analyzeVisualFirst(imageBase64, mimeType, true);
  }

  if (pref === "openai") {
    if (isOpenAiConfigured()) {
      try {
        return await analyzeWithOpenAiResilient(imageBase64, mimeType);
      } catch (err) {
        if (isOpenAiInsufficientQuotaError(err)) {
          return analyzeVisualFirst(imageBase64, mimeType, ollamaUp);
        }
        throw err;
      }
    }
    return analyzeVisualFirst(imageBase64, mimeType, ollamaUp);
  }

  return analyzeVisualFirst(imageBase64, mimeType, ollamaUp);
}
