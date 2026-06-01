import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeFrame,
  fetchHealth,
  type AnalyzeResponse,
  type ManualUnitInput,
  type PlayerRace,
  type VisionProviders,
} from "./api";
import { CaptureHistoryPanel } from "./CaptureHistoryPanel";
import { saveCaptureFromAnalysis, saveCaptureFromBase64 } from "./captureHistory";
import { ManualArmyBuilder } from "./ManualArmyBuilder";
import { ReplayImport } from "./ReplayImport";
import { SuggestionsPanel } from "./SuggestionsPanel";
import {
  EMPTY_MANUAL_WAVES,
  manualArmyEntries,
  type ManualWavesState,
} from "./manualArmy";
import { openOverlay, publishCoachState } from "./overlaySync";
import { useLiveCoach } from "./useLiveCoach";
import { usePictureInPicture } from "./usePictureInPicture";
import { useScreenCapture } from "./useScreenCapture";

const RACES: PlayerRace[] = ["Protoss", "Terran", "Zerg"];

export default function App() {
  const [playerRace, setPlayerRace] = useState<PlayerRace>("Terran");
  const [live, setLive] = useState(false);
  const [vision, setVision] = useState<VisionProviders | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [manualWaves, setManualWaves] =
    useState<ManualWavesState>(EMPTY_MANUAL_WAVES);
  const [lastError, setLastError] = useState<string | null>(null);
  const [captureHistoryKey, setCaptureHistoryKey] = useState(0);

  const bumpCaptureHistory = useCallback(() => {
    setCaptureHistoryKey((k) => k + 1);
  }, []);

  const archiveFrame = useCallback(
    async (
      b64: string,
      detectedUnits: { name: string }[],
      options?: { throttleLive?: boolean }
    ) => {
      const saved = await saveCaptureFromAnalysis(b64, detectedUnits, options);
      if (saved) bumpCaptureHistory();
    },
    [bumpCaptureHistory]
  );

  const {
    videoRef,
    canvasRef,
    capturing,
    frameReady,
    error: captureError,
    start,
    stop,
    captureFrameBase64,
  } = useScreenCapture();

  const { pipSupported, pipActive, openPip, closePip } = usePictureInPicture(
    videoRef,
    playerRace,
    result,
    live
  );

  useEffect(() => {
    fetchHealth().then((h) => setVision(h.visionProviders));
    const id = window.setInterval(() => {
      fetchHealth().then((h) => setVision(h.visionProviders));
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const visionEnabled = Boolean(vision?.active);
  const manualUnits = useMemo(
    () => manualArmyEntries(manualWaves),
    [manualWaves]
  );
  const canAnalyzeLive = visionEnabled || manualUnits.length > 0;
  const manualUnitsKey = useMemo(
    () => JSON.stringify(manualUnits),
    [manualUnits]
  );

  const applyResult = useCallback((data: AnalyzeResponse) => {
    setResult(data);
  }, []);

  const { scanning, lastScanAt, canLive } = useLiveCoach({
    live,
    capturing,
    frameReady,
    playerRace,
    visionEnabled,
    manualUnits,
    captureFrameBase64,
    onResult: applyResult,
    onError: setLastError,
    onVisionFrame: (b64, data) => {
      void archiveFrame(b64, data.detectedUnits, { throttleLive: true });
    },
  });

  useEffect(() => {
    publishCoachState({
      playerRace,
      result,
      live,
      scanning,
      lastScanAt,
      updatedAt: Date.now(),
    });
  }, [playerRace, result, live, scanning, lastScanAt]);

  const runAnalysis = useCallback(
    async (units?: ManualUnitInput[]) => {
      setLoading(true);
      setLastError(null);
      try {
        const manual = units ?? manualUnits;
        if (manual.length > 0) {
          applyResult(await analyzeFrame("", playerRace, manual));
          return;
        }
        const b64 = captureFrameBase64();
        if (!b64) {
          setLastError(
            frameReady
              ? "Could not grab frame — try stopping and restarting capture."
              : "Waiting for video — give it a second after capture starts."
          );
          return;
        }
        const data = await analyzeFrame(b64, playerRace);
        applyResult(data);
        void archiveFrame(b64, data.detectedUnits);
        if (data.detectedUnits.length === 0) {
          setLastError(
            data.scene?.slice(0, 140) ||
              "No units detected. Use the manual army builder or check Ollama/OpenAI vision."
          );
        }
      } catch (e) {
        setLastError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setLoading(false);
      }
    },
    [
      captureFrameBase64,
      frameReady,
      manualUnits,
      playerRace,
      applyResult,
      archiveFrame,
    ]
  );

  const handleSaveSnapshot = useCallback(() => {
    const b64 = captureFrameBase64();
    if (!b64) {
      setLastError(
        frameReady
          ? "Could not grab frame — try stopping and restarting capture."
          : "Waiting for video — give it a second after capture starts."
      );
      return;
    }
    void saveCaptureFromBase64(b64, {
      summary: result?.detectedUnits.length
        ? result.detectedUnits.map((u) => u.name).join(", ")
        : "Manual snapshot",
    }).then((saved) => {
      if (saved) bumpCaptureHistory();
    });
  }, [bumpCaptureHistory, captureFrameBase64, frameReady, result]);

  const handleManualSuggest = () => {
    if (manualUnits.length === 0) return;
    void runAnalysis(manualUnits);
  };

  const runAnalysisRef = useRef(runAnalysis);
  runAnalysisRef.current = runAnalysis;

  useEffect(() => {
    if (manualUnits.length === 0) return;
    const id = window.setTimeout(() => {
      void runAnalysisRef.current(manualUnits);
    }, 450);
    return () => clearTimeout(id);
  }, [manualUnitsKey, playerRace]);

  const handleStartCapture = async () => {
    await start();
    setResult(null);
    setLastError(null);
  };

  const handleStopAll = () => {
    setLive(false);
    stop();
  };

  const handleToggleLive = () => {
    if (!canLive) {
      setLastError(
        "Live coach needs Ollama (`ollama pull llava`) or OpenAI API key, OR enemy units in the manual builder."
      );
      return;
    }
    if (!capturing) {
      setLastError("Start screen capture before Live coach.");
      return;
    }
    setLive((v) => !v);
    setLastError(null);
  };

  const visionHint = () => {
    if (live) {
      if (scanning) return "● Scanning capture for enemy units…";
      if (visionEnabled) return `● Live vision (${vision?.active}) — updates every few seconds.`;
      return "● Live manual mode — refreshing counters from your army builder.";
    }
    if (!vision) return "";
    if (vision.active === "ollama") return " Local vision: Ollama ready.";
    if (vision.active === "openai") return " Cloud vision: OpenAI ready.";
    return " Start Ollama (`ollama pull llava`) or set OPENAI_API_KEY, or tag enemy units + Live coach.";
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1 className="logo">
            <img
              src="/starcraft-coach-logo.png"
              alt="Starcraft Coach — The Ultimate Counter Tool"
              className="logo-img"
              width={512}
              height={512}
            />
          </h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn"
            onClick={() => openOverlay()}
            title="Always-on-top overlay (best in Electron desktop app)"
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
                onClick={() => setPlayerRace(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>
      <p className="header-slogan">Make better decisions. Win more games.</p>

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
            {capturing && !frameReady && (
              <div className="preview-placeholder preview-loading">
                Preparing capture…
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
                  disabled={loading || !canAnalyzeLive}
                  onClick={() => void runAnalysis()}
                >
                  {loading ? "Analyzing…" : "Analyze now"}
                </button>
                <button
                  type="button"
                  className={`btn ${live ? "btn-danger" : "btn-primary"}`}
                  disabled={!canLive}
                  onClick={handleToggleLive}
                >
                  {live ? "Stop live coach" : "Live coach"}
                </button>
                {pipSupported && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (pipActive) closePip();
                      else {
                        openPip().catch((e) =>
                          setLastError(
                            e instanceof Error ? e.message : "PiP failed"
                          )
                        );
                      }
                    }}
                  >
                    {pipActive ? "Close PiP" : "Pop out PiP"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  disabled={!frameReady}
                  onClick={handleSaveSnapshot}
                >
                  Save snapshot
                </button>
                <button type="button" className="btn" onClick={handleStopAll}>
                  Stop capture
                </button>
              </>
            )}
          </div>

          <CaptureHistoryPanel refreshKey={captureHistoryKey} />

          <p className={`status ${live ? "live" : ""}`}>{visionHint()}</p>

          <ReplayImport
            playerRace={playerRace}
            onResult={applyResult}
            onError={setLastError}
          />

          <ManualArmyBuilder
            waves={manualWaves}
            onChange={setManualWaves}
            onSubmit={handleManualSuggest}
          />
          {lastError && (
            <p className="status" style={{ color: "var(--danger)" }}>
              {lastError}
            </p>
          )}
        </section>

        <aside className="panel">
          <SuggestionsPanel
            playerRace={playerRace}
            result={result}
            live={live}
            scanning={scanning}
            lastScanAt={lastScanAt}
          />
          {result?.scene && result.mode === "ai" && !live && (
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
