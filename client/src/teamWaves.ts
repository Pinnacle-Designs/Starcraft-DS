import type { PlayerRace, TeamWaves, TierUnlocked, UnitTier, WaveShift } from "./api";

export type { TeamWaves, WaveShift, TierUnlocked };

export const DEFAULT_TEAM_WAVES: TeamWaves = ["Terran", null, null];
export const DEFAULT_TIER_UNLOCKED: TierUnlocked = [1, 2, 3];

export function primaryTeamRace(teams: TeamWaves): PlayerRace {
  return teams[0];
}

/** Map enemy wave tag to your team wave slot after shift (capped at 3). */
export function teamWaveForEnemy(
  enemyWave: 1 | 2 | 3 | undefined,
  shift: WaveShift
): 1 | 2 | 3 {
  const shifted = (enemyWave ?? 1) + shift;
  return Math.min(3, Math.max(1, shifted)) as 1 | 2 | 3;
}

/** Player race for countering an enemy in the given wave (falls back to earlier waves). */
export function raceForWave(
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

export function raceForEnemyWave(
  teams: TeamWaves,
  enemyWave: 1 | 2 | 3 | undefined,
  shift: WaveShift
): { race: PlayerRace; teamWave: 1 | 2 | 3 } {
  const teamWave = teamWaveForEnemy(enemyWave, shift);
  return { race: raceForWave(teams, teamWave), teamWave };
}

export function setTeamWaveRace(
  teams: TeamWaves,
  waveIndex: 0 | 1 | 2,
  race: PlayerRace | null
): TeamWaves {
  if (waveIndex === 0) {
    if (race === null) return teams;
    return [race, teams[1], teams[2]];
  }
  if (waveIndex === 1) return [teams[0], race, teams[2]];
  return [teams[0], teams[1], race];
}

export function toggleTeamWaveRace(
  teams: TeamWaves,
  waveIndex: 0 | 1 | 2,
  race: PlayerRace
): TeamWaves {
  if (waveIndex > 0 && teams[waveIndex] === race) {
    return setTeamWaveRace(teams, waveIndex, null);
  }
  return setTeamWaveRace(teams, waveIndex, race);
}

export function setTierUnlockedForWave(
  tiers: TierUnlocked,
  waveIndex: 0 | 1 | 2,
  tier: UnitTier
): TierUnlocked {
  const next = [...tiers] as TierUnlocked;
  next[waveIndex] = tier;
  return next;
}
