import { createWorker, type Worker } from "tesseract.js";
import { imageDimensionsFromBase64 } from "./imageDimensions.js";
import { detectFromText } from "./textDetection.js";
import type { VisionResult } from "./shared.js";

let workerInit: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerInit) {
    workerInit = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_pageseg_mode: "3",
      });
      return worker;
    })().catch((err) => {
      workerInit = null;
      throw err;
    });
  }
  return workerInit;
}

async function recognizeRegion(
  worker: Worker,
  dataUrl: string,
  rectangle?: { left: number; top: number; width: number; height: number }
): Promise<string> {
  const { data } = rectangle
    ? await worker.recognize(dataUrl, { rectangle })
    : await worker.recognize(dataUrl);
  return data.text ?? "";
}

async function recognizeTiled(
  worker: Worker,
  dataUrl: string,
  width: number,
  height: number,
  cols: number,
  rows: number
): Promise<string> {
  const chunks: string[] = [];
  const tileW = Math.max(1, Math.floor(width / cols));
  const tileH = Math.max(1, Math.floor(height / rows));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = col * tileW;
      const top = row * tileH;
      const rectWidth = col === cols - 1 ? width - left : tileW;
      const rectHeight = row === rows - 1 ? height - top : tileH;
      const text = await recognizeRegion(worker, dataUrl, {
        left,
        top,
        width: rectWidth,
        height: rectHeight,
      });
      if (text.trim()) chunks.push(text);
    }
  }

  return chunks.join("\n");
}

async function recognizeWithPsm(
  worker: Worker,
  dataUrl: string,
  psm: string
): Promise<string> {
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const text = await recognizeRegion(worker, dataUrl);
  await worker.setParameters({ tessedit_pageseg_mode: "3" });
  return text;
}

function buildResult(text: string, relaxed = false): VisionResult {
  const matched = detectFromText(text, { requireCount: !relaxed });
  return {
    detectedUnits: matched.detectedUnits,
    scene: text.trim().slice(0, 200) || "OCR found no readable text.",
    mode: "heuristic",
    provider: "ocr",
    raw: text,
  };
}

export async function analyzeWithTesseract(
  imageBase64: string,
  mimeType: string,
  options?: { relaxed?: boolean }
): Promise<VisionResult> {
  const relaxed = options?.relaxed === true;
  const worker = await getOcrWorker();
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  let combined = await recognizeRegion(worker, dataUrl);
  let result = buildResult(combined, relaxed);
  if (result.detectedUnits.length > 0) return result;

  const dims = imageDimensionsFromBase64(imageBase64, mimeType);
  if (dims) {
    const tiled = await recognizeTiled(
      worker,
      dataUrl,
      dims.width,
      dims.height,
      4,
      4
    );
    if (tiled.trim()) {
      combined = `${combined}\n${tiled}`;
      result = buildResult(combined, relaxed);
      if (result.detectedUnits.length > 0) return result;
    }
  }

  const sparse = await recognizeWithPsm(worker, dataUrl, "11");
  if (sparse.trim()) {
    combined = `${combined}\n${sparse}`;
    result = buildResult(combined, relaxed);
  }

  return result;
}

export async function analyzeWithTesseractSafe(
  imageBase64: string,
  mimeType: string,
  options?: { relaxed?: boolean }
): Promise<VisionResult> {
  try {
    return await analyzeWithTesseract(imageBase64, mimeType, options);
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
