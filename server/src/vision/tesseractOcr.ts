import { createWorker, type Worker } from "tesseract.js";
import { detectFromText } from "./textDetection.js";
import type { VisionResult } from "./shared.js";

let workerInit: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerInit) {
    workerInit = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_pageseg_mode: "3", // PSM fully automatic page segmentation
      });
      return worker;
    })().catch((err) => {
      workerInit = null;
      throw err;
    });
  }
  return workerInit;
}

export async function analyzeWithTesseract(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  const worker = await getOcrWorker();
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const { data } = await worker.recognize(dataUrl);
  const text = data.text ?? "";
  const matched = detectFromText(text);

  return {
    detectedUnits: matched.detectedUnits,
    scene: text.trim().slice(0, 200) || "OCR found no readable text.",
    mode: "heuristic",
    provider: "ocr",
    raw: text,
  };
}

export async function analyzeWithTesseractSafe(
  imageBase64: string,
  mimeType: string
): Promise<VisionResult> {
  try {
    return await analyzeWithTesseract(imageBase64, mimeType);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR failed";
    return {
      detectedUnits: [],
      scene: `OCR error: ${message}`,
      mode: "heuristic",
      provider: "ocr",
    };
  }
}
