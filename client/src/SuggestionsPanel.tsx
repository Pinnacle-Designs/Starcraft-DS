import { useEffect, useRef } from "react";
import type { AnalyzeResponse, DetectedUnit, PlayerRace } from "./api";
import { WAVE_DEFS } from "./manualArmy";
import {
  allCounterPaths,
  coverageSummary,
  formatOwnedNeed,
  formatEnemyStack,
  formatPlatformHint,
  primaryBuildCount,
  alternativeBuildCounts,
  tierLabel,
} from "./suggestionFormat";

function waveColorClass(wave: DetectedUnit["wave"]): string {
  if (!wave) return "";
  const def = WAVE_DEFS[wave - 1];
  return def?.colorClass ?? "";
}

interface Props {
  playerRace: PlayerRace;
  result: AnalyzeResponse | null;
  compact?: boolean;
  live?: boolean;
  scanning?: boolean;
  lastScanAt?: number | null;
  counterRefreshing?: boolean;
  /** Overlay team panel scrolls the whole window, not an inner list. */
  overlayMode?: boolean;
}

function coverageBadgeClass(status: string | undefined): string {
  if (status === "covered") return "coverage-covered";
  if (status === "partial") return "coverage-partial";
  return "coverage-uncovered";
}

function coverageLabel(status: string | undefined): string {
  if (status === "covered") return "Covered";
  if (status === "partial") return "Partial";
  return "Gap";
}

function formatScanTime(ts: number | null | undefined): string {
  if (!ts) return "";
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 5) return "just now";
  return `${sec}s ago`;
}

