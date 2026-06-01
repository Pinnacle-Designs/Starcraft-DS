import type { AnalyzeResponse, PlayerRace } from "./api";

interface Props {
  playerRace: PlayerRace;
  result: AnalyzeResponse | null;
  compact?: boolean;
}

export function SuggestionsPanel({ playerRace, result, compact }: Props) {
  return (
    <div className={`suggestions ${compact ? "suggestions-compact" : ""}`}>
      {!compact && (
        <h2>
          Counter suggestions
          {result?.mode === "ai" && result.provider === "ollama" && (
            <span className="badge badge-ollama">Ollama</span>
          )}
          {result?.mode === "ai" && result.provider === "openai" && (
            <span className="badge badge-ai">OpenAI</span>
          )}
          {result?.mode === "ai" && !result.provider && (
            <span className="badge badge-ai">AI</span>
          )}
          {result?.mode === "heuristic" && result.detectedUnits.length > 0 && (
            <span className="badge badge-manual">Manual</span>
          )}
        </h2>
      )}

      {result?.detectedUnits && result.detectedUnits.length > 0 && (
        <div className="detected-tags">
          {result.detectedUnits.map((u) => (
            <span key={u.name} className="tag" title={u.confidence}>
              {u.name}
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
          {compact
            ? "Waiting for coach…"
            : "Analyze, import a replay, or tag enemy units."}
        </p>
      )}
    </div>
  );
}
