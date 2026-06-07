import { getAllUnitNames, getAliasEntries } from "../counterService.js";
import type { VisionResult } from "./shared.js";

function normalizeOcrText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[|'`"[\]{}]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < b.length; j++) {
      const next =
        a[i] === b[j]
          ? row[j]
          : Math.min(row[j] + 1, row[j + 1] + 1, prev + 1);
      row[j] = prev;
      prev = next;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function fuzzyMaxDistance(token: string): number {
  if (token.length <= 4) return 1;
  if (token.length <= 7) return 2;
  return 3;
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

  return found;
}

function detectFuzzy(text: string): VisionResult["detectedUnits"] {
  const normalized = normalizeOcrText(text);
  const tokens = normalized.split(" ").filter((t) => t.length >= 3);
  const found: VisionResult["detectedUnits"] = [];
  const seen = new Set<string>();

  const tryMatch = (candidate: string, unit: string) => {
    if (seen.has(unit) || candidate.length < 3) return;
    const target = candidate.replace(/\s+/g, "");
    const unitKey = unit.toLowerCase().replace(/\s+/g, "");
    if (target.length < unitKey.length - 2) return;
    if (levenshtein(target, unitKey) <= fuzzyMaxDistance(unitKey)) {
      seen.add(unit);
      found.push({ name: unit, confidence: "low", notes: "fuzzy OCR match" });
    }
  };

  const names = getAllUnitNames().sort((a, b) => b.length - a.length);
  for (const name of names) {
    const key = name.toLowerCase();
    const parts = key.split(" ");
    for (const token of tokens) tryMatch(token, name);
    for (let i = 0; i < tokens.length - 1; i++) {
      if (parts.length >= 2) {
        tryMatch(`${tokens[i]} ${tokens[i + 1]}`, name);
      }
    }
  }

  const aliases = getAliasEntries();
  for (const { alias, unit } of aliases) {
    for (const token of tokens) tryMatch(token, unit);
    if (alias.toLowerCase().split(" ").length >= 2) {
      for (let i = 0; i < tokens.length - 1; i++) {
        tryMatch(`${tokens[i]} ${tokens[i + 1]}`, unit);
      }
    }
  }

  return found;
}

/** Match unit names anywhere in OCR text (exact first, then fuzzy). */
export function detectFromText(text: string): VisionResult {
  const exact = detectExact(text);
  const detectedUnits =
    exact.length > 0 ? exact : detectFuzzy(text);
  return { detectedUnits, mode: "heuristic" };
}
