import type { PlayerRace } from "../counterService.js";

export type TrainingSource =
  | "overlay-hotkey"
  | "analyze-frame"
  | "live-coach"
  | "manual-confirm";

export interface TrainingUnitLabel {
  name: string;
  count: number;
  wave?: 1 | 2 | 3;
}

export interface TrainingSample {
  id: string;
  createdAt: number;
  source: TrainingSource;
  provider?: string;
  imageFile: string;
  rawDetected: TrainingUnitLabel[];
  corrected: TrainingUnitLabel[];
  teamRaces?: [PlayerRace, PlayerRace | null, PlayerRace | null];
  waveShift?: number;
  scene?: string;
}

export interface TrainingIndex {
  version: 1;
  samples: TrainingSample[];
}

export interface TrainingStats {
  total: number;
  corrected: number;
  confirmed: number;
  lastSavedAt: number | null;
  examplesInPrompt: number;
}
