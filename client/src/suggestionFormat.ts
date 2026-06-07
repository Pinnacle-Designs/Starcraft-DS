import type {
  CounterBuildCount,
  CounterSuggestion,
  UnitTier,
} from "./api";

export function tierLabel(tier: UnitTier | undefined): string | null {
  if (tier == null) return null;
  return `T${tier}`;
}

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

export function allCounterPaths(s: CounterSuggestion): CounterBuildCount[] {
  return s.counterPaths ?? s.buildCounts ?? [];
}

export function coverageSummary(
  suggestions: CounterSuggestion[]
): { covered: number; partial: number; uncovered: number } {
  let covered = 0;
  let partial = 0;
  let uncovered = 0;
  for (const s of suggestions) {
    if (s.coverage === "covered") covered++;
    else if (s.coverage === "partial") partial++;
    else uncovered++;
  }
  return { covered, partial, uncovered };
}

export function formatOwnedNeed(entry: CounterBuildCount): string | null {
  if (entry.owned == null && entry.stillNeed == null) return null;
  const owned = entry.owned ?? 0;
  const need = entry.stillNeed ?? 0;
  if (entry.coverage === "covered") {
    return `You have ${owned}× — covered`;
  }
  if (entry.coverage === "partial") {
    return `You have ${owned}× — add ${need} more`;
  }
  if (owned > 0) {
    return `You have ${owned}× — add ${need} more`;
  }
  return null;
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

export function formatPlatformHint(
  s: CounterSuggestion,
  entry?: CounterBuildCount
): string | null {
  const cap = s.platformCapacity;
  const enemySlots = s.enemyPlatformSlots;
  const lane = s.enemyPlatformLane;
  if (!cap || enemySlots == null || !lane) return null;

  const laneCap = lane === "air" ? cap.air : cap.ground;
  const gridNote =
    cap.ground === 216 ? " (18×12 diamond grid)" : "";
  const enemyPart = `Enemy uses ~${Math.round(enemySlots)}/${laneCap} ${lane} cells${gridNote}`;

  if (!entry?.platformSlotsPerUnit) return enemyPart;

  const per = entry.platformSlotsPerUnit;
  const max = entry.maxOnPlatform;
  const stackSlots = (entry.suggested ?? 1) * per;
  const counterPart = `your ${entry.suggested ?? 1}× ${entry.name} ≈ ${stackSlots} ${entry.platformLane ?? lane} cells`;
  const limitPart =
    entry.platformLimited && max != null
      ? ` (platform max ~${max}×)`
      : max != null
        ? ` (fits up to ~${max}× on platform)`
        : "";

  return `${enemyPart}; ${counterPart}${limitPart}.`;
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
