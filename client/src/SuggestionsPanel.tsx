import { useEffect, useRef } from "react";
import type { AnalyzeResponse, DetectedUnit, PlayerRace } from "./api";
import { WAVE_DEFS } from "./manualArmy";
import { formatEnemyStack, primaryBuildCount, alternativeBuildCounts } from "./suggestionFormat";

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
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showUpdatedBadge =
    !live && !scanning && !counterRefreshing && Boolean(lastScanAt);

  useEffect(() => {
    if (compact) return;
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
  }, [compact, result?.suggestions?.length]);

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
          const detected = result.detectedUnits.find((u) => u.name === s.enemyUnit);
          const waveClass = waveColorClass(detected?.wave);
          const primary = primaryBuildCount(s);
          const alternatives = alternativeBuildCounts(s);
          return (
          <div
            key={`${s.enemyUnit}-${counterRace}-${detected?.wave ?? 0}`}
            className={`suggestion-card ${s.counterType === "soft" ? "soft" : ""}${waveClass ? ` ${waveClass}` : ""}`}
          >
            <div className="enemy">
              vs {formatEnemyStack(s.enemyUnit, s.enemyCount, detected?.notes)}
              {detected?.wave ? (
                <span className="suggestion-wave">
                  {WAVE_DEFS[detected.wave - 1]?.label}
                </span>
              ) : null}
            </div>
            {primary ? (
              <div className="build build-primary">
                <span className="build-primary-label">Build</span>
                <span className="build-primary-value">
                  {counterRace}: {primary.suggested}× {primary.name}
                </span>
              </div>
            ) : (
              <div className="build">
                {counterRace}: {s.build.join(", ")}
              </div>
            )}
            {alternatives.length > 0 ? (
              <div className="build-alternatives">
                <span className="build-alt-label">Also works</span>
                <span className="build-alt-units">
                  {alternatives.map((a) => (
                    <span key={a.name} className="build-alt-option">
                      {a.suggested != null ? `${a.suggested}× ` : ""}
                      {a.name}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            {s.teamWave && s.teamWave !== detected?.wave ? (
              <div className="suggestion-team-wave-row">
                {WAVE_DEFS[s.teamWave - 1]?.label} team supplies this counter
              </div>
            ) : null}
            {!compact && primary?.suggested != null ? (
              <div className="build-quantity-hint">
                Pick one counter — each amount is what you&apos;d need using that
                unit alone vs{" "}
                {s.enemyCount != null && s.enemyCount > 1
                  ? `×${s.enemyCount} `
                  : ""}
                {s.enemyUnit}
                {s.counterType === "soft" ? " (soft counter — round up)" : ""}
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
