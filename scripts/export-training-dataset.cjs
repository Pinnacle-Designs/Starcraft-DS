#!/usr/bin/env node
/**
 * Export saved vision training samples to JSONL for fine-tuning or review.
 * Usage: node scripts/export-training-dataset.cjs [output.jsonl]
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const trainingDir = path.join(root, "data", "training");
const indexPath = path.join(trainingDir, "index.json");
const outPath =
  process.argv[2] ||
  path.join(trainingDir, `export-${new Date().toISOString().slice(0, 10)}.jsonl`);

if (!fs.existsSync(indexPath)) {
  console.error("No training data yet. Capture a screen and fix unit labels first.");
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const samples = index.samples ?? [];
if (samples.length === 0) {
  console.error("Training index is empty.");
  process.exit(1);
}

const lines = samples.map((sample) => {
  const imagePath = path.join(trainingDir, sample.imageFile);
  const imageBase64 = fs.existsSync(imagePath)
    ? fs.readFileSync(imagePath).toString("base64")
    : null;
  return JSON.stringify({
    id: sample.id,
    createdAt: sample.createdAt,
    source: sample.source,
    provider: sample.provider,
    imageBase64,
    rawDetected: sample.rawDetected,
    corrected: sample.corrected,
    teamRaces: sample.teamRaces,
    waveShift: sample.waveShift,
    scene: sample.scene,
  });
});

fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Exported ${samples.length} samples to ${outPath}`);
