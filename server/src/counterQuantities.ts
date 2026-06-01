import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const supplyPath = join(__dirname, "../../data/unit-supply.json");

let unitSupply: Record<string, number> | null = null;

function loadUnitSupply(): Record<string, number> {
  if (!unitSupply) {
    const raw = JSON.parse(readFileSync(supplyPath, "utf-8")) as Record<
      string,
      number
    >;
    unitSupply = {};
    for (const [name, supply] of Object.entries(raw)) {
      if (name.startsWith("_")) continue;
      unitSupply[name] = supply;
    }
  }
  return unitSupply;
}

export function getUnitSupply(unitName: string): number {
  return loadUnitSupply()[unitName] ?? 2;
}

/** Parse enemy stack size from manual count or vision notes (e.g. ×12). */
export function parseEnemyCount(notes?: string, count?: number): number {
  if (count != null && count > 0) {
    return Math.min(9999, Math.floor(count));
  }
  if (!notes?.trim()) return 1;

  const xMatch = notes.match(/[×xX]\s*(\d+)/);
  if (xMatch) return Math.max(1, parseInt(xMatch[1], 10) || 1);

  const countMatch = notes.match(
    /\b(?:about|approx\.?|~)?\s*(\d{1,4})\s*(?:units?|stack|lings?|marines?)?\b/i
  );
  if (countMatch) return Math.max(1, parseInt(countMatch[1], 10) || 1);

  return 1;
}

export interface BuildCount {
  name: string;
  /** Estimated count if you use this counter on its own. */
  suggested?: number;
  role: "primary" | "alternative";
}

const HARD_SUPPLY_RATIO = 0.72;
const SOFT_SUPPLY_RATIO = 1.38;
const GENERAL_SUPPLY_RATIO = 1;

function suggestCountForCounter(
  targetCounterSupply: number,
  counterName: string
): number {
  const unitSupply = Math.max(0.5, getUnitSupply(counterName));
  return Math.max(1, Math.ceil(targetCounterSupply / unitSupply));
}

export function suggestBuildCounts(
  enemyName: string,
  enemyCount: number,
  counterUnits: string[],
  counterType: "hard" | "soft" | "general"
): BuildCount[] {
  if (counterUnits.length === 0 || enemyCount <= 0) return [];

  const ratio =
    counterType === "hard"
      ? HARD_SUPPLY_RATIO
      : counterType === "soft"
        ? SOFT_SUPPLY_RATIO
        : GENERAL_SUPPLY_RATIO;

  const enemySupply = getUnitSupply(enemyName) * enemyCount;
  const targetCounterSupply = Math.max(1, enemySupply * ratio);

  return counterUnits.map((name, index) => ({
    name,
    suggested: suggestCountForCounter(targetCounterSupply, name),
    role: index === 0 ? ("primary" as const) : ("alternative" as const),
  }));
}
