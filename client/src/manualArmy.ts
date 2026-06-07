import type { ManualUnitInput, PlayerRace, TeamWaves } from "./api";

export type WaveIndex = 0 | 1 | 2;

export interface ManualArmyState {
  enemyRace: PlayerRace;
  counts: Record<string, number>;
}

export interface ManualWavesState {
  activeWave: WaveIndex;
  waves: [ManualArmyState, ManualArmyState, ManualArmyState];
}

export const WAVE_DEFS: {
  index: WaveIndex;
  label: string;
  colorClass: string;
}[] = [
  { index: 0, label: "Wave 1", colorClass: "wave-red" },
  { index: 1, label: "Wave 2", colorClass: "wave-amber" },
  { index: 2, label: "Wave 3", colorClass: "wave-cyan" },
];

function emptyWave(): ManualArmyState {
  return { enemyRace: "Zerg", counts: {} };
}

export const EMPTY_MANUAL_WAVES: ManualWavesState = {
  activeWave: 0,
  waves: [emptyWave(), emptyWave(), emptyWave()],
};

export function activeWaveArmy(state: ManualWavesState): ManualArmyState {
  return state.waves[state.activeWave];
}

export function updateActiveWave(
  state: ManualWavesState,
  army: ManualArmyState
): ManualWavesState {
  const waves = [...state.waves] as ManualWavesState["waves"];
  waves[state.activeWave] = army;
  return { ...state, waves };
}

export function updateWave(
  state: ManualWavesState,
  waveIndex: WaveIndex,
  army: ManualArmyState
): ManualWavesState {
  const waves = [...state.waves] as ManualWavesState["waves"];
  waves[waveIndex] = army;
  return { ...state, waves, activeWave: waveIndex };
}

export function setActiveWave(
  state: ManualWavesState,
  activeWave: WaveIndex
): ManualWavesState {
  return { ...state, activeWave };
}

export function manualArmyEntries(state: ManualWavesState): ManualUnitInput[] {
  const out: ManualUnitInput[] = [];
  for (let i = 0; i < 3; i++) {
    const wave = (i + 1) as 1 | 2 | 3;
    for (const [name, count] of Object.entries(state.waves[i].counts)) {
      if (count > 0) out.push({ name, count, wave });
    }
  }
  return out;
}

export function hasManualArmy(state: ManualWavesState): boolean {
  return manualArmyEntries(state).length > 0;
}

export function manualArmyTotal(state: ManualWavesState): number {
  return manualArmyEntries(state).reduce((sum, u) => sum + u.count, 0);
}

export function waveEntries(army: ManualArmyState): ManualUnitInput[] {
  return Object.entries(army.counts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count }));
}

export function setUnitCount(
  army: ManualArmyState,
  unitName: string,
  count: number
): ManualArmyState {
  const next = { ...army.counts };
  const n = Math.max(0, Math.floor(count) || 0);
  if (n <= 0) delete next[unitName];
  else next[unitName] = n;
  return { ...army, counts: next };
}

export function clearWaveArmy(army: ManualArmyState): ManualArmyState {
  return { ...army, counts: {} };
}

export function clearAllWaves(state: ManualWavesState): ManualWavesState {
  return {
    ...state,
    waves: [emptyWave(), emptyWave(), emptyWave()],
  };
}

export function setEnemyRace(
  _army: ManualArmyState,
  enemyRace: PlayerRace
): ManualArmyState {
  return { enemyRace, counts: {} };
}

/** Add vision-detected units into the active enemy wave (sums counts). */
export function mergeDetectedIntoActiveWave(
  state: ManualWavesState,
  detected: ManualUnitInput[],
  enemyRace?: PlayerRace
): ManualWavesState {
  if (detected.length === 0) return state;
  const army = state.waves[state.activeWave];
  let nextArmy: ManualArmyState = { ...army, counts: { ...army.counts } };
  for (const unit of detected) {
    const existing = nextArmy.counts[unit.name] ?? 0;
    nextArmy = setUnitCount(nextArmy, unit.name, existing + unit.count);
  }
  if (enemyRace) {
    nextArmy = { ...nextArmy, enemyRace };
  }
  return updateActiveWave(state, nextArmy);
}

/** Sync friendly wave race labels from team selection (keeps counts). */
export function syncFriendlyWaveRaces(
  state: ManualWavesState,
  teamWaves: TeamWaves
): ManualWavesState {
  const waves = state.waves.map((wave, i) => {
    const race =
      teamWaves[i] ??
      teamWaves[i - 1] ??
      teamWaves[0];
    return { ...wave, enemyRace: race };
  }) as ManualWavesState["waves"];
  return { ...state, waves };
}
