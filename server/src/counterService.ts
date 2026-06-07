import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  parseEnemyCount,
  suggestBuildCounts,
  type BuildCount,
} from "./counterQuantities.js";

export type PlayerRace = "Protoss" | "Terran" | "Zerg";

export type UnitTier = 1 | 2 | 3;
export type TierUnlocked = [UnitTier, UnitTier, UnitTier];
export type CoverageStatus = "covered" | "partial" | "uncovered";

export interface CounterSuggestion {
  enemyUnit: string;
  /** Enemy wave tag (1–3) this suggestion was generated from. */
  enemyWave?: 1 | 2 | 3;
  /** Enemy unit production tier (1–3). */
  enemyTier?: UnitTier;
  build: string[];
  /** Suggested count per counter unit to handle the detected enemy stack. */
  buildCounts?: BuildCount[];
  /** All viable counter paths with inventory and tier metadata. */
  counterPaths?: BuildCount[];
  /** Best-path coverage from your current army. */
  coverage?: CoverageStatus;
  /** Enemy stack size used for the estimate. */
  enemyCount?: number;
  counterType: "hard" | "soft" | "general";
  tip?: string;
  playerRace?: PlayerRace;
  teamWave?: 1 | 2 | 3;
}

interface UnitEntry {
  race: string;
  weakAgainst: Record<string, string[]>;
  counters?: Record<string, string[]>;
  tips?: string;
}

interface CountersDb {
  units: Record<string, UnitEntry>;
  aliases: Record<string, string>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../../data/counters.json");
const tierPath = join(__dirname, "../../data/unit-tiers.json");

let db: CountersDb | null = null;
let unitTiers: Record<string, number> | null = null;

function loadUnitTiers(): Record<string, number> {
  if (!unitTiers) {
    const raw = JSON.parse(readFileSync(tierPath, "utf-8")) as Record<
      string,
      number
    >;
    unitTiers = {};
    for (const [name, tier] of Object.entries(raw)) {
      if (name.startsWith("_")) continue;
      unitTiers[name] = tier;
    }
  }
  return unitTiers;
}

export function getUnitTier(unitName: string): number {
  return loadUnitTiers()[unitName] ?? 2;
}

export function getUnitTiersMap(): Record<string, number> {
  return { ...loadUnitTiers() };
}

function loadDb(): CountersDb {
  if (!db) {
    db = JSON.parse(readFileSync(dataPath, "utf-8")) as CountersDb;
  }
  return db;
}

export function normalizeUnitName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const data = loadDb();
  if (data.units[trimmed]) return trimmed;
  const key = trimmed.toLowerCase();
  for (const [name] of Object.entries(data.units)) {
    if (name.toLowerCase() === key) return name;
  }
  if (data.aliases[key]) {
    const canonical = data.aliases[key];
    if (data.units[canonical]) return canonical;
  }
  for (const [alias, canonical] of Object.entries(data.aliases)) {
    if (alias.toLowerCase() === key && data.units[canonical]) return canonical;
  }
  return null;
}

/** Keep only buildable army units for the countering player's race. */
function filterBuildForRace(
  build: string[],
  playerRace: PlayerRace,
  units: Record<string, UnitEntry>
): string[] {
  return build.filter((counter) => {
    const entry = units[counter];
    return entry?.race === playerRace;
  });
}

function asUnitTier(tier: number): UnitTier {
  if (tier <= 1) return 1;
  if (tier >= 3) return 3;
  return 2;
}

function tierOfUnit(unitName: string): UnitTier {
  return asUnitTier(getUnitTier(unitName));
}

/**
 * Prefer counters your team wave can build without extra tier upgrades.
 * Within affordable options, list lower tech first (T1 beating T2/T3 in DS).
 */
function prioritizeCountersForTeamWave(
  build: string[],
  teamWave: 1 | 2 | 3
): string[] {
  if (build.length <= 1) return build;

  const tierOf = (name: string) => tierOfUnit(name);
  const affordable = build.filter((c) => tierOf(c) <= teamWave);
  const needsTech = build.filter((c) => tierOf(c) > teamWave);

  const sortLowFirst = (list: string[]) =>
    [...list].sort((a, b) => {
      const diff = tierOf(a) - tierOf(b);
      if (diff !== 0) return diff;
      return build.indexOf(a) - build.indexOf(b);
    });

  if (affordable.length > 0) {
    return [...sortLowFirst(affordable), ...sortLowFirst(needsTech)];
  }
  return sortLowFirst(build);
}

function coverageForCounts(owned: number, suggested: number): CoverageStatus {
  if (owned >= suggested) return "covered";
  if (owned > 0) return "partial";
  return "uncovered";
}

