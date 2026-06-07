import {
  analyzeFrame,
  analyzeVisionQuick,
  type AnalyzeOptions,
  type AnalyzeResponse,
  type PlayerRace,
  type TeamWaves,
  type UnitsByRace,
  type WaveShift,
} from "./api";
import { detectedToManual } from "./detectedUnits";
import {
  manualArmyEntries,
  mergeDetectedIntoActiveWave,
  type ManualWavesState,
} from "./manualArmy";

const RACES: PlayerRace[] = ["Protoss", "Terran", "Zerg"];

function inferEnemyRace(
  unitNames: string[],
  byRace: UnitsByRace
): PlayerRace | undefined {
  for (const race of RACES) {
    const roster = byRace[race] ?? [];
    if (unitNames.some((name) => roster.includes(name))) return race;
  }
  return undefined;
}

export interface ScreenCaptureApplyResult {
  waves: ManualWavesState;
  result: AnalyzeResponse;
  addedCount: number;
  detectedNames: string[];
  visionMode: AnalyzeResponse["mode"];
}

export async function applyScreenCaptureToWaves({
  imageBase64,
  manualWaves,
  teamWaves,
  waveShift,
  analyzeOptions,
  byRace,
}: {
  imageBase64: string;
  manualWaves: ManualWavesState;
  teamWaves: TeamWaves;
  waveShift: WaveShift;
  analyzeOptions?: AnalyzeOptions;
  byRace?: UnitsByRace;
}): Promise<ScreenCaptureApplyResult> {
  const vision = await analyzeVisionQuick(imageBase64);
  const detected = detectedToManual(vision.detectedUnits);
  const enemyRace =
    byRace && detected.length
      ? inferEnemyRace(
          detected.map((u) => u.name),
          byRace
        )
      : undefined;

  const merged = mergeDetectedIntoActiveWave(
    manualWaves,
    detected,
    enemyRace
  );

  const result = await analyzeFrame(
    "",
    teamWaves,
    manualArmyEntries(merged),
    waveShift,
    analyzeOptions
  );

  return {
    waves: merged,
    result,
    addedCount: detected.reduce((sum, u) => sum + u.count, 0),
    detectedNames: detected.map((u) => u.name),
    visionMode: vision.mode,
  };
}
