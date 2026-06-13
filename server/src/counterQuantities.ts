import { readFileSync } from "fs";
import { dataPath } from "./dataPaths.js";
import {
  maxUnitsOnPlatform,
  platformLaneForUnit,
  platformSlotsForUnit,
  stackPlatformSlots,
  type PlatformLane,
} from "./platformSlots.js";

const supplyPath = dataPath("unit-supply.json");

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

export type UnitTier = 1 | 2 | 3;

export type CoverageStatus = "covered" | "partial" | "uncovered";

export interface BuildCount {
  name: string;
  /** Estimated count if you use this counter on its own. */
  suggested?: number;
  role: "primary" | "alternative";
  /** Production tech tier of this counter unit. */
  counterTier?: UnitTier;
  /** True when counter is lower tech than the enemy (mass T1 can work in Direct Strike). */
  budgetOption?: boolean;
  /** Friendly units already on the matching team wave. */
  owned?: number;
  /** Additional units needed beyond what you own. */
  stillNeed?: number;
  /** Whether your wave has unlocked this counter's tech tier. */
  buildable?: boolean;
  coverage?: CoverageStatus;
  /** Unit's counters list explicitly includes this enemy. */
  dedicatedCounter?: boolean;
  /** Ground or air lane on the Direct Strike wave platform. */
  platformLane?: PlatformLane;
  /** Platform slots one unit consumes (ground or air). */
  platformSlotsPerUnit?: number;
  /** Max count of this unit that fits your wave platform lane. */
  maxOnPlatform?: number;
  /** True when count was reduced to fit the staging platform. */
  platformLimited?: boolean;
  /** Per-unit mineral cost. */
  unitMinerals?: number;
  /** Per-unit vespene cost. */
  unitGas?: number;
  /** Total minerals to build the suggested stack. */
  stackMinerals?: number;
  /** Total gas to build the suggested stack. */
  stackGas?: number;
  /** minerals + gas×2.5 for the suggested stack. */
  stackCost?: number;
}

const HARD_SUPPLY_RATIO = 0.72;
const SOFT_SUPPLY_RATIO = 1.38;
const GENERAL_SUPPLY_RATIO = 1;

function suggestCountForCounter(
  targetCounterSupply: number,
  counterName: string
): { suggested: number; platformLimited: boolean; maxOnPlatform: number } {
  const unitSupply = Math.max(0.5, getUnitSupply(counterName));
  const supplyBased = Math.max(1, Math.ceil(targetCounterSupply / unitSupply));
  const platformMax = maxUnitsOnPlatform(counterName);
  const suggested = Math.min(supplyBased, platformMax);
  return {
    suggested,
    platformLimited: suggested < supplyBased,
    maxOnPlatform: platformMax,
  };
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

  return counterUnits.map((name, index) => {
    const count = suggestCountForCounter(targetCounterSupply, name);
    return {
      name,
      suggested: count.suggested,
      role: index === 0 ? ("primary" as const) : ("alternative" as const),
      platformLane: platformLaneForUnit(name),
      platformSlotsPerUnit: platformSlotsForUnit(name),
      maxOnPlatform: count.maxOnPlatform,
      platformLimited: count.platformLimited,
    };
  });
}

export function enemyStackPlatformUsage(
  enemyName: string,
  enemyCount: number
): { lane: PlatformLane; slots: number; capacity: number } {
  return stackPlatformSlots(enemyName, enemyCount);
}
