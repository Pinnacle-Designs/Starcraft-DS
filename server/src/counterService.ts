import { readFileSync } from "fs";
import {
  enemyStackPlatformUsage,
  parseEnemyCount,
  suggestBuildCounts,
  type BuildCount,
} from "./counterQuantities.js";
import { getPlatformCapacity } from "./platformSlots.js";
import { getStackCost, getUnitCost } from "./unitCosts.js";
import { dataPath } from "./dataPaths.js";

export type PlayerRace = "Protoss" | "Terran" | "Zerg";

export type UnitTier = 1 | 2 | 3;
export type TierUnlocked = [UnitTier, UnitTier, UnitTier];
export type CoverageStatus = "covered" | "partial" | "uncovered";

export interface CounterSuggestion {
  enemyUnit: string;
  /** Estimated mineral cost of the detected enemy stack. */
  enemyStackMinerals?: number;
  /** Estimated gas cost of the detected enemy stack. */
  enemyStackGas?: number;
  /** Mineral-equivalent cost of the enemy stack (minerals + gas×2.5). */
  enemyStackCost?: number;
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
  /** Enemy stack footprint on the DS wave platform. */
  enemyPlatformLane?: "ground" | "air";
  enemyPlatformSlots?: number;
  platformCapacity?: { ground: number; air: number };
  /** Max tech tier the user unlocked for the countering team wave. */
  maxTierUnlocked?: UnitTier;
  /** Counters that need a higher tier than the user selected (shown separately). */
  lockedCounters?: BuildCount[];
  /** Strongest counter for this matchup (may need higher tech than selected). */
  bestOverallCounter?: BuildCount;
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

const countersFile = dataPath("counters.json");
const tiersFile = dataPath("unit-tiers.json");

let db: CountersDb | null = null;
let unitTiers: Record<string, number> | null = null;

function loadUnitTiers(): Record<string, number> {
  if (!unitTiers) {
    const raw = JSON.parse(readFileSync(tiersFile, "utf-8")) as Record<
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
    db = JSON.parse(readFileSync(countersFile, "utf-8")) as CountersDb;
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

function unitNameDistance(a: string, b: string): number {
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

/** Fuzzy match for vision model typos (e.g. "Marauder" vs "Marauders"). */
export function normalizeUnitNameFuzzy(raw: string): string | null {
  const exact = normalizeUnitName(raw);
  if (exact) return exact;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (key.length < 3) return null;

  let best: { name: string; dist: number } | null = null;
  for (const name of getAllUnitNames()) {
    const nkey = name.toLowerCase().replace(/[^a-z]/g, "");
    const dist = unitNameDistance(key, nkey);
    const maxDist = Math.max(1, Math.floor(nkey.length * 0.28));
    if (dist <= maxDist && (!best || dist < best.dist)) {
      best = { name, dist };
    }
  }
  return best?.name ?? null;
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

/**
 * If unit U's counters list includes the enemy, U is good against that enemy.
 * Example: Cyclone counters Phoenix → Terran should build Cyclone vs Phoenix.
 */
function supplementCountersFromMatchups(
  enemyName: string,
  enemyRace: string,
  playerRace: PlayerRace,
  units: Record<string, UnitEntry>,
  existing: string[]
): string[] {
  const ordered = [...existing];
  const seen = new Set(existing);
  for (const [unitName, unitEntry] of Object.entries(units)) {
    if (unitEntry.race !== playerRace) continue;
    const beats = unitEntry.counters?.[enemyRace] ?? [];
    if (!beats.includes(enemyName) || seen.has(unitName)) continue;
    seen.add(unitName);
    ordered.push(unitName);
  }
  return ordered;
}

function asUnitTier(tier: number): UnitTier {
  if (tier <= 1) return 1;
  if (tier >= 3) return 3;
  return 2;
}

function tierOfUnit(unitName: string): UnitTier {
  return asUnitTier(getUnitTier(unitName));
}

const NON_COMBAT_UNITS = new Set([
  "Queen",
  "Observer",
  "Overseer",
  "Medivac",
  "Raven",
  "Sentry",
]);

/**
 * Order counters for the user's selected max tech tier.
 * Prefer units at exactly maxTier, then lower tiers within budget.
 */
function prioritizeCountersByTech(
  build: string[],
  maxTier: UnitTier,
  enemyTier: UnitTier
): string[] {
  if (build.length <= 1) return build;

  const tierOf = (name: string) => tierOfUnit(name);
  return [...build].sort((a, b) => {
    const aTier = tierOf(a);
    const bTier = tierOf(b);
    const aMaxGap = Math.abs(aTier - maxTier);
    const bMaxGap = Math.abs(bTier - maxTier);
    if (aMaxGap !== bMaxGap) return aMaxGap - bMaxGap;
    if (enemyTier >= 3) {
      const aEnemyGap = Math.abs(aTier - enemyTier);
      const bEnemyGap = Math.abs(bTier - enemyTier);
      if (aEnemyGap !== bEnemyGap) return aEnemyGap - bEnemyGap;
    }
    if (aTier !== bTier) return bTier - aTier;
    return build.indexOf(a) - build.indexOf(b);
  });
}

function fallbackUnitsForMaxTier(
  playerRace: PlayerRace,
  maxTier: UnitTier
): string[] {
  const units = getUnitsByRace()[playerRace] ?? [];
  const atMax = units.filter(
    (name) => tierOfUnit(name) === maxTier && !NON_COMBAT_UNITS.has(name)
  );
  const below = units.filter(
    (name) => tierOfUnit(name) < maxTier && !NON_COMBAT_UNITS.has(name)
  );
  return [...atMax, ...below].slice(0, 5);
}

function resolveCountersForTier(
  rawBuild: string[],
  maxTier: UnitTier,
  playerRace: PlayerRace
): { buildable: string[]; locked: string[] } {
  const seen = new Set<string>();
  const buildable: string[] = [];
  const locked: string[] = [];

  for (const name of rawBuild) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (tierOfUnit(name) <= maxTier) buildable.push(name);
    else locked.push(name);
  }

  if (buildable.length === 0) {
    for (const name of fallbackUnitsForMaxTier(playerRace, maxTier)) {
      if (!seen.has(name)) {
        seen.add(name);
        buildable.push(name);
      }
    }
  }

  return { buildable, locked };
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
  maxTier: UnitTier,
  dedicatedCounter = false,
  enemyStackCost?: number
): BuildCount {
  const counterTier = tierOfUnit(path.name);
  const suggested = path.suggested ?? 1;
  const buildable = counterTier <= maxTier;
  const stillNeed = Math.max(0, suggested - owned);
  const coverage = coverageForCounts(owned, suggested);
  const buildCount = coverage === "covered" ? suggested : stillNeed || suggested;
  const unitCost = getUnitCost(path.name);
  const stackCost = getStackCost(path.name, buildCount);
  return {
    ...path,
    counterTier,
    budgetOption:
      counterTier < enemyTier ||
      (enemyStackCost != null &&
        enemyStackCost > 0 &&
        stackCost.total < enemyStackCost * 0.85),
    owned,
    stillNeed,
    buildable,
    coverage,
    dedicatedCounter,
    unitMinerals: unitCost.minerals,
    unitGas: unitCost.gas,
    stackMinerals: stackCost.minerals,
    stackGas: stackCost.gas,
    stackCost: stackCost.total,
  };
}

/** Rank by matchup quality only — ignores the user's tech cap. */
function pathSortScoreOverall(
  path: BuildCount,
  enemyTier: UnitTier,
  sourceRank: number
): number {
  const coverageRank =
    path.coverage === "covered"
      ? 0
      : path.coverage === "partial"
        ? 1
        : 2;
  const dedicatedRank = path.dedicatedCounter ? 0 : 1;
  const counterTier = path.counterTier ?? 2;

  let tierRank: number;
  if (enemyTier >= 3) {
    tierRank = Math.abs(counterTier - enemyTier) * 4;
  } else {
    tierRank =
      counterTier < enemyTier
        ? 6
        : Math.abs(counterTier - enemyTier) * 3;
  }

  const stillNeed = path.stillNeed ?? path.suggested ?? 99;
  const stackCost = path.stackCost ?? getStackCost(path.name, stillNeed).total;
  const costRank = Math.floor(stackCost / 75);
  return (
    coverageRank * 1000 +
    dedicatedRank * 60 +
    sourceRank * 15 +
    tierRank * 10 +
    costRank * 2 +
    stillNeed
  );
}

function pathSortScore(
  path: BuildCount,
  enemyTier: UnitTier,
  maxTier: UnitTier,
  sourceRank = 99
): number {
  const coverageRank =
    path.coverage === "covered"
      ? 0
      : path.coverage === "partial"
        ? 1
        : 2;
  const buildableRank = path.buildable === false ? 3 : 0;
  const dedicatedRank = path.dedicatedCounter ? 0 : 1;
  const counterTier = path.counterTier ?? 2;

  const tierMatchRank =
    path.buildable === false
      ? 40
      : Math.abs(counterTier - maxTier) * 4;

  let tierRank: number;
  if (enemyTier >= 3 && maxTier >= 3 && path.buildable !== false) {
    const gap = Math.abs(counterTier - enemyTier);
    tierRank = gap * 5 - counterTier;
  } else if (path.budgetOption) {
    tierRank = counterTier;
  } else {
    tierRank = counterTier + (counterTier < enemyTier ? 5 : 0);
  }

  const stillNeed = path.stillNeed ?? path.suggested ?? 99;
  const stackCost = path.stackCost ?? getStackCost(path.name, stillNeed).total;
  const costRank = Math.floor(stackCost / 75);
  return (
    coverageRank * 1000 +
    buildableRank * 100 +
    dedicatedRank * 40 +
    sourceRank * 12 +
    tierMatchRank * 8 +
    tierRank * 10 +
    costRank * 2 +
    stillNeed
  );
}

function prioritizeCountersOverall(
  build: string[],
  enemyTier: UnitTier
): string[] {
  return [...build].sort((a, b) => {
    const aTier = tierOfUnit(a);
    const bTier = tierOfUnit(b);
    if (enemyTier >= 3) {
      const aGap = Math.abs(aTier - enemyTier);
      const bGap = Math.abs(bTier - enemyTier);
      if (aGap !== bGap) return aGap - bGap;
    }
    if (aTier !== bTier) return bTier - aTier;
    return build.indexOf(a) - build.indexOf(b);
  });
}

function makeCounterPaths(
  unitList: string[],
  enemyName: string,
  enemyRace: string,
  playerRace: PlayerRace,
  enemyCount: number,
  enemyTier: UnitTier,
  counterType: "hard" | "soft" | "general",
  inventory: Record<string, number>,
  maxTier: UnitTier,
  units: Record<string, UnitEntry>,
  orderUnits: string[]
): BuildCount[] {
  const dedicated = dedicatedCounterNames(
    enemyName,
    enemyRace,
    playerRace,
    units
  );
  const sourceIndex = new Map(orderUnits.map((name, index) => [name, index]));
  const baseCounts = suggestBuildCounts(
    enemyName,
    enemyCount,
    unitList,
    counterType
  );
  const byName = new Map(baseCounts.map((c) => [c.name, c]));
  const enemyStack = getStackCost(enemyName, enemyCount);

  return unitList.map((name) => {
    const base = byName.get(name) ?? {
      name,
      suggested:
        suggestBuildCounts(enemyName, enemyCount, [name], counterType)[0]
          ?.suggested,
      role: "alternative" as const,
    };
    const path = enrichCounterPath(
      base,
      enemyTier,
      inventory[name] ?? 0,
      maxTier,
      dedicated.has(name),
      enemyStack.total
    );
    return { ...path, sourceRank: sourceIndex.get(name) ?? 99 };
  });
}

function pickBestOverallCounter(
  paths: Array<BuildCount & { sourceRank?: number }>,
  enemyTier: UnitTier
): BuildCount | undefined {
  if (paths.length === 0) return undefined;
  const sorted = [...paths].sort(
    (a, b) =>
      pathSortScoreOverall(a, enemyTier, a.sourceRank ?? 99) -
      pathSortScoreOverall(b, enemyTier, b.sourceRank ?? 99)
  );
  return sorted[0];
}

function assignRoles(
  paths: Array<BuildCount & { sourceRank?: number }>,
  enemyTier: UnitTier,
  maxTier: UnitTier
): BuildCount[] {
  if (paths.length === 0) return [];
  const score = (p: BuildCount & { sourceRank?: number }) =>
    pathSortScore(p, enemyTier, maxTier, p.sourceRank ?? 99);
  const sorted = [...paths]
    .filter((p) => p.buildable !== false)
    .sort((a, b) => score(a) - score(b));
  return sorted.map((p, index) => {
    const { sourceRank: _sourceRank, ...rest } = p;
    return {
      ...rest,
      role: index === 0 ? ("primary" as const) : ("alternative" as const),
    };
  });
}

function dedicatedCounterNames(
  enemyName: string,
  enemyRace: string,
  playerRace: PlayerRace,
  units: Record<string, UnitEntry>
): Set<string> {
  const names = new Set<string>();
  for (const [unitName, unitEntry] of Object.entries(units)) {
    if (unitEntry.race !== playerRace) continue;
    const beats = unitEntry.counters?.[enemyRace] ?? [];
    if (beats.includes(enemyName)) names.add(unitName);
  }
  return names;
}

function buildCounterPaths(
  rawBuild: string[],
  enemyName: string,
  enemyRace: string,
  playerRace: PlayerRace,
  enemyCount: number,
  enemyTier: UnitTier,
  counterType: "hard" | "soft" | "general",
  inventory: Record<string, number>,
  maxTier: UnitTier,
  units: Record<string, UnitEntry>
): BuildCount[] {
  const ordered = prioritizeCountersByTech(rawBuild, maxTier, enemyTier);
  const paths = makeCounterPaths(
    ordered,
    enemyName,
    enemyRace,
    playerRace,
    enemyCount,
    enemyTier,
    counterType,
    inventory,
    maxTier,
    units,
    rawBuild
  );
  return assignRoles(paths, enemyTier, maxTier);
}

function buildLockedCounterPaths(
  rawBuild: string[],
  enemyName: string,
  enemyRace: string,
  playerRace: PlayerRace,
  enemyCount: number,
  enemyTier: UnitTier,
  counterType: "hard" | "soft" | "general",
  inventory: Record<string, number>,
  maxTier: UnitTier,
  units: Record<string, UnitEntry>
): BuildCount[] {
  if (rawBuild.length === 0) return [];

  const dedicated = dedicatedCounterNames(
    enemyName,
    enemyRace,
    playerRace,
    units
  );
  const enemyStack = getStackCost(enemyName, enemyCount);

  return rawBuild.map((name) => {
    const suggested =
      suggestBuildCounts(enemyName, enemyCount, [name], counterType)[0]
        ?.suggested ?? 1;
    return {
      ...enrichCounterPath(
        { name, suggested, role: "alternative" },
        enemyTier,
        inventory[name] ?? 0,
        maxTier,
        dedicated.has(name),
        enemyStack.total
      ),
      role: "alternative" as const,
      buildable: false,
    };
  });
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
      supplementCountersFromMatchups(
        name,
        entry.race,
        playerRace,
        data.units,
        entry.weakAgainst[playerRace] ?? []
      ),
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

    const overallOrder = prioritizeCountersOverall(rawBuild, enemyTier);
    const allMatchupPaths = makeCounterPaths(
      overallOrder,
      name,
      entry.race,
      playerRace,
      enemyCount,
      enemyTier,
      counterType,
      inventory,
      maxTier,
      data.units,
      rawBuild
    );
    const bestOverallCounter = pickBestOverallCounter(
      allMatchupPaths,
      enemyTier
    );

    const { buildable, locked } = resolveCountersForTier(
      rawBuild,
      maxTier,
      playerRace
    );
    const counterPaths = buildCounterPaths(
      buildable,
      name,
      entry.race,
      playerRace,
      enemyCount,
      enemyTier,
      counterType,
      inventory,
      maxTier,
      data.units
    );
    const lockedCounters =
      locked.length > 0
        ? buildLockedCounterPaths(
            locked,
            name,
            entry.race,
            playerRace,
            enemyCount,
            enemyTier,
            counterType,
            inventory,
            maxTier,
            data.units
          )
        : undefined;
    const build = counterPaths.map((p) => p.name);
    const enemyPlatform = enemyStackPlatformUsage(name, enemyCount);
    const enemyStack = getStackCost(name, enemyCount);

    suggestions.push({
      enemyUnit: name,
      enemyStackMinerals: enemyStack.minerals,
      enemyStackGas: enemyStack.gas,
      enemyStackCost: enemyStack.total,
      enemyWave,
      enemyTier,
      maxTierUnlocked: maxTier,
      bestOverallCounter: bestOverallCounter
        ? (() => {
            const { sourceRank: _sourceRank, ...rest } =
              bestOverallCounter as BuildCount & { sourceRank?: number };
            return rest;
          })()
        : undefined,
      build: [...build],
      buildCounts: counterPaths,
      counterPaths,
      lockedCounters,
      coverage: bestCoverage(counterPaths),
      enemyCount,
      counterType,
      tip: entry.tips || undefined,
      playerRace,
      teamWave,
      enemyPlatformLane: enemyPlatform.lane,
      enemyPlatformSlots: enemyPlatform.slots,
      platformCapacity: getPlatformCapacity(),
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
