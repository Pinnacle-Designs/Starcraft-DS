import type {
  AnalyzeResponse,
  DetectedUnit,
  ManualUnitInput,
  PlayerRace,
  TeamWaves,
  TierUnlocked,
  UnitTier,
  WaveShift,
} from "./api";

interface CountersDb {
  units: Record<
    string,
    {
      race: string;
      weakAgainst: Record<string, string[]>;
      tips?: string;
    }
  >;
  aliases?: Record<string, string>;
}

interface UnitCatalogJson {
  byRace: Record<PlayerRace, string[]>;
  tierByUnit: Record<string, number>;
}

let countersCache: CountersDb | null = null;
let catalogCache: UnitCatalogJson | null = null;
let countersPromise: Promise<CountersDb> | null = null;
let catalogPromise: Promise<UnitCatalogJson> | null = null;

function dataUrl(file: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  if (base === "./") return `./data/${file}`;
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}data/${file}`;
}

async function loadCounters(): Promise<CountersDb> {
  if (countersCache) return countersCache;
  if (!countersPromise) {
    countersPromise = fetch(dataUrl("counters.json"))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load counter data");
        return res.json() as Promise<CountersDb>;
      })
      .then((data) => {
        countersCache = data;
        return data;
      })
      .catch((err) => {
        countersPromise = null;
        throw err;
      });
  }
  return countersPromise;
}

async function loadCatalog(): Promise<UnitCatalogJson> {
  if (catalogCache) return catalogCache;
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [counters, tiersRes] = await Promise.all([
        loadCounters(),
        fetch(dataUrl("unit-tiers.json")),
      ]);
      if (!tiersRes.ok) throw new Error("Failed to load unit tiers");
      const tierByUnit = (await tiersRes.json()) as Record<string, number>;
      const byRace: Record<PlayerRace, string[]> = {
        Protoss: [],
        Terran: [],
        Zerg: [],
      };
      for (const [name, entry] of Object.entries(counters.units)) {
        const race = entry.race as PlayerRace;
        if (byRace[race]) byRace[race].push(name);
      }
      for (const race of Object.keys(byRace) as PlayerRace[]) {
        byRace[race].sort((a, b) => {
          const ta = tierByUnit[a] ?? 2;
          const tb = tierByUnit[b] ?? 2;
          if (ta !== tb) return ta - tb;
          return a.localeCompare(b);
        });
      }
      const data = { byRace, tierByUnit };
      catalogCache = data;
      return data;
    })().catch((err) => {
      catalogPromise = null;
      throw err;
    });
  }
  return catalogPromise;
}

function normalizeName(raw: string, db: CountersDb): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (db.units[trimmed]) return trimmed;
  const alias = db.aliases?.[trimmed.toLowerCase()];
  if (alias && db.units[alias]) return alias;
  const match = Object.keys(db.units).find(
    (name) => name.toLowerCase() === trimmed.toLowerCase()
  );
  return match ?? null;
}

function raceForWave(teams: TeamWaves, wave: number): PlayerRace {
  const idx = Math.min(2, Math.max(0, wave - 1));
  for (let i = idx; i >= 0; i--) {
    const race = teams[i];
    if (race) return race;
  }
  return teams[0];
}

function maxTierForWave(tiers: TierUnlocked, wave: number): UnitTier {
  const idx = Math.min(2, Math.max(0, wave - 1));
  return tiers[idx];
}

function tierOf(
  name: string,
  tierByUnit: Record<string, number>
): UnitTier {
  const tier = tierByUnit[name] ?? 2;
  if (tier === 1 || tier === 2 || tier === 3) return tier;
  return 2;
}

export async function fetchStaticUnitCatalog() {
  return loadCatalog();
}

export async function analyzeManualStatic(
  manualUnits: ManualUnitInput[],
  teamRaces: TeamWaves,
  waveShift: WaveShift = 0,
  tierUnlocked: TierUnlocked = [1, 2, 3]
): Promise<AnalyzeResponse> {
  const db = await loadCounters();
  const catalog = await loadCatalog();
  const { tierByUnit } = catalog;
  const detectedUnits: DetectedUnit[] = [];
  const suggestions = [];

  for (const unit of manualUnits) {
    const name = normalizeName(unit.name, db);
    if (!name) continue;
    const entry = db.units[name];
    const enemyWave = unit.wave ?? 1;
    const teamWave = Math.min(
      3,
      Math.max(1, enemyWave + waveShift)
    ) as 1 | 2 | 3;
    const playerRace = raceForWave(teamRaces, teamWave);
    const maxTier = maxTierForWave(tierUnlocked, teamWave);
    const rawBuild = entry.weakAgainst[playerRace] ?? [];
    const buildable = rawBuild.filter(
      (counter) => tierOf(counter, tierByUnit) <= maxTier
    );
    const build =
      buildable.length > 0
        ? buildable.slice(0, 4)
        : rawBuild.slice(0, 4);
    const count = unit.count ?? 1;

    detectedUnits.push({
      name,
      confidence: "manual",
      wave: unit.wave,
      count,
    });

    const bestOverallName = rawBuild[0];
    suggestions.push({
      enemyUnit: name,
      build,
      buildCounts: build.map((counter, index) => ({
        name: counter,
        suggested: Math.max(1, Math.ceil(count * (index === 0 ? 1.2 : 1))),
        role: index === 0 ? ("primary" as const) : ("alternative" as const),
        counterTier: tierOf(counter, tierByUnit),
        buildable: buildable.includes(counter),
        maxTierUnlocked: maxTier,
      })),
      enemyCount: count,
      counterType: build.length <= 2 ? ("hard" as const) : ("soft" as const),
      tip: entry.tips || undefined,
      playerRace,
      teamWave,
      enemyWave,
      enemyTier: tierOf(name, tierByUnit),
      maxTierUnlocked: maxTier,
      bestOverallCounter:
        bestOverallName && bestOverallName !== build[0]
          ? {
              name: bestOverallName,
              suggested: count,
              counterTier: tierOf(bestOverallName, tierByUnit),
              buildable: buildable.includes(bestOverallName),
              role: "alternative" as const,
            }
          : undefined,
      lockedCounters: rawBuild
        .filter((counter) => !buildable.includes(counter))
        .slice(0, 4)
        .map((counter) => ({
          name: counter,
          suggested: count,
          counterTier: tierOf(counter, tierByUnit),
          buildable: false,
          role: "alternative" as const,
        })),
    });
  }

  return {
    mode: "heuristic",
    detectedUnits,
    suggestions,
    playerRace: teamRaces[0],
    teamRaces,
    waveShift,
  };
}
