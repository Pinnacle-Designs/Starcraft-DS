import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const costsPath = join(__dirname, "../../data/unit-costs.json");

/** Minerals per vespene when comparing total spend (standard SC2 heuristic). */
export const GAS_MINERAL_VALUE = 2.5;

export interface UnitCost {
  minerals: number;
  gas: number;
}

export interface StackCost extends UnitCost {
  /** minerals + gas * GAS_MINERAL_VALUE */
  total: number;
}

let unitCosts: Record<string, UnitCost> | null = null;

function loadUnitCosts(): Record<string, UnitCost> {
  if (!unitCosts) {
    const raw = JSON.parse(readFileSync(costsPath, "utf-8")) as Record<
      string,
      UnitCost | string
    >;
    unitCosts = {};
    for (const [name, value] of Object.entries(raw)) {
      if (name.startsWith("_") || typeof value !== "object" || value == null) {
        continue;
      }
      unitCosts[name] = {
        minerals: Math.max(0, value.minerals ?? 0),
        gas: Math.max(0, value.gas ?? 0),
      };
    }
  }
  return unitCosts;
}

export function getUnitCost(unitName: string): UnitCost {
  return loadUnitCosts()[unitName] ?? { minerals: 100, gas: 50 };
}

export function mineralEquivalent(cost: UnitCost): number {
  return cost.minerals + cost.gas * GAS_MINERAL_VALUE;
}

export function getStackCost(unitName: string, count: number): StackCost {
  const n = Math.max(0, Math.floor(count));
  const unit = getUnitCost(unitName);
  const minerals = unit.minerals * n;
  const gas = unit.gas * n;
  return {
    minerals,
    gas,
    total: minerals + gas * GAS_MINERAL_VALUE,
  };
}
