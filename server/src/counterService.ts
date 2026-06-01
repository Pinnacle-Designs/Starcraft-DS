import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  parseEnemyCount,
  suggestBuildCounts,
  type BuildCount,
} from "./counterQuantities.js";

export type PlayerRace = "Protoss" | "Terran" | "Zerg";

export interface CounterSuggestion {
  enemyUnit: string;
  /** Enemy wave tag (1–3) this suggestion was generated from. */
  enemyWave?: 1 | 2 | 3;
  build: string[];
  /** Suggested count per counter unit to handle the detected enemy stack. */
  buildCounts?: BuildCount[];
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

export function getSuggestionsForUnits(
  units: Array<{
    name: string;
    count?: number;
    notes?: string;
    wave?: 1 | 2 | 3;
  }>,
  teamRaces: TeamWaves,
  waveShift: WaveShift = 0
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

    const build = filterBuildForRace(
      entry.weakAgainst[playerRace] ?? [],
      playerRace,
      data.units
    );
    if (build.length === 0) continue;

    const counterType =
      build.length <= 2 ? ("hard" as const) : ("soft" as const);
    const enemyCount = parseEnemyCount(raw.notes, raw.count);
    const enemyWave = raw.wave ?? 1;

    suggestions.push({
      enemyUnit: name,
      enemyWave,
      build: [...build],
      buildCounts: suggestBuildCounts(name, enemyCount, build, counterType),
      enemyCount,
      counterType,
      tip: entry.tips || undefined,
      playerRace,
      teamWave,
    });
  }

  return suggestions;
}

export { parseTeamRaces, parseWaveShift };

export function getUnitInfo(unitName: string) {
  const name = normalizeUnitName(unitName);
  if (!name) return null;
  return loadDb().units[name] ?? null;
}
