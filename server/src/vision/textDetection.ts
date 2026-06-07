import { getAllUnitNames, getAliasEntries } from "../counterService.js";
import type { VisionResult } from "./shared.js";

/** Match unit names in free text (word boundaries, longest names first). */
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