function maxTierForWave(
  tierUnlocked: TierUnlocked | undefined,
  teamWave: 1 | 2 | 3
): UnitTier {
  if (tierUnlocked) return tierUnlocked[teamWave - 1];
  return teamWave as UnitTier;
}

function friendlyInventoryForWave(
  friendlyUnits: Array<{ name: string; count: number; wave?: 1 | 2 | 3 }>,
  teamWave: 1 | 2 | 3,
  playerRace: PlayerRace,
  units: Record<string, UnitEntry>
): Record<string, number> {
  const inv: Record<string, number> = {};
  for (const raw of friendlyUnits) {
    const name = normalizeUnitName(raw.name);
    if (!name || raw.count <= 0) continue;
    if ((raw.wave ?? 1) !== teamWave) continue;
    const entry = units[name];
    if (entry?.race !== playerRace) continue;
    inv[name] = (inv[name] ?? 0) + Math.floor(raw.count);
  }
  return inv;
}

function enrichCounterPath(
  path: BuildCount,
  enemyTier: UnitTier,
  owned: number,
  maxTier: UnitTier
): BuildCount {
  const counterTier = tierOfUnit(path.name);
  const suggested = path.suggested ?? 1;
  const buildable = counterTier <= maxTier;
  const stillNeed = Math.max(0, suggested - owned);
  const coverage = coverageForCounts(owned, suggested);
  return {
    ...path,
    counterTier,
    budgetOption: counterTier < enemyTier,
    owned,
    stillNeed,
    buildable,
    coverage,
  };
}

function pathSortScore(path: BuildCount): number {
  const coverageRank =
    path.coverage === "covered"
      ? 0
      : path.coverage === "partial"
        ? 1
        : 2;
  const buildableRank = path.buildable === false ? 3 : 0;
  const tier = path.counterTier ?? 2;
  const stillNeed = path.stillNeed ?? path.suggested ?? 99;
  return coverageRank * 1000 + buildableRank * 100 + tier * 10 + stillNeed;
}

function assignRoles(paths: BuildCount[]): BuildCount[] {
  if (paths.length === 0) return [];
  const sorted = [...paths].sort((a, b) => pathSortScore(a) - pathSortScore(b));
  return sorted.map((p, index) => ({
    ...p,
    role: index === 0 ? ("primary" as const) : ("alternative" as const),
  }));
}

function buildCounterPaths(
  rawBuild: string[],
  enemyName: string,
  enemyCount: number,
  enemyTier: UnitTier,
  counterType: "hard" | "soft" | "general",
  inventory: Record<string, number>,
  maxTier: UnitTier
): BuildCount[] {
  const baseCounts = suggestBuildCounts(
    enemyName,
    enemyCount,
    prioritizeCountersForTeamWave(rawBuild, maxTier),
    counterType
  );
  const byName = new Map(baseCounts.map((c) => [c.name, c]));

  const allPaths = rawBuild.map((name) => {
    const base = byName.get(name) ?? {
      name,
      suggested: suggestBuildCounts(enemyName, enemyCount, [name], counterType)[0]
        ?.suggested,
      role: "alternative" as const,
    };
    return enrichCounterPath(
      base,
      enemyTier,
      inventory[name] ?? 0,
      maxTier
    );
  });

  return assignRoles(allPaths);
}

function bestCoverage(paths: BuildCount[]): CoverageStatus {
  const primary = paths.find((p) => p.role === "primary");
  return primary?.coverage ?? "uncovered";
}

export function getAllUnitNames(): string[] {
  return Object.keys(loadDb().units);
}

export function getAliasEntries(): { alias: string; unit: string }[] {
  const data = loadDb();
  return Object.entries(data.aliases)
    .filter(([, unit]) => data.units[unit])
    .map(([alias, unit]) => ({ alias, unit }));
}

export function getUnitsByRace(): Record<PlayerRace, string[]> {
  const data = loadDb();
  const byRace: Record<PlayerRace, string[]> = {
    Protoss: [],
    Terran: [],
    Zerg: [],
  };
  for (const [name, entry] of Object.entries(data.units)) {
    const race = entry.race as PlayerRace;
    if (byRace[race]) byRace[race].push(name);
  }
  const tiers = loadUnitTiers();
  for (const race of Object.keys(byRace) as PlayerRace[]) {
    byRace[race].sort((a, b) => {
      const ta = tiers[a] ?? 2;
      const tb = tiers[b] ?? 2;
      if (ta !== tb) return ta - tb;
      return a.localeCompare(b);
    });
  }
  return byRace;
}

export type TeamWaves = [PlayerRace, PlayerRace | null, PlayerRace | null];

