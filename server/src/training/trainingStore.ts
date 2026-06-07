import { randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type {
  TrainingIndex,
  TrainingSample,
  TrainingSource,
  TrainingStats,
  TrainingUnitLabel,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const trainingDir = join(__dirname, "../../../data/training");
const samplesDir = join(trainingDir, "samples");
const indexPath = join(trainingDir, "index.json");
const MAX_SAMPLES = Number(process.env.TRAINING_MAX_SAMPLES || 500);
const TRAINING_RETENTION_DAYS = Number(process.env.TRAINING_RETENTION_DAYS || 10);
export const TRAINING_RETENTION_MS =
  TRAINING_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function deleteSampleImage(sample: TrainingSample) {
  const imagePath = join(trainingDir, sample.imageFile);
  try {
    if (existsSync(imagePath)) unlinkSync(imagePath);
  } catch {
    /* ignore */
  }
}

function pruneExpiredSamples(index: TrainingIndex): TrainingIndex {
  const cutoff = Date.now() - TRAINING_RETENTION_MS;
  const kept: TrainingSample[] = [];
  for (const sample of index.samples) {
    if (sample.createdAt >= cutoff) kept.push(sample);
    else deleteSampleImage(sample);
  }
  if (kept.length !== index.samples.length) {
    index.samples = kept;
    writeIndex(index);
  }
  return index;
}

function enforceSampleLimit(index: TrainingIndex): TrainingIndex {
  const before = index.samples.length;
  while (index.samples.length > MAX_SAMPLES) {
    const removed = index.samples.shift();
    if (removed) deleteSampleImage(removed);
  }
  if (index.samples.length !== before) writeIndex(index);
  return index;
}

function ensureDirs() {
  if (!existsSync(trainingDir)) mkdirSync(trainingDir, { recursive: true });
  if (!existsSync(samplesDir)) mkdirSync(samplesDir, { recursive: true });
}

function readIndex(): TrainingIndex {
  ensureDirs();
  if (!existsSync(indexPath)) {
    return { version: 1, samples: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as TrainingIndex;
    if (parsed?.version === 1 && Array.isArray(parsed.samples)) {
      return enforceSampleLimit(pruneExpiredSamples(parsed));
    }
  } catch {
    /* rebuild */
  }
  return { version: 1, samples: [] };
}

function writeIndex(index: TrainingIndex) {
  ensureDirs();
  writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
}

function normalizeLabels(labels: TrainingUnitLabel[]): TrainingUnitLabel[] {
  return labels
    .filter((u) => u.name?.trim() && u.count > 0)
    .map((u) => ({
      name: u.name.trim(),
      count: Math.max(1, Math.floor(u.count)),
      wave:
        u.wave === 1 || u.wave === 2 || u.wave === 3 ? u.wave : undefined,
    }))
    .sort((a, b) => {
      const waveA = a.wave ?? 0;
      const waveB = b.wave ?? 0;
      if (waveA !== waveB) return waveA - waveB;
      return a.name.localeCompare(b.name);
    });
}

function labelsKey(labels: TrainingUnitLabel[]): string {
  return JSON.stringify(normalizeLabels(labels));
}

function decodeImage(imageBase64: string): Buffer {
  const raw = imageBase64.includes(",")
    ? imageBase64.split(",")[1]!
    : imageBase64;
  return Buffer.from(raw, "base64");
}

function imageExtension(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

export function getTrainingStats(): TrainingStats {
  const index = readIndex();
  const corrected = index.samples.filter(
    (s) => labelsKey(s.rawDetected) !== labelsKey(s.corrected)
  ).length;
  const confirmed = index.samples.filter(
    (s) =>
      labelsKey(s.rawDetected) === labelsKey(s.corrected) &&
      s.corrected.length > 0
  ).length;
  const last = index.samples[index.samples.length - 1];
  return {
    total: index.samples.length,
    corrected,
    confirmed,
    lastSavedAt: last?.createdAt ?? null,
    examplesInPrompt: Number(process.env.VISION_TRAINING_EXAMPLES_MAX || 5),
    retentionDays: TRAINING_RETENTION_DAYS,
  };
}

export function listTrainingSamples(limit = 50): TrainingSample[] {
  const index = readIndex();
  return index.samples.slice(-limit).reverse();
}

export function getTrainingExamplesForPrompt(
  max = Number(process.env.VISION_TRAINING_EXAMPLES_MAX || 2)
): TrainingSample[] {
  const index = readIndex();
  if (!max || max <= 0) return [];

  // Text-only few-shot from confirmed labels causes the model to parrot past waves.
  // Only inject samples where the user corrected a wrong detection.
  const corrections = index.samples.filter(
    (s) => labelsKey(s.rawDetected) !== labelsKey(s.corrected)
  );

  return corrections.slice(-max).reverse();
}

export interface SaveCorrectionInput {
  imageBase64: string;
  mimeType?: string;
  rawDetected: TrainingUnitLabel[];
  corrected: TrainingUnitLabel[];
  source: TrainingSource;
  provider?: string;
  teamRaces?: TrainingSample["teamRaces"];
  waveShift?: number;
  scene?: string;
  force?: boolean;
}

export function saveTrainingCorrection(
  input: SaveCorrectionInput
): { saved: boolean; sample?: TrainingSample; reason?: string } {
  const raw = normalizeLabels(input.rawDetected);
  const corrected = normalizeLabels(input.corrected);

  if (!input.imageBase64?.trim()) {
    return { saved: false, reason: "imageBase64 required" };
  }
  if (corrected.length === 0) {
    return { saved: false, reason: "corrected labels required" };
  }
  if (!input.force && labelsKey(raw) === labelsKey(corrected)) {
    return { saved: false, reason: "labels unchanged" };
  }

  const index = readIndex();
  const duplicate = index.samples.find(
    (s) =>
      labelsKey(s.rawDetected) === labelsKey(raw) &&
      labelsKey(s.corrected) === labelsKey(corrected) &&
      Date.now() - s.createdAt < 60_000
  );
  if (duplicate) {
    return { saved: false, reason: "duplicate", sample: duplicate };
  }

  const id = randomUUID();
  const ext = imageExtension(input.mimeType ?? "image/jpeg");
  const imageFile = `samples/${id}.${ext}`;
  const imagePath = join(trainingDir, imageFile);

  ensureDirs();
  writeFileSync(imagePath, decodeImage(input.imageBase64));

  const sample: TrainingSample = {
    id,
    createdAt: Date.now(),
    source: input.source,
    provider: input.provider,
    imageFile,
    rawDetected: raw,
    corrected,
    teamRaces: input.teamRaces,
    waveShift: input.waveShift,
    scene: input.scene?.slice(0, 240),
  };

  index.samples.push(sample);
  pruneExpiredSamples(index);
  enforceSampleLimit(index);
  writeIndex(index);
  return { saved: true, sample };
}
