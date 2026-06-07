import type { DetectedUnit, ManualUnitInput } from "./api";

function parseDetectedCount(u: DetectedUnit): number {
  const rawCount = (u as DetectedUnit & { count?: number }).count;
  if (typeof rawCount === "number" && rawCount > 0) {
    return Math.max(1, Math.floor(rawCount));
  }
  const notes = u.notes ?? "";
  const mult = notes.match(/[×xX]\s*(\d+)/) ?? notes.match(/(\d+)\s*[×xX]/);
  if (mult) return Math.max(1, parseInt(mult[1], 10));
  const total = notes.match(/\b(\d{1,3})\b/);
  if (total) return Math.max(1, parseInt(total[1], 10));
  return 1;
}

function parseDetectedWave(u: DetectedUnit): 1 | 2 | 3 | undefined {
  const w = Number(u.wave);
  if (w === 1 || w === 2 || w === 3) return w;
  return undefined;
}

export function detectedToManual(
  units: DetectedUnit[]
): ManualUnitInput[] {
  return units.map((u) => ({
    name: u.name,
    count: parseDetectedCount(u),
    wave: parseDetectedWave(u),
  }));
}
