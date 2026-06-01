import { useCallback, useEffect, useState } from "react";
import {
  analyzeFrame,
  fetchHealth,
  type AnalyzeResponse,
  type PlayerRace,
  type VisionProviders,
} from "./api";
import { ReplayImport } from "./ReplayImport";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { openOverlayWindow, publishCoachState } from "./overlaySync";
import { useScreenCapture } from "./useScreenCapture";

const RACES: PlayerRace[] = ["Protoss", "Terran", "Zerg"];
const ANALYZE_INTERVAL_MS = 4500;

export default function App() {
  const [playerRace, setPlayerRace] = useState<PlayerRace>("Terran");
  const [live, setLive] = useState(false);
  const [vision, setVision] = useState<VisionProviders | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);

  const {
    videoRef,
    canvasRef,
    capturing,
    error: captureError,
    start,
    stop,
    captureFrameBase64,
  } = useScreenCapture();

  useEffect(() => {
    fetchHealth().then((h) => setVision(h.visionProviders));
  }, []);

  useEffect(() => {
    publishCoachState({
      playerRace,
      result,
      live,
      updatedAt: Date.now(),
    });
  }, [playerRace, result, live]);

  const visionEnabled = Boolean(vision?.active);

  const applyResult = useCallback((data: AnalyzeResponse) => {
    setResult(data);
  }, []);

  const runAnalysis = useCallback(
    async (manualUnits?: string[]) => {
      setLoading(true);
      setLastError(null);
      try {
        if (manualUnits?.length) {
          applyResult(await analyzeFrame("", playerRace, manualUnits));
          return;
        }
        const b64 = captureFrameBase64();
        if (!b64) {
          setLastError("No frame available — start screen capture first.");
          return;
        }
        applyResult(await analyzeFrame(b64, playerRace));
      } catch (e) {
        setLastError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setLoading(false);
      }
    },
    [captureFrameBase64, playerRace, applyResult]
  );

  useEffect(() => {
    if (!live || !capturing) return;
    const tick = () => void runAnalysis();
    tick();
    const id = window.setInterval(tick, ANALYZE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [live, capturing, runAnalysis]);

  const handleManualSuggest = () => {
    const units = manualInput
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (units.length === 0) return;
    void runAnalysis(units);
  };

  const handleStartCapture = async () => {
    await start();
    setResult(null);
  };

  const handleStopAll = () => {
    setLive(false);
    stop();
  };

  const visionHint = () => {
    if (!vision) return "";
    if (vision.active === "ollama") return " Local vision: Ollama.";
    if (vision.active === "openai") return " Cloud vision: OpenAI.";
    return " Start Ollama (`ollama pull llava`) or set OPENAI_API_KEY.";
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1 className="logo">STARCRAFT-DS</h1>
          <p className="subtitle">
            Screen capture, replay import, and overlay coach for SC2 counters
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn"
            onClick={() => openOverlayWindow()}
            title="Open compact window to place over the game"
          >
            Open overlay
          </button>
          <div className="race-picker">
            {RACES.map((r) => (
              <button
                key={r}
                type="button"
                className={`race-btn ${
                  playerRace === r ? `active-${r.toLowerCase()}` : ""
                }`}
                style={
                  playerRace === r
                    ? undefined
                    : { opacity: 0.55, borderColor: "transparent" }
                }
                onClick={() => setPlayerRace(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid">
        <section className="panel">
          <div className="preview-wrap">
            <video ref={videoRef} muted playsInline />
            <canvas ref={canvasRef} hidden />
            {!capturing && (
              <div className="preview-placeholder">
                Share your StarCraft II window or full screen to begin
              </div>
            )}
          </div>

          {captureError && (
            <p className="status" style={{ color: "var(--danger)" }}>
              {captureError}
            </p>
          )}

          <div className="controls">
            {!capturing ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleStartCapture()}
              >
                Capture game screen
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading || !visionEnabled}
                  onClick={() => void runAnalysis()}
                >
                  {loading ? "Analyzing…" : "Analyze now"}
                </button>
                <button
                  type="button"
                  className={`btn ${live ? "btn-danger" : ""}`}
                  disabled={!visionEnabled}
                  onClick={() => setLive((v) => !v)}
                >
                  {live ? "Stop live coach" : "Live coach"}
                </button>
                <button type="button" className="btn" onClick={handleStopAll}>
                  Stop capture
                </button>
              </>
            )}
          </div>

          <p className={`status ${live ? "live" : ""}`}>
            {live && "● Live — updating suggestions every few seconds"}
            {!live && visionHint()}
          </p>

          <ReplayImport
            playerRace={playerRace}
            onResult={applyResult}
            onError={setLastError}
          />

          <label className="status" htmlFor="manual-units">
            Manual enemy units (comma-separated)
          </label>
          <input
            id="manual-units"
            className="manual-input"
            placeholder="e.g. Mutalisk, Roach, Siege Tank"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSuggest()}
          />
          <button
            type="button"
            className="btn"
            style={{ marginTop: "0.5rem" }}
            onClick={handleManualSuggest}
          >
            Get counters (no AI)
          </button>
          {lastError && (
            <p className="status" style={{ color: "var(--danger)" }}>
              {lastError}
            </p>
          )}
        </section>

        <aside className="panel">
          <SuggestionsPanel playerRace={playerRace} result={result} />
          {result?.scene && result.mode === "ai" && (
            <p className="status" style={{ marginTop: "0.75rem" }}>
              {result.scene.slice(0, 120)}
              {result.scene.length > 120 ? "…" : ""}
            </p>
          )}
        </aside>
      </div>

      <footer className="sources">
        Counter data from{" "}
        <a href="https://www.osirissc2guide.com/starcraft-2-counters-list.html">
          Osiris SC2 Guide
        </a>
        ,{" "}
        <a href="https://vaughnroyko.com/sciicounters/">Vaughn Royko charts</a>
        , and{" "}
        <a href="https://log.havrlant.cz/">Direct Strike guides (Havrlant)</a>.
      </footer>
    </div>
  );
}
