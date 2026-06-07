import { getAllUnitNames, getAliasEntries } from "../counterService.js";
import type { VisionResult } from "./shared.js";

function normalizeOcrText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[|'`"[\]{}]/g, " ")
    .replace(/[^a-z0-9\s×x]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCountEvidence(snippet: string): boolean {
  return (
    /[×x]\s*\d+/.test(snippet) ||
    /\d+\s*[×x]/.test(snippet) ||
    /\b\d{1,4}\s*(?:units?|stack|army)?\b/.test(snippet)
  );
}

function parseNearbyCount(snippet: string): number | undefined {
  const mult =
    snippet.match(/[×x]\s*(\d+)/) ?? snippet.match(/(\d+)\s*[×x]/);
  if (mult) return Math.max(1, parseInt(mult[1], 10));
  const total = snippet.match(/\b(\d{1,4})\b/);
  if (total) return Math.max(1, parseInt(total[1], 10));
  return undefined;
}

function detectExact(text: string): VisionResult["detectedUnits"] {
  const lower = normalizeOcrText(text);
  const found: VisionResult["detectedUnits"] = [];
  const seen = new Set<string>();

  const matchPhrase = (phrase: string, unit: string) => {
    if (seen.has(unit)) return;
    const pattern = phrase
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    const regex = new RegExp(
      `(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`,
      "g"
    );
    const multiWord = phrase.trim().includes(" ");

    for (const match of lower.matchAll(regex)) {
      const index = match.index ?? 0;
      const start = Math.max(0, index - 48);
      const end = Math.min(lower.length, index + match[0].length + 48);
      const window = lower.slice(start, end);

      if (!multiWord && !hasCountEvidence(window)) continue;

      const count = parseNearbyCount(window);
      seen.add(unit);
      found.push({
        name: unit,
        confidence: "medium",
        notes: count && count > 1 ? `×${count}` : "OCR with count",
        count,
      });
      return;
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

  return found;
}

/** Match unit names in OCR text only when backed by a nearby stack count. */
export function detectFromText(text: string): VisionResult {
  return { detectedUnits: detectExact(text), mode: "heuristic" };
}
