import { getTrainingExamplesForPrompt } from "./trainingStore.js";
import type { TrainingSample, TrainingUnitLabel } from "./types.js";

function formatLabels(labels: TrainingUnitLabel[]): string {
  if (labels.length === 0) return "[]";
  return JSON.stringify(
    labels.map((u) => ({
      name: u.name,
      wave: u.wave ?? 1,
      count: u.count,
      confidence: "high",
    }))
  );
}

function formatExample(sample: TrainingSample, index: number): string {
  return [
    `Correction ${index + 1} (different past battle — do NOT copy these units):`,
    `Model wrongly detected: ${formatLabels(sample.rawDetected)}`,
    `User's actual units on that older screenshot: ${formatLabels(sample.corrected)}`,
  ].join("\n");
}

export function buildTrainingPromptSection(): string {
  // Text-only corrections caused the model to parrot past waves; opt in explicitly.
  if (process.env.VISION_USE_TRAINING_EXAMPLES !== "true") return "";

  const examples = getTrainingExamplesForPrompt();
  if (examples.length === 0) return "";

  const body = examples.map((sample, i) => formatExample(sample, i)).join("\n\n");
  return `\n\nPast correction notes (OTHER screenshots — not this image):
${body}

IMPORTANT: Analyze ONLY the screenshot attached to this message. Past corrections describe different battles.
- Never repeat unit names from correction notes unless you clearly see matching sprites in THIS image.
- If this screenshot shows one Sentry, return only Sentry — not units from past examples.
- When unsure or the battlefield is sparse, return {"detectedUnits":[]}.`;
}
