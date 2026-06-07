import type { ManualUnitInput, TeamWaves, WaveShift } from "./api";

export type TrainingSource =
  | "overlay-hotkey"
  | "analyze-frame"
  | "live-coach"
  | "manual-confirm";

export interface TrainingStats {
  total: number;
  corrected: number;
  confirmed: number;
  lastSavedAt: number | null;
  examplesInPrompt: number;
}

export interface PendingVisionCapture {
  imageBase64: string;
  rawDetected: ManualUnitInput[];
  source: TrainingSource;
  provider?: string;
  scene?: string;
  capturedAt: number;
}

export interface SubmitCorrectionInput {
  imageBase64: string;
  rawDetected: ManualUnitInput[];
  corrected: ManualUnitInput[];
  source: TrainingSource;
  provider?: string;
  teamRaces?: TeamWaves;
  waveShift?: WaveShift;
  scene?: string;
  force?: boolean;
}

export function labelsEqual(
  a: ManualUnitInput[],
  b: ManualUnitInput[]
): boolean {
  const norm = (units: ManualUnitInput[]) =>
    JSON.stringify(
      units
        .filter((u) => u.count > 0)
        .map((u) => ({
          name: u.name,
          count: u.count,
          wave: u.wave ?? null,
        }))
        .sort((x, y) => {
          const waveA = x.wave ?? 0;
          const waveB = y.wave ?? 0;
          if (waveA !== waveB) return waveA - waveB;
          return x.name.localeCompare(y.name);
        })
    );
  return norm(a) === norm(b);
}

export async function fetchTrainingStats(): Promise<TrainingStats> {
  const res = await fetch("/api/training/stats");
  if (!res.ok) throw new Error("Failed to load training stats");
  return res.json() as Promise<TrainingStats>;
}

export async function submitVisionCorrection(
  input: SubmitCorrectionInput
): Promise<{ saved: boolean; stats: TrainingStats; reason?: string }> {
  const res = await fetch("/api/training/corrections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: input.imageBase64,
      mimeType: "image/jpeg",
      rawDetected: input.rawDetected,
      corrected: input.corrected,
      source: input.source,
      provider: input.provider,
      teamRaces: input.teamRaces,
      waveShift: input.waveShift,
      scene: input.scene,
      force: input.force,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Training save failed (${res.status})`);
  }
  const data = (await res.json()) as {
    saved: boolean;
    stats: TrainingStats;
    reason?: string;
  };
  return data;
}
