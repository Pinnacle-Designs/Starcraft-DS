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
  replaceDetectedIntoWaves,
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
  detectedUnits: ReturnType<typeof detectedToManual>;
  visionMode: AnalyzeResponse["mode"];
  imageBase64: string;
  visionProvider?: AnalyzeResponse["provider"];
  visionScene?: string;
}

function emptyCounterResult(
  teamWaves: TeamWaves,
  waveShift: WaveShift,
  vision: Awaited<ReturnType<typeof analyzeVisionQuick>>
): AnalyzeResponse {
  return {
    detectedUnits: vision.detectedUnits,
    suggestions: [],
    playerRace: teamWaves[0] ?? "Terran",
    teamRaces: teamWaves,
    waveShift,
    mode: vision.mode,
    provider: vision.provider,
    scene:
      vision.scene ??
      "No enemy units detected on screen — ensure enemies are visible or install Ollama (ollama pull llava).",
  };
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
  if (!imageBase64?.trim()) {
    throw new Error("Screen capture was empty — try the hotkey again.");
  }

  const vision = await analyzeVisionQuick(imageBase64);
  const detected = detectedToManual(vision.detectedUnits);
  const enemyRace =
    byRace && detected.length
      ? inferEnemyRace(
          detected.map((u) => u.name),
          byRace
        )
      : undefined;

  const merged = replaceDetectedIntoWaves(manualWaves, detected, enemyRace);

  const manualUnits = manualArmyEntries(merged);
  const result =
    manualUnits.length > 0
      ? await analyzeFrame(
          "",
          teamWaves,
          manualUnits,
          waveShift,
          analyzeOptions
        )
      : emptyCounterResult(teamWaves, waveShift, vision);

  return {
    waves: merged,
    result,
    addedCount: detected.reduce((sum, u) => sum + u.count, 0),
    detectedNames: detected.map((u) => u.name),
    detectedUnits: detected,
    visionMode: vision.mode,
    imageBase64,
    visionProvider: vision.provider,
    visionScene: vision.scene,
  };
}
