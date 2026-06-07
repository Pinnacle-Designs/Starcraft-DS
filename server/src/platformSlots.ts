import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export type PlatformLane = "ground" | "air";

export interface UnitPlatformFootprint {
  ground: number;
  air: number;
}

export interface PlatformCapacity {
  ground: number;
  air: number;
}

export interface PlatformGrid {
  width: number;
  height: number;
  shape: string;
  groundCells: number;
  airCells: number;
}

interface PlatformDb {
  platformGrid?: PlatformGrid;
  platformCapacity: PlatformCapacity;
  units: Record<string, UnitPlatformFootprint>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformPath = join(__dirname, "../../data/unit-platform.json");

let db: PlatformDb | null = null;

function loadDb(): PlatformDb {
  if (!db) {
    db = JSON.parse(readFileSync(platformPath, "utf-8")) as PlatformDb;
  }
  return db;
}

export function getPlatformCapacity(): PlatformCapacity {
  return { ...loadDb().platformCapacity };
}

export function getPlatformGrid(): PlatformGrid | null {
  const grid = loadDb().platformGrid;
  return grid ? { ...grid } : null;
}

export function getUnitPlatformFootprint(
  unitName: string
): UnitPlatformFootprint {
  const entry = loadDb().units[unitName];
  return entry ?? { ground: 2, air: 0 };
}

/** Lane this unit occupies on the DS staging platform. */
export function platformLaneForUnit(unitName: string): PlatformLane {
  const fp = getUnitPlatformFootprint(unitName);
  return fp.air > 0 && fp.ground <= 0 ? "air" : "ground";
}

export function platformSlotsForUnit(unitName: string): number {
  const fp = getUnitPlatformFootprint(unitName);
  const lane = platformLaneForUnit(unitName);
  return lane === "air" ? Math.max(0.5, fp.air) : Math.max(0.5, fp.ground);
}

export function maxUnitsOnPlatform(unitName: string): number {
  const cap = getPlatformCapacity();
  const lane = platformLaneForUnit(unitName);
  const perUnit = platformSlotsForUnit(unitName);
  const laneCap = lane === "air" ? cap.air : cap.ground;
  return Math.max(1, Math.floor(laneCap / perUnit));
}

export function stackPlatformSlots(
  unitName: string,
  count: number
): { lane: PlatformLane; slots: number; capacity: number } {
  const lane = platformLaneForUnit(unitName);
  const perUnit = platformSlotsForUnit(unitName);
  const cap = getPlatformCapacity();
  const laneCap = lane === "air" ? cap.air : cap.ground;
  return {
    lane,
    slots: perUnit * count,
    capacity: laneCap,
  };
}
