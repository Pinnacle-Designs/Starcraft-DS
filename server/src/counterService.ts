import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export type PlayerRace = "Protoss" | "Terran" | "Zerg";

export interface CounterSuggestion {
  enemyUnit: string;
  build: string[];
  counterType: "hard" | "soft" | "general";
  tip?: string;
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

let db: CountersDb | null = null;

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
  if (data.aliases[key]) return data.aliases[key];
  for (const [alias, canonical] of Object.entries(data.aliases)) {
    if (alias.toLowerCase() === key) return canonical;
  }
  return null;
}

export function getAllUnitNames(): string[] {
  return Object.keys(loadDb().units);
}

export function getSuggestions(
  enemyUnits: string[],
  playerRace: PlayerRace
): CounterSuggestion[] {
  const data = loadDb();
  const suggestions: CounterSuggestion[] = [];
  const seen = new Set<string>();

  for (const raw of enemyUnits) {
    const name = normalizeUnitName(raw);
    if (!name) continue;
    const dedupeKey = `${name}:${playerRace}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const entry = data.units[name];
    if (!entry) continue;

    const build = entry.weakAgainst[playerRace] ?? [];
    if (build.length === 0) continue;

    suggestions.push({
      enemyUnit: name,
      build: [...build],
      counterType: build.length <= 2 ? "hard" : "soft",
      tip: entry.tips || undefined,
    });
  }

  return suggestions;
}

export function getUnitInfo(unitName: string) {
  const name = normalizeUnitName(unitName);
  if (!name) return null;
  return loadDb().units[name] ?? null;
}
