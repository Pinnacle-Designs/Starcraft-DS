import type { DetectedUnit, ManualUnitInput } from "./api";

export function detectedToManual(
  units: DetectedUnit[]
): ManualUnitInput[] {
  return units.map((u) => ({
    name: u.name,
    count: u.notes?.startsWith("×")
      ? Math.max(1, parseInt(u.notes.slice(1), 10) || 1)
      : 1,
    wave: u.wave,
  }));
}