export type WaveShift = 0 | 1 | 2;

function teamWaveForEnemy(
  enemyWave: 1 | 2 | 3 | undefined,
  shift: WaveShift
): 1 | 2 | 3 {
  const shifted = (enemyWave ?? 1) + shift;
  return Math.min(3, Math.max(1, shifted)) as 1 | 2 | 3;
}

function parseWaveShift(value: unknown): WaveShift {
  const n = Number(value);
  if (n === 1 || n === 2) return n;
  return 0;
}

function raceForWave(
  teams: TeamWaves,
  wave: 1 | 2 | 3 | undefined
): PlayerRace {
  const idx = (wave ?? 1) - 1;
  for (let i = idx; i >= 0; i--) {
    const race = teams[i];
    if (race) return race;
  }
  return teams[0];
}

function parseTeamRaces(
  teamRaces: unknown,
  fallback: PlayerRace
): TeamWaves {
  if (!Array.isArray(teamRaces) || teamRaces.length < 1) {
    return [fallback, null, null];
  }
  const races = ["Protoss", "Terran", "Zerg"] as const;
  const pick = (v: unknown): PlayerRace | null =>
    typeof v === "string" && races.includes(v as PlayerRace)
      ? (v as PlayerRace)
      : null;
  return [
    pick(teamRaces[0]) ?? fallback,
    pick(teamRaces[1]),
    pick(teamRaces[2]),
  ];
}

export function getSuggestions(
  enemyUnits: string[],
  playerRace: PlayerRace
): CounterSuggestion[] {
  return getSuggestionsForUnits(
    enemyUnits.map((name) => ({ name })),
    [playerRace, null, null]
  );
}

function parseTierUnlocked(
  input: unknown,
  fallback: TierUnlocked = [1, 2, 3]
): TierUnlocked {
  if (!Array.isArray(input) || input.length < 3) return fallback;
  const pick = (v: unknown, def: UnitTier): UnitTier => {
    const n = Number(v);
    if (n === 1 || n === 2 || n === 3) return n;
    return def;
  };
  return [
    pick(input[0], fallback[0]),
    pick(input[1], fallback[1]),
    pick(input[2], fallback[2]),
  ];
}

export function getSuggestionsForUnits(
  units: Array<{
    name: string;
    count?: number;
    notes?: string;
    wave?: 1 | 2 | 3;
  }>,
  teamRaces: TeamWaves,
  waveShift: WaveShift = 0,
  friendlyUnits: Array<{
    name: string;
    count: number;
    wave?: 1 | 2 | 3;
  }> = [],
  tierUnlocked: TierUnlocked = [1, 2, 3]
): CounterSuggestion[] {
  const data = loadDb();
  const suggestions: CounterSuggestion[] = [];
  const seen = new Set<string>();

  for (const raw of units) {
    const name = normalizeUnitName(raw.name);
    if (!name) continue;
    const teamWave = teamWaveForEnemy(raw.wave, waveShift);
    const playerRace = raceForWave(teamRaces, teamWave);
    const dedupeKey = `${name}:${playerRace}:${raw.wave ?? 0}:${waveShift}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const entry = data.units[name];
    if (!entry) continue;

    const rawBuild = filterBuildForRace(
      entry.weakAgainst[playerRace] ?? [],
      playerRace,
      data.units
    );
    if (rawBuild.length === 0) continue;

    const enemyTier = tierOfUnit(name);
    const maxTier = maxTierForWave(tierUnlocked, teamWave);
    const inventory = friendlyInventoryForWave(
      friendlyUnits,
      teamWave,
      playerRace,
      data.units
    );
    const counterType =
      rawBuild.length <= 2 ? ("hard" as const) : ("soft" as const);
    const enemyCount = parseEnemyCount(raw.notes, raw.count);
    const enemyWave = raw.wave ?? 1;

    const counterPaths = buildCounterPaths(
      rawBuild,
      name,
      enemyCount,
      enemyTier,
      counterType,
      inventory,
      maxTier
    );
    const build = counterPaths.map((p) => p.name);

    suggestions.push({
      enemyUnit: name,
      enemyWave,
      enemyTier,
      build: [...build],
      buildCounts: counterPaths,
      counterPaths,
      coverage: bestCoverage(counterPaths),
      enemyCount,
      counterType,
      tip: entry.tips || undefined,
      playerRace,
      teamWave,
    });
  }

  return suggestions;
}

export { parseTeamRaces, parseWaveShift, parseTierUnlocked };

export function getUnitInfo(unitName: string) {
  const name = normalizeUnitName(unitName);
  if (!name) return null;
  return loadDb().units[name] ?? null;
}
