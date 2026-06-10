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
import { CaptureHotkeySettings } from "./CaptureHotkeySettings";
import { ManualArmyBuilder } from "./ManualArmyBuilder";
import { VideoUpload } from "./VideoUpload";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { TeamArmyPanel } from "./TeamArmyPanel";
import {
  DEFAULT_TEAM_WAVES,
  DEFAULT_TIER_UNLOCKED,
  primaryTeamRace,
  type TierUnlocked,
} from "./teamWaves";
import {
  clearAllWaves,
  EMPTY_MANUAL_WAVES,
  manualArmyEntries,
  syncFriendlyWaveRaces,
  type ManualWavesState,
} from "./manualArmy";
import {
  captureMediaEnabled,
  overlayEnabled,
  showAiCaptureReplay,
} from "./featureFlags";
import {
  isElectronApp,
  MAIN_SYNC_ORIGIN,
  OVERLAY_SYNC_ORIGIN,
  openOverlay,
  publishCoachState,
  subscribeCoachState,
} from "./overlaySync";
import { detectedToManual } from "./detectedUnits";
import { useLiveCoach } from "./useLiveCoach";
import { useOverlayScreenCapture } from "./useOverlayScreenCapture";
import { usePictureInPicture } from "./usePictureInPicture";
import { useScreenCapture } from "./useScreenCapture";
import { useVisionTraining } from "./useVisionTraining";
import { AppUpdateBanner } from "./AppUpdateBanner";
import { DownloadApp } from "./DownloadApp";

