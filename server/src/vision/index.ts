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
import { filterVisionUnits, type VisionResult } from "./shared.js";

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

function mergeDetectedUnits(
  primary: VisionResult["detectedUnits"],
  secondary: VisionResult["detectedUnits"]
): VisionResult["detectedUnits"] {
  const merged = new Map<string, VisionResult["detectedUnits"][number]>();
  for (const unit of [...primary, ...secondary]) {
    const key = `${unit.name}:${unit.wave ?? 0}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, unit);
      continue;
    }
    const count = Math.max(prev.count ?? 1, unit.count ?? 1);
    merged.set(key, { ...prev, count });
  }
  return [...merged.values()];
}

/** Ollama reads battlefield sprites; OCR supplements when text labels are visible. */
async function analyzeVisualFirst(
  imageBase64: string,
  mimeType: string,
  ollamaUp: boolean
): Promise<VisionResult> {
  if (ollamaUp) {
    const visual = await analyzeWithOllamaSafe(imageBase64, mimeType);
    if (visual.detectedUnits.length > 0) {
      return visual;
    }

    const ocr = await analyzeWithTesseractSafe(imageBase64, mimeType, {
      relaxed: true,
    });
    if (ocr.detectedUnits.length > 0) {
      return {
        ...ocr,
        detectedUnits: mergeDetectedUnits(visual.detectedUnits, ocr.detectedUnits),
        scene: ocr.scene ?? visual.scene,
        mode: visual.mode === "ai" ? "ai" : ocr.mode,
        provider: "ollama",
      };
    }

    return {
      ...visual,
      scene:
        visual.scene ??
        "No enemy units detected. Ensure enemies are visible on the map and Ollama (llava) is running.",
    };
  }

  const ocr = await analyzeWithTesseractSafe(imageBase64, mimeType, {
    relaxed: true,
  });
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

function finalizeVisionResult(result: VisionResult): VisionResult {
  return {
    ...result,
    detectedUnits: filterVisionUnits(result.detectedUnits),
  };
}

export async function analyzeScreenshot(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  const pref = resolveProvider();
  const ollamaUp = await resolveOllamaReady();
  let result: VisionResult;

  if (pref === "auto" || pref === "ollama") {
    result = await analyzeVisualFirst(imageBase64, mimeType, ollamaUp);
  } else if (pref === "ocr") {
    const ocr = await analyzeWithTesseractSafe(imageBase64, mimeType);
    result =
      ocr.detectedUnits.length > 0 || !ollamaUp
        ? ocr
        : await analyzeVisualFirst(imageBase64, mimeType, true);
  } else if (pref === "openai") {
    if (isOpenAiConfigured()) {
      try {
        result = await analyzeWithOpenAiResilient(imageBase64, mimeType);
      } catch (err) {
        if (isOpenAiInsufficientQuotaError(err)) {
          result = await analyzeVisualFirst(imageBase64, mimeType, ollamaUp);
        } else {
          throw err;
        }
      }
    } else {
      result = await analyzeVisualFirst(imageBase64, mimeType, ollamaUp);
    }
  } else {
    result = await analyzeVisualFirst(imageBase64, mimeType, ollamaUp);
  }

  return finalizeVisionResult(result);
}
