import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getAllUnitNames, normalizeUnitName } from "../counterService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptPath = join(__dirname, "../../../data/vision-system-prompt.txt");

export interface VisionResult {
  detectedUnits: { name: string; confidence: string; notes?: string }[];
  scene?: string;
  mode: "ai" | "heuristic";
  provider?: "openai" | "ollama" | "ocr";
  raw?: unknown;
}

export function loadSystemPrompt(): string {
  const base = readFileSync(promptPath, "utf-8");
  const unitList = getAllUnitNames().slice(0, 80).join(", ");
  return `${base}\n\nKnown units include: ${unitList}`;
}

export function parseVisionJson(content: string): VisionResult["detectedUnits"] {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      detectedUnits?: { name: string; confidence?: string; notes?: string }[];
    };
    const units = parsed.detectedUnits ?? [];
    return units
      .map((u) => {
        const canonical = normalizeUnitName(u.name);
        if (!canonical) return null;
        return {
          name: canonical,
          confidence: u.confidence ?? "medium",
          notes: u.notes,
        };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);
  } catch {
    return [];
  }
}

export const VISION_USER_TEXT =
  "Identify enemy StarCraft II units in this screenshot. JSON only.";