export default function App() {
  const [teamWaves, setTeamWaves] = useState(DEFAULT_TEAM_WAVES);
  const [waveShift, setWaveShift] = useState<WaveShift>(0);
  const [tierUnlocked, setTierUnlocked] =
    useState<TierUnlocked>(DEFAULT_TIER_UNLOCKED);
  const [friendlyWaves, setFriendlyWaves] = useState<ManualWavesState>(() =>
    syncFriendlyWaveRaces(EMPTY_MANUAL_WAVES, DEFAULT_TEAM_WAVES)
  );
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
  const [counterRefreshing, setCounterRefreshing] = useState(false);
  const [lastCounterRefreshAt, setLastCounterRefreshAt] = useState<number | null>(
    null
  );
  const [overlayHint, setOverlayHint] = useState<string | null>(null);
  const [trainingSaving, setTrainingSaving] = useState(false);

  const {
    stats: trainingStats,
    lastSavedAt: trainingLastSavedAt,
    saveError: trainingSaveError,
    registerCapture: registerTrainingCapture,
    submitCorrection: submitTrainingCorrection,
    confirmCurrentLabels,
    pendingCapture: trainingPending,
    refreshStats: refreshTrainingStats,
  } = useVisionTraining({ teamRaces: teamWaves, waveShift });

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
  const friendlyUnits = useMemo(
    () => manualArmyEntries(friendlyWaves),
    [friendlyWaves]
  );
  const analyzeOptions = useMemo(
    () => ({
      friendlyUnits: friendlyUnits.length ? friendlyUnits : undefined,
      tierUnlocked,
    }),
    [friendlyUnits, tierUnlocked]
  );
  const canAnalyzeLive = visionEnabled || manualUnits.length > 0;
  const manualUnitsKey = useMemo(
    () => JSON.stringify(manualUnits),
    [manualUnits]
  );
  const friendlyUnitsKey = useMemo(
    () => JSON.stringify(friendlyUnits),
    [friendlyUnits]
  );
  const tierUnlockedKey = useMemo(
    () => JSON.stringify(tierUnlocked),
    [tierUnlocked]
  );

  const applyResult = useCallback((data: AnalyzeResponse) => {
    setResult(data);
    setLastCounterRefreshAt(Date.now());
  }, []);

  const manualWavesRef = useRef(manualWaves);
  manualWavesRef.current = manualWaves;
  const teamWavesRef = useRef(teamWaves);
  teamWavesRef.current = teamWaves;
  const waveShiftRef = useRef(waveShift);
  waveShiftRef.current = waveShift;
  const analyzeOptionsRef = useRef(analyzeOptions);
  analyzeOptionsRef.current = analyzeOptions;
  const resultRef = useRef(result);
  resultRef.current = result;

  const refreshCounters = useCallback(async () => {
    const units = manualArmyEntries(manualWavesRef.current);
    const teams = teamWavesRef.current;
    const shift = waveShiftRef.current;
    const current = resultRef.current;

    setCounterRefreshing(true);
    setLastError(null);
    try {
      if (units.length > 0) {
        applyResult(
          await analyzeFrame("", teams, units, shift, analyzeOptionsRef.current)
        );
        return;
      }

      if (current?.detectedUnits?.length) {
        applyResult(
          await analyzeFrame(
            "",
            teams,
            detectedToManual(current.detectedUnits),
            shift,
            analyzeOptionsRef.current
          )
        );
        return;
      }

      setLastError("Tag enemy units or analyze a frame to refresh counters.");
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "Counter refresh failed");
    } finally {
      setCounterRefreshing(false);
    }
  }, [applyResult]);

  const {
    scanning: captureScanning,
    lastCaptureAt,
    lastCaptureSummary,
    error: captureScanError,
  } = useOverlayScreenCapture({
    enabled: showAiCaptureReplay && isElectronApp(),
    manualWaves,
    teamWaves,
    waveShift,
    analyzeOptions,
    onWavesChange: setManualWaves,
    onCaptureComplete: (patch) => {
      if (patch.result) applyResult(patch.result);
    },
    onTrainingCapture: registerTrainingCapture,
  });

  const { scanning, lastScanAt, canLive } = useLiveCoach({
    live,
    capturing,
    frameReady,
    teamWaves,
    waveShift,
    visionEnabled,
    manualUnits,
    analyzeOptions,
    captureFrameBase64,
    onResult: applyResult,
    onError: setLastError,
    onVisionFrame: (b64, data) => {
      registerTrainingCapture({
        imageBase64: b64,
        rawDetected: detectedToManual(data.detectedUnits),
        source: "live-coach",
        provider: data.provider,
        scene: data.scene,
      });
      void archiveFrame(b64, data.detectedUnits, { throttleLive: true });
    },
  });

  const handleOpenOverlay = useCallback(() => {
    setOverlayHint(null);
    void openOverlay()
      .then((result) => {
        if (!result.enemy && !result.team) {
          setOverlayHint(
            isElectronApp()
              ? "Could not open overlay panels. Restart the app and try again."
              : "Popups were blocked. Allow popups for this site, then try again."
          );
          return;
        }
        if (!result.enemy && result.team) {
          setOverlayHint(
            "Could not open the enemy waves panel. Team selection is open — allow popups for this site, then try again."
          );
          return;
        }
        if (isElectronApp() && result.enemy && result.team) {
          setOverlayHint(
            "Overlay panels opened — drag them over your game. Ctrl+Shift+D toggles click-through."
          );
        }
      })
      .catch(() => {
        setOverlayHint(
          isElectronApp()
            ? "Overlay failed to open. Run npm run dev, then restart Electron."
            : "Could not open overlay. Try again or allow popups for this site."
        );
      });
  }, []);

  useEffect(() => {
    return subscribeCoachState((incoming) => {
      if (incoming.origin !== OVERLAY_SYNC_ORIGIN) return;
      if (incoming.manualWaves) setManualWaves(incoming.manualWaves);
      if (incoming.teamRaces) setTeamWaves(incoming.teamRaces);
      if (incoming.friendlyWaves) {
        setFriendlyWaves(incoming.friendlyWaves);
      } else if (incoming.teamRaces) {
        setFriendlyWaves((waves) =>
          syncFriendlyWaveRaces(waves, incoming.teamRaces!)
        );
      }
      if (incoming.waveShift != null) setWaveShift(incoming.waveShift);
      if (incoming.tierUnlocked) setTierUnlocked(incoming.tierUnlocked);
      if (incoming.result !== undefined) {
        setResult(incoming.result);
        setLastCounterRefreshAt(incoming.result ? Date.now() : null);
      }
    });
  }, []);

  useEffect(() => {
    publishCoachState({
      playerRace,
      teamRaces: teamWaves,
      waveShift,
      tierUnlocked,
      manualWaves,
      friendlyWaves,
      result,
      live,
      scanning,
      lastScanAt,
      counterRefreshing,
      origin: MAIN_SYNC_ORIGIN,
      updatedAt: Date.now(),
    });
  }, [
    teamWaves,
    waveShift,
    tierUnlocked,
    manualWaves,
    friendlyWaves,
    playerRace,
    result,
    live,
    scanning,
    lastScanAt,
    counterRefreshing,
  ]);

  const runAnalysis = useCallback(
    async (units?: ManualUnitInput[]) => {
      setLoading(true);
      setLastError(null);
      try {
        const manual = units ?? manualUnits;
        if (manual.length > 0) {
          applyResult(
            await analyzeFrame("", teamWaves, manual, waveShift, analyzeOptions)
          );
          return;
        }
        const b64 = await captureFrameBase64();
        if (!b64) {
          setLastError(
            frameReady
              ? "Could not grab screenshot — try stopping and restarting capture."
              : "Waiting for capture — give it a second after capture starts."
          );
          return;
        }
        const data = await analyzeFrame(
          b64,
          teamWaves,
          undefined,
          waveShift,
          analyzeOptions
        );
        applyResult(data);
        registerTrainingCapture({
          imageBase64: b64,
          rawDetected: detectedToManual(data.detectedUnits),
          source: "analyze-frame",
          provider: data.provider,
          scene: data.scene,
        });
        void archiveFrame(b64, data.detectedUnits);
        if (data.detectedUnits.length === 0) {
          setLastError(
            data.scene?.slice(0, 140) ||
              showAiCaptureReplay
                ? "No units detected. Tag manually, or install Ollama (ollama pull llava) for visual detection on the map."
                : "No units tagged yet — add enemy units in the wave builder."
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
      analyzeOptions,
      applyResult,
      archiveFrame,
      registerTrainingCapture,
    ]
  );

  const handleSaveTrainingLabels = useCallback(() => {
    const units = manualArmyEntries(manualWaves);
    if (units.length === 0) return;
    setTrainingSaving(true);
    void confirmCurrentLabels(units)
      .then((result) => {
        if (result.saved) void refreshTrainingStats();
      })
      .finally(() => setTrainingSaving(false));
  }, [confirmCurrentLabels, manualWaves, refreshTrainingStats]);

  const handleSaveSnapshot = useCallback(() => {
    void (async () => {
      const b64 = await captureFrameBase64();
      if (!b64) {
        setLastError(
          frameReady
            ? "Could not grab screenshot — try stopping and restarting capture."
            : "Waiting for capture — give it a second after capture starts."
        );
        return;
      }
      const saved = await saveCaptureFromBase64(b64, {
        summary: result?.detectedUnits.length
          ? result.detectedUnits.map((u) => u.name).join(", ")
          : "Manual snapshot",
      });
      if (saved) bumpCaptureHistory();
    })();
  }, [bumpCaptureHistory, captureFrameBase64, frameReady, result]);

  const handleManualSuggest = () => {
    void refreshCounters();
  };

  const handleClearEnemySelections = useCallback(() => {
    setManualWaves((waves) => clearAllWaves(waves));
    setResult(null);
    setLastCounterRefreshAt(null);
  }, []);

  const handleClearFriendlySelections = useCallback(() => {
    setFriendlyWaves((waves) =>
      syncFriendlyWaveRaces(clearAllWaves(waves), teamWaves)
    );
  }, [teamWaves]);

  const handleTeamWavesChange = useCallback(
    (teams: typeof teamWaves) => {
      setTeamWaves(teams);
      setFriendlyWaves((waves) => syncFriendlyWaveRaces(waves, teams));
    },
    []
  );

  const refreshCountersRef = useRef(refreshCounters);
  refreshCountersRef.current = refreshCounters;

  const teamWavesKey = useMemo(() => JSON.stringify(teamWaves), [teamWaves]);

  const submitTrainingCorrectionRef = useRef(submitTrainingCorrection);
  submitTrainingCorrectionRef.current = submitTrainingCorrection;

  useEffect(() => {
    const id = window.setTimeout(() => {
      const units = manualArmyEntries(manualWavesRef.current);
      if (units.length > 0) {
        void refreshCountersRef.current();
        if (trainingPending) {
          void submitTrainingCorrectionRef.current(units);
        }
        return;
      }

      const current = resultRef.current;
      if (current?.mode === "ai" && current?.detectedUnits?.length) {
        void refreshCountersRef.current();
        return;
      }

      if (current?.detectedUnits?.length || current?.suggestions?.length) {
        setResult(null);
        setLastCounterRefreshAt(null);
      }
    }, 450);
    return () => clearTimeout(id);
  }, [
    manualUnitsKey,
    friendlyUnitsKey,
    tierUnlockedKey,
    teamWavesKey,
    waveShift,
    trainingPending,
  ]);

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
        showAiCaptureReplay
          ? "Live coach needs screen capture with OCR, or enemy units in the manual builder."
          : "Tag enemy units in the wave builder to refresh counters."
      );
      return;
    }
    if (!capturing) {
      setLastError(
        showAiCaptureReplay
          ? "Start screen capture or upload a video before Live coach."
          : "Tag enemy units in the wave builder to refresh counters."
      );
      return;
    }
    setLive((v) => !v);
    setLastError(null);
  };

  const visionHint = () => {
    if (!showAiCaptureReplay) {
      if (live) {
        return scanning
          ? "● Updating counters…"
          : "● Refreshing counters from your army builder.";
      }
      return "";
    }
    if (live) {
      if (scanning) return "● Scanning capture for enemy units…";
      if (visionEnabled) return `● Live vision (${vision?.active}) — updates every few seconds.`;
      return "● Live manual mode — refreshing counters from your army builder.";
    }
    if (!vision) return "";
    if (vision.active === "ollama")
      return " Local visual AI (Ollama) — detects enemy units on screen without names.";
    if (vision.active === "ocr")
      return vision.ollama
        ? " Ollama starting… OCR fallback active until visual AI is ready."
        : " OCR only — install Ollama for visual unit detection without names.";
    if (vision.active === "openai")
      return " Cloud vision: OpenAI (quota issues fall back to free OCR).";
    return " Tag enemy units in the wave builder, or set VISION_PROVIDER in server/.env.";
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
    if (capturing && videoSource === "electron") return "Primary display";
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
              src={`${import.meta.env.BASE_URL}starcraft-coach-logo.png`}
              alt="Starcraft Coach — Direct Strike counter tool for StarCraft II"
              className="logo-img"
              width={512}
              height={512}
            />
          </h1>
        </div>
        {overlayEnabled && (
          <div className="header-actions">
            <button
              type="button"
              className="btn"
              onClick={handleOpenOverlay}
              title="Open enemy waves and team selection in separate windows you can place over your game"
            >
              Open game overlay
            </button>
            <p className="overlay-note">
              {isElectronApp()
                ? "Opens always-on-top enemy and team panels you can drag over your game."
                : "Opens two separate windows you can place over your game. Allow popups for this site — team selection opens automatically after enemy waves."}
            </p>
          </div>
        )}
      </header>
      <p className="header-slogan">
        Direct Strike counter coach — make better decisions, win more games.
      </p>
      <AppUpdateBanner />
      <DownloadApp />
      {overlayHint ? (
        <p className="status overlay-hint" role="status">
          {overlayHint}
        </p>
      ) : null}

      <main className="grid">
        <section className="panel">
          {captureMediaEnabled && (
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
                    {isElectronApp()
                      ? "Start capture to analyze full-screen screenshots of your primary display (same as the capture hotkey)."
                      : "Share your StarCraft II window or upload a video below to begin"}
                  </div>
                )}
                {capturing && videoSource === "electron" && (
                  <div className="preview-placeholder preview-electron-capture">
                    Screen capture active — snapshots your primary display without a visible overlay.
                  </div>
                )}
                {capturing && !frameReady && videoSource !== "electron" && (
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
              {trainingStats && trainingStats.total > 0 ? (
                <p className="status training-status">
                  Vision training: {trainingStats.total} saved example
                  {trainingStats.total === 1 ? "" : "s"}
                  {trainingStats.corrected > 0
                    ? ` (${trainingStats.corrected} corrections)`
                    : ""}
                  {trainingLastSavedAt
                    ? " — latest labels applied to future scans"
                    : ""}
                  {" "}
                  (kept locally {trainingStats.retentionDays} days)
                </p>
              ) : (
                <p className="status training-status">
                  Fix unit tags after a capture to teach vision — images kept locally
                  for {trainingStats?.retentionDays ?? 10} days.
                </p>
              )}
              {trainingSaveError ? (
                <p className="status" style={{ color: "var(--danger)" }}>
                  {trainingSaveError}
                </p>
              ) : null}
            </div>
          </section>
          )}

          {captureMediaEnabled && (
          <VideoUpload
            videoFileName={videoSource === "file" ? videoFileName : null}
            onUpload={handleVideoUpload}
          />
          )}

          {showAiCaptureReplay && isElectronApp() ? (
            <CaptureHotkeySettings
              scanning={captureScanning}
              lastCaptureAt={lastCaptureAt}
              lastCaptureSummary={lastCaptureSummary}
            />
          ) : null}
          {showAiCaptureReplay && captureScanError ? (
            <p className="capture-hotkey-error">{captureScanError}</p>
          ) : null}
          <ManualArmyBuilder
            waves={manualWaves}
            collapsibleWaves
            onChange={setManualWaves}
            onSubmit={handleManualSuggest}
            onClearSelections={handleClearEnemySelections}
            onSaveTraining={
              showAiCaptureReplay ? handleSaveTrainingLabels : undefined
            }
            trainingPending={trainingPending}
            trainingSaving={trainingSaving}
            refreshing={counterRefreshing}
          />
          {lastError && (
            <p className="status" style={{ color: "var(--danger)" }}>
              {lastError}
            </p>
          )}
        </section>

        <aside className="panel panel-coach">
          <TeamArmyPanel
            teamWaves={teamWaves}
            waveShift={waveShift}
            tierUnlocked={tierUnlocked}
            friendlyWaves={friendlyWaves}
            onTeamChange={handleTeamWavesChange}
            onWaveShiftChange={setWaveShift}
            onTierChange={setTierUnlocked}
            onFriendlyChange={setFriendlyWaves}
            onClearFriendly={handleClearFriendlySelections}
          />
          <SuggestionsPanel
            playerRace={playerRace}
            result={result}
            live={live}
            scanning={scanning}
            lastScanAt={lastScanAt ?? lastCounterRefreshAt}
            counterRefreshing={counterRefreshing}
          />
          {showAiCaptureReplay &&
            result?.scene &&
            result.mode === "ai" &&
            !live && (
            <p className="status" style={{ marginTop: "0.75rem" }}>
              {result.scene.slice(0, 120)}
              {result.scene.length > 120 ? "…" : ""}
            </p>
          )}
        </aside>
      </main>

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