export function SuggestionsPanel({
  playerRace,
  result,
  compact,
  live,
  scanning,
  lastScanAt,
  counterRefreshing,
  overlayMode,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showUpdatedBadge =
    !live && !scanning && !counterRefreshing && Boolean(lastScanAt);

  useEffect(() => {
    if (compact || overlayMode) return;
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 1) return;

      const atTop = scrollTop <= 0;
      const atBottom = scrollTop >= maxScroll - 1;

      if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
        e.preventDefault();
        window.scrollBy({ top: e.deltaY, left: 0 });
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [compact, overlayMode, result?.suggestions?.length]);

  return (
    <div className={`panel-section suggestions${compact ? " suggestions-compact" : ""}`}>
      {!compact && (
        <h2 className="suggestions-title">
          <span className="panel-heading panel-heading-inline">
            Counter suggestions
          </span>
          {live && scanning && (
            <span className="badge badge-live">Scanning…</span>
          )}
          {counterRefreshing && !live && (
            <span className="badge badge-live">Refreshing…</span>
          )}
          {live && !scanning && lastScanAt && (
            <span className="badge badge-live-dim">
              Updated {formatScanTime(lastScanAt)}
            </span>
          )}
          {showUpdatedBadge && (
            <span className="badge badge-live-dim">
              Updated {formatScanTime(lastScanAt)}
            </span>
          )}
          {result?.mode === "ai" && result.provider === "ollama" && (
            <span className="badge badge-ollama">Ollama</span>
          )}
          {result?.mode === "ai" && result.provider === "openai" && (
            <span className="badge badge-ai">OpenAI</span>
          )}
          {result?.mode === "ai" && !result.provider && (
            <span className="badge badge-ai">AI</span>
          )}
          {result?.mode === "heuristic" &&
            result.detectedUnits.length > 0 &&
            !live && <span className="badge badge-manual">Manual</span>}
        </h2>
      )}

      {compact && live && (
        <div className="pip-bar" style={{ marginBottom: 6 }}>
          {scanning
            ? "● Scanning…"
            : lastScanAt
              ? `Updated ${formatScanTime(lastScanAt)}`
              : "● Waiting for first scan…"}
        </div>
      )}

      {result?.suggestions && result.suggestions.length > 0 && !compact && (() => {
        const summary = coverageSummary(result.suggestions);
        const hasInventory = summary.covered + summary.partial > 0;
        if (!hasInventory && summary.uncovered === result.suggestions.length) return null;
        return (
          <div className="coverage-summary">
            {summary.covered > 0 ? (
              <span className="coverage-summary-item coverage-covered">
                {summary.covered} covered
              </span>
            ) : null}
            {summary.partial > 0 ? (
              <span className="coverage-summary-item coverage-partial">
                {summary.partial} need more
              </span>
            ) : null}
            {summary.uncovered > 0 ? (
              <span className="coverage-summary-item coverage-uncovered">
                {summary.uncovered} gaps
              </span>
            ) : null}
          </div>
        );
      })()}

      {result?.detectedUnits && result.detectedUnits.length > 0 && (
        <div className="detected-tags">
          {result.detectedUnits.map((u) => (
            <span
              key={`${u.name}-${u.wave ?? 0}-${u.notes ?? ""}`}
              className={`tag ${waveColorClass(u.wave)}`}
              title={
                u.wave
                  ? `${WAVE_DEFS[u.wave - 1]?.label ?? "Wave"} · ${u.confidence}`
                  : u.confidence
              }
            >
              {u.wave ? (
                <span className="tag-wave-dot" aria-hidden />
              ) : null}
              {u.name}
              {u.notes ? ` ${u.notes}` : ""}
            </span>
          ))}
        </div>
      )}

      <div className="suggestions-scroll" ref={scrollRef}>
      {result?.suggestions && result.suggestions.length > 0 ? (
        result.suggestions.map((s) => {
          const counterRace = s.playerRace ?? playerRace;
          const enemyWave = s.enemyWave ?? 1;
          const detected = result.detectedUnits.find(
            (u) => u.name === s.enemyUnit && (u.wave ?? 1) === enemyWave
          );
          const waveClass = waveColorClass(detected?.wave ?? enemyWave);
          const primary = primaryBuildCount(s);
          const alternatives = alternativeBuildCounts(s);
          const paths = allCounterPaths(s);
          const showAllPaths = !compact && paths.length > 1;
          return (
          <div
            key={`${s.enemyUnit}-${counterRace}-${enemyWave}-${s.teamWave ?? 0}`}
            className={`suggestion-card ${s.counterType === "soft" ? "soft" : ""}${waveClass ? ` ${waveClass}` : ""}`}
          >
            <div className="enemy">
              vs {formatEnemyStack(s.enemyUnit, s.enemyCount, detected?.notes)}
              {tierLabel(s.enemyTier) ? (
                <span className="counter-tier-badge enemy-tier-badge">
                  {tierLabel(s.enemyTier)}
                </span>
              ) : null}
              {s.coverage ? (
                <span
                  className={`coverage-badge ${coverageBadgeClass(s.coverage)}`}
                >
                  {coverageLabel(s.coverage)}
                </span>
              ) : null}
              {(detected?.wave ?? enemyWave) ? (
                <span className="suggestion-wave">
                  {WAVE_DEFS[(detected?.wave ?? enemyWave)! - 1]?.label}
                </span>
              ) : null}
            </div>
            {primary ? (
              <div className="build build-primary">
                <span className="build-primary-label">
                  {primary.coverage === "covered" ? "Hold" : "Build"}
                </span>
                <span className="build-primary-value">
                  {counterRace}:{" "}
                  {primary.coverage === "covered"
                    ? `${primary.owned ?? primary.suggested}× ${primary.name}`
                    : primary.stillNeed != null && primary.stillNeed > 0
                      ? `+${primary.stillNeed}× ${primary.name}`
                      : `${primary.suggested}× ${primary.name}`}
                  {tierLabel(primary.counterTier) ? (
                    <span
                      className={`counter-tier-badge${primary.budgetOption ? " counter-tier-budget" : ""}`}
                    >
                      {tierLabel(primary.counterTier)}
                    </span>
                  ) : null}
                  {primary.buildable === false ? (
                    <span className="counter-tier-badge counter-tier-locked">
                      needs T{primary.counterTier}
                    </span>
                  ) : null}
                </span>
                {formatOwnedNeed(primary) ? (
                  <span className="build-owned-hint">{formatOwnedNeed(primary)}</span>
                ) : null}
              </div>
            ) : (
              <div className="build">
                {counterRace}: {s.build.join(", ")}
              </div>
            )}
            {showAllPaths ? (
              <div className="counter-paths">
                <span className="build-alt-label">All counters</span>
                <ul className="counter-path-list">
                  {paths.map((p) => (
                    <li
                      key={p.name}
                      className={`counter-path-item${p.role === "primary" ? " counter-path-primary" : ""}${p.buildable === false ? " counter-path-locked" : ""}`}
                    >
                      <span className="counter-path-name">
                        {p.suggested != null ? `${p.suggested}× ` : ""}
                        {p.name}
                        {tierLabel(p.counterTier) ? (
                          <span
                            className={`counter-tier-badge${p.budgetOption ? " counter-tier-budget" : ""}`}
                          >
                            {tierLabel(p.counterTier)}
                          </span>
                        ) : null}
                      </span>
                      {p.coverage ? (
                        <span
                          className={`coverage-badge coverage-badge-sm ${coverageBadgeClass(p.coverage)}`}
                        >
                          {p.coverage === "covered"
                            ? `have ${p.owned}×`
                            : p.stillNeed != null && p.stillNeed > 0
                              ? `+${p.stillNeed}`
                              : coverageLabel(p.coverage)}
                        </span>
                      ) : null}
                      {p.buildable === false ? (
                        <span className="counter-tier-badge counter-tier-locked">
                          T{p.counterTier}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : alternatives.length > 0 ? (
              <div className="build-alternatives">
                <span className="build-alt-label">Also works</span>
                <span className="build-alt-units">
                  {alternatives.map((a) => (
                    <span key={a.name} className="build-alt-option">
                      {a.stillNeed != null && a.stillNeed > 0
                        ? `+${a.stillNeed}× `
                        : a.suggested != null
                          ? `${a.suggested}× `
                          : ""}
                      {a.name}
                      {tierLabel(a.counterTier) ? (
                        <span
                          className={`counter-tier-badge${a.budgetOption ? " counter-tier-budget" : ""}`}
                        >
                          {tierLabel(a.counterTier)}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            {s.teamWave && s.teamWave !== (detected?.wave ?? enemyWave) ? (
              <div className="suggestion-team-wave-row">
                {WAVE_DEFS[s.teamWave - 1]?.label} team supplies this counter
              </div>
            ) : null}
            {!compact && primary?.suggested != null ? (
              <div className="build-quantity-hint">
                {primary.coverage === "covered"
                  ? "Your current army covers this threat."
                  : "Pick one counter — each amount is what you'd need using that unit alone vs "}
                {primary.coverage !== "covered" && (
                  <>
                    {s.enemyCount != null && s.enemyCount > 1
                      ? `×${s.enemyCount} `
                      : ""}
                    {s.enemyUnit}
                  </>
                )}
                {primary.budgetOption
                  ? " — lower-tier option; mass enough to overwhelm (Direct Strike)"
                  : ""}
                {s.counterType === "soft" ? " (soft counter — round up)" : ""}
              </div>
            ) : null}
            {!compact && primary && formatPlatformHint(s, primary) ? (
              <div className="build-platform-hint">
                {formatPlatformHint(s, primary)}
              </div>
            ) : null}
            {!compact && s.tip && <div className="tip">{s.tip}</div>}
          </div>
          );
        })
      ) : (
        <p className="empty-hint">
          {counterRefreshing
            ? "Refreshing counters…"
            : live && scanning
            ? "Analyzing your capture…"
            : live
              ? "No units detected yet — keep Live coach on while scouting fights."
              : compact
                ? "Waiting for coach…"
                : "Analyze, import a replay, or tag enemy units."}
        </p>
      )}
      </div>
    </div>
  );
}
