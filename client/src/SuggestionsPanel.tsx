import type { AnalyzeResponse, DetectedUnit, PlayerRace } from "./api";
import { WAVE_DEFS } from "./manualArmy";

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
}: Props) {
  return (
    <div className={`suggestions ${compact ? "suggestions-compact" : ""}`}>
      {!compact && (
        <h2>
          Counter suggestions
          {live && scanning && (
            <span className="badge badge-live">Scanning…</span>
          )}
          {live && !scanning && lastScanAt && (
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

      {result?.suggestions && result.suggestions.length > 0 ? (
        result.suggestions.map((s) => (
          <div
            key={s.enemyUnit}
            className={`suggestion-card ${s.counterType === "soft" ? "soft" : ""}`}
          >
            <div className="enemy">vs {s.enemyUnit}</div>
            <div className="build">
              {playerRace}: {s.build.join(", ")}
            </div>
            {!compact && s.tip && <div className="tip">{s.tip}</div>}
          </div>
        ))
      ) : (
        <p className="empty-hint">
          {live && scanning
            ? "Analyzing your capture…"
            : live
              ? "No units detected yet — keep Live coach on while scouting fights."
              : compact
                ? "Waiting for coach…"
                : "Analyze, import a replay, or tag enemy units."}
        </p>
      )}
    </div>
  );
}
