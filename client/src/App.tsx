import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeFrame,
  fetchHealth,
  type AnalyzeResponse,
  type ManualUnitInput,
  type VisionProviders,
  type WaveShift,
} from "./api";
import { CaptureHistoryPanel } from "./CaptureHistoryPanel";
import { saveCaptureFromAnalysis, saveCaptureFromBase64 } from "./captureHistory";
import { ManualArmyBuilder } from "./ManualArmyBuilder";
import { VideoUpload } from "./VideoUpload";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { TeamSelection } from "./TeamSelection";
import {
  DEFAULT_TEAM_WAVES,
  primaryTeamRace,
} from "./teamWaves";
import {
  EMPTY_MANUAL_WAVES,
  manualArmyEntries,
  type ManualWavesState,
} from "./manualArmy";
import { openOverlay, publishCoachState } from "./overlaySync";
import { useLiveCoach } from "./useLiveCoach";
import { usePictureInPicture } from "./usePictureInPicture";
import { useScreenCapture } from "./useScreenCapture";

export default function App() {
  const [teamWaves, setTeamWaves] = useState(DEFAULT_TEAM_WAVES);
  const [waveShift, setWaveShift] = useState<WaveShift>(0);
  const playerRace = primaryTeamRace(teamWaves);
  const [live, setLive] = useState(false);
  const [vision, setVision] = useState<VisionProviders | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [manualWaves, setManualWaves] =
    useState<ManualWavesState>(EMPTY_MANUAL_WAVES);
  const [lastError, setLastError] = useState<string | null>(null);
  const [captureHistoryKey, setCaptureHistoryKey] = useState(0);
  const [capturePanelOpen, setCapturePanelOpen] = useState(false);

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
    source: videoSource,
    videoFileName,
    start,
    stop,
    loadVideoFile,
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
    teamWaves,
    waveShift,
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
      teamRaces: teamWaves,
      waveShift,
      result,
      live,
      scanning,
      lastScanAt,
      updatedAt: Date.now(),
    });
  }, [teamWaves, waveShift, playerRace, result, live, scanning, lastScanAt]);

  const runAnalysis = useCallback(
    async (units?: ManualUnitInput[]) => {
      setLoading(true);
      setLastError(null);
      try {
        const manual = units ?? manualUnits;
        if (manual.length > 0) {
          applyResult(await analyzeFrame("", teamWaves, manual, waveShift));
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
        const data = await analyzeFrame(b64, teamWaves, undefined, waveShift);
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
      teamWaves,
      waveShift,
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
  const resultRef = useRef(result);
  resultRef.current = result;

  const teamWavesKey = useMemo(() => JSON.stringify(teamWaves), [teamWaves]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (manualUnits.length > 0) {
        void runAnalysisRef.current(manualUnits);
        return;
      }
      const detected = resultRef.current?.detectedUnits;
      if (!detected?.length) return;
      void analyzeFrame(
        "",
        teamWaves,
        detected.map((u) => ({
          name: u.name,
          count: u.notes?.startsWith("×")
            ? Math.max(1, parseInt(u.notes.slice(1), 10) || 1)
            : 1,
          wave: u.wave,
        })),
        waveShift
      ).then(applyResult);
    }, 450);
    return () => clearTimeout(id);
  }, [manualUnitsKey, teamWavesKey, waveShift, teamWaves, applyResult]);

  const handleStartCapture = async () => {
    setCapturePanelOpen(true);
    await start();
    setResult(null);
    setLastError(null);
  };

  const handleStopAll = () => {
    setLive(false);
    stop();
    setCapturePanelOpen(false);
  };

  const handleToggleLive = () => {
    if (!canLive) {
      setLastError(
        "Live coach needs Ollama (`ollama pull llava`) or OpenAI API key, OR enemy units in the manual builder."
      );
      return;
    }
    if (!capturing) {
      setLastError("Start screen capture or upload a video before Live coach.");
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

  const handleVideoUpload = (file: File) => {
    setCapturePanelOpen(true);
    setResult(null);
    setLastError(null);
    setLive(false);
    void loadVideoFile(file);
  };

  const captureStatusLabel = () => {
    if (live) return "Live coach";
    if (capturing && videoSource === "file" && videoFileName) return videoFileName;
    if (capturing) return videoSource === "file" ? "Video loaded" : "Capturing";
    return null;
  };

  const captureStatus = captureStatusLabel();

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
        </div>
      </header>
      <p className="header-slogan">Make better decisions. Win more games.</p>

      <div className="grid">
        <section className="panel">
          <section className="panel-section capture-section">
            <button
              type="button"
              className="panel-section-toggle capture-section-toggle"
              onClick={() => setCapturePanelOpen((v) => !v)}
              aria-expanded={capturePanelOpen}
            >
              <span className="panel-heading panel-heading-inline">
                Screen capture &amp; video preview
              </span>
              {captureStatus && (
                <span
                  className={`panel-section-status capture-section-status${live ? " panel-section-status-live capture-section-status-live" : ""}`}
                  title={captureStatus}
                >
                  {captureStatus}
                </span>
              )}
              <span className="panel-section-chevron capture-history-chevron" aria-hidden>
                {capturePanelOpen ? "▾" : "▸"}
              </span>
            </button>

            <div
              className={`panel-section-body capture-section-body${capturePanelOpen ? "" : " panel-section-body-collapsed capture-section-body-collapsed"}`}
              aria-hidden={!capturePanelOpen}
            >
              <div className="preview-wrap">
                <video
                  ref={videoRef}
                  muted={videoSource !== "file"}
                  playsInline
                  controls={videoSource === "file"}
                />
                <canvas ref={canvasRef} hidden />
                {!capturing && (
                  <div className="preview-placeholder">
                    Share your StarCraft II window or upload a video below to begin
                  </div>
                )}
                {capturing && !frameReady && (
                  <div className="preview-placeholder preview-loading">
                    {videoSource === "file"
                      ? "Loading video…"
                      : "Preparing capture…"}
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
                      {videoSource === "file" ? "Clear video" : "Stop capture"}
                    </button>
                  </>
                )}
              </div>

              <CaptureHistoryPanel refreshKey={captureHistoryKey} />

              <p className={`status ${live ? "live" : ""}`}>{visionHint()}</p>
            </div>
          </section>

          <VideoUpload
            videoFileName={videoSource === "file" ? videoFileName : null}
            onUpload={handleVideoUpload}
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
          <TeamSelection
            teamWaves={teamWaves}
            waveShift={waveShift}
            onChange={setTeamWaves}
            onWaveShiftChange={setWaveShift}
          />
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
