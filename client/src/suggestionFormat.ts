import type { CounterBuildCount, CounterSuggestion } from "./api";

export function primaryBuildCount(
  s: CounterSuggestion
): CounterBuildCount | undefined {
  return s.buildCounts?.find((b) => b.role === "primary");
}

export function alternativeBuildCounts(
  s: CounterSuggestion
): CounterBuildCount[] {
  return s.buildCounts?.filter((b) => b.role === "alternative") ?? [];
}

export function formatBuildCountEntry(
  entry: CounterBuildCount,
  includeMultiplier = true
): string {
  if (includeMultiplier && entry.suggested != null) {
    return `${entry.suggested}× ${entry.name}`;
  }
  return entry.name;
}

/** One-line summary for PiP and compact views. */
export function formatCounterBuild(s: CounterSuggestion): string {
  const primary = primaryBuildCount(s);
  const alternatives = alternativeBuildCounts(s);

  if (primary?.suggested != null) {
    const main = formatBuildCountEntry(primary);
    if (alternatives.length === 0) return main;
    const altLine = alternatives
      .map((a) => formatBuildCountEntry(a))
      .join(", ");
    return `${main} — or ${altLine}`;
  }

  if (s.buildCounts?.length) {
    return s.buildCounts.map((b) => b.name).join(", ");
  }

  return s.build.join(", ");
}

export function formatEnemyStack(
  enemyUnit: string,
  enemyCount?: number,
  notes?: string
): string {
  if (enemyCount != null && enemyCount > 1) {
    return `${enemyUnit} ×${enemyCount}`;
  }
  if (notes?.match(/[×xX]\s*\d+/)) {
    return `${enemyUnit} ${notes.match(/[×xX]\s*\d+/)?.[0] ?? ""}`.trim();
  }
  return enemyUnit;
}
