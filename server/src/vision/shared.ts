import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  getAllUnitNames,
  normalizeUnitName,
  normalizeUnitNameFuzzy,
} from "../counterService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptPath = join(__dirname, "../../../data/vision-system-prompt.txt");

export interface VisionDetectedUnit {
  name: string;
  confidence: string;
  notes?: string;
  wave?: 1 | 2 | 3;
  count?: number;
}

export interface VisionResult {
  detectedUnits: VisionDetectedUnit[];
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

function parseWaveValue(raw: unknown): 1 | 2 | 3 | undefined {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return undefined;
}

function parseCountFromNotes(notes?: string, count?: unknown): number {
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    return Math.max(1, Math.floor(count));
  }
  if (typeof count === "string" && /^\d+$/.test(count.trim())) {
    return Math.max(1, parseInt(count.trim(), 10));
  }
  if (!notes) return 1;
  const mult = notes.match(/[×xX]\s*(\d+)/) ?? notes.match(/(\d+)\s*[×xX]/);
  if (mult) return Math.max(1, parseInt(mult[1], 10));
  const total = notes.match(/\b(\d+)\s*(?:units?|marines?|lings?)?\b/i);
  if (total) return Math.max(1, parseInt(total[1], 10));
  return 1;
}

function canonicalizeVisionUnitName(raw: string): string | null {
  return normalizeUnitName(raw) ?? normalizeUnitNameFuzzy(raw);
}

export function parseVisionJson(content: string): VisionResult["detectedUnits"] {
  const stripped = content
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      detectedUnits?: {
        name: string;
        confidence?: string;
        notes?: string;
        wave?: number;
        count?: number;
      }[];
    };
    const units = parsed.detectedUnits ?? [];
    const out: VisionResult["detectedUnits"] = [];

    for (const u of units) {
      const canonical = canonicalizeVisionUnitName(u.name);
      if (!canonical) continue;
      const count = parseCountFromNotes(u.notes, u.count);
      const wave = parseWaveValue(u.wave);
      const notes =
        count > 1
          ? `×${count}${u.notes ? ` — ${u.notes}` : ""}`
          : u.notes;
      out.push({
        name: canonical,
        confidence: u.confidence ?? "medium",
        notes,
        wave,
        count,
      });
    }

    const merged = new Map<string, VisionDetectedUnit>();
    for (const unit of out) {
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
        notes: `×${count}${unit.notes ? ` — ${unit.notes}` : ""}`,
      });
    }
    return [...merged.values()];
  } catch {
    return [];
  }
}

export const VISION_USER_TEXT =
  "Direct Strike: tag each unit with wave 1, 2, or 3 based on which enemy wave column it belongs to. JSON only.";
