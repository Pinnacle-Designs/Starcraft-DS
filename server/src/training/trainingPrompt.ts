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
  const wasWrong = JSON.stringify(sample.rawDetected) !== JSON.stringify(sample.corrected);
  const header = wasWrong
    ? `Example ${index + 1} (user corrected a wrong detection):`
    : `Example ${index + 1} (user confirmed labels):`;
  const wrongLine = wasWrong
    ? `Wrong output: ${formatLabels(sample.rawDetected)}`
    : null;
  return [
    header,
    wrongLine,
    `Correct output: ${formatLabels(sample.corrected)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTrainingPromptSection(): string {
  if (process.env.VISION_USE_TRAINING_EXAMPLES === "false") return "";

  const examples = getTrainingExamplesForPrompt();
  if (examples.length === 0) return "";

  const body = examples.map((sample, i) => formatExample(sample, i)).join("\n\n");
  return `\n\nLearn from these past screenshots the user labeled on their machine:\n${body}\n\nMatch the corrected JSON style on new screenshots. If nothing is clearly visible, return {"detectedUnits":[]}.`;
}
