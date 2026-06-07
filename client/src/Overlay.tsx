import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeResponse, WaveShift } from "./api";
import { CaptureHotkeySettings } from "./CaptureHotkeySettings";
import { ManualArmyBuilder } from "./ManualArmyBuilder";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { TeamSelection } from "./TeamSelection";
import { OverlayPanelShell } from "./OverlayPanelShell";
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
  type ManualWavesState,
} from "./manualArmy";
import { useVisionTraining } from "./useVisionTraining";
import {
  isElectronApp,
  loadCoachState,
  openOverlayPanel,
  OVERLAY_SYNC_ORIGIN,
  publishCoachState,
  subscribeCoachState,
  type CoachState,
} from "./overlaySync";
import {
  type OverlayPanelId,
  OVERLAY_PANELS,
} from "./overlayStorage";
import { useOverlayScreenCapture } from "./useOverlayScreenCapture";

interface Props {
  panel: OverlayPanelId;
}

function closeOverlayWindow(): void {
  if (window.starcraftDS?.closeOverlayPanel) {
    void window.starcraftDS.closeOverlayPanel();
    return;
  }
  window.close();
}

export default function Overlay({ panel }: Props) {
  const spec = OVERLAY_PANELS[panel];
  const [teamWaves, setTeamWaves] = useState(DEFAULT_TEAM_WAVES);
  const [waveShift, setWaveShift] = useState<WaveShift>(0);
  const [tierUnlocked, setTierUnlocked] =
    useState<TierUnlocked>(DEFAULT_TIER_UNLOCKED);
  const [manualWaves, setManualWaves] =
    useState<ManualWavesState>(EMPTY_MANUAL_WAVES);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [live, setLive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [counterRefreshing, setCounterRefreshing] = useState(false);
  const [clickThrough, setClickThrough] = useState(false);
  const [hotkeyUiActive, setHotkeyUiActive] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [trainingSaving, setTrainingSaving] = useState(false);

  const {
    registerCapture: registerTrainingCapture,
    submitCorrection: submitTrainingCorrection,
    confirmCurrentLabels,
    pendingCapture: trainingPending,
  } = useVisionTraining({ teamRaces: teamWaves, waveShift });

  const analyzeOptions = useMemo(
    () => ({ tierUnlocked }),
    [tierUnlocked]
  );

  const applyRemoteState = useCallback((incoming: CoachState) => {
    if (incoming.origin === OVERLAY_SYNC_ORIGIN) return;
    if (incoming.teamRaces) setTeamWaves(incoming.teamRaces);
    if (incoming.waveShift != null) setWaveShift(incoming.waveShift);
    if (incoming.tierUnlocked) setTierUnlocked(incoming.tierUnlocked);
    if (incoming.manualWaves) setManualWaves(incoming.manualWaves);
    setResult(incoming.result);
    setLive(incoming.live);
    if (incoming.scanning != null) setScanning(incoming.scanning);
    if (incoming.lastScanAt !== undefined) setLastScanAt(incoming.lastScanAt ?? null);
    if (incoming.counterRefreshing != null) {
      setCounterRefreshing(incoming.counterRefreshing);
    }
  }, []);

  const publishOverlayState = useCallback(
    (patch: Partial<CoachState>) => {
      const base = loadCoachState();
      publishCoachState({
        playerRace: patch.teamRaces?.[0] ?? base?.playerRace ?? teamWaves[0],
        teamRaces: patch.teamRaces ?? teamWaves,
        waveShift: patch.waveShift ?? waveShift,
        tierUnlocked: patch.tierUnlocked ?? tierUnlocked,
        manualWaves: patch.manualWaves ?? manualWaves,
        result:
          patch.result !== undefined ? patch.result : (base?.result ?? null),
        live: patch.live ?? base?.live ?? false,
        scanning:
          patch.scanning !== undefined ? patch.scanning : base?.scanning,
        lastScanAt:
          patch.lastScanAt !== undefined
            ? patch.lastScanAt
            : base?.lastScanAt,
        counterRefreshing:
          patch.counterRefreshing ?? base?.counterRefreshing,
        origin: OVERLAY_SYNC_ORIGIN,
        updatedAt: Date.now(),
      });
    },
    [teamWaves, waveShift, tierUnlocked, manualWaves]
  );

  const {
    scanning: captureScanning,
    lastCaptureAt,
    lastCaptureSummary,
    error: captureScanError,
  } = useOverlayScreenCapture({
    enabled: panel === "enemy" && isElectronApp(),
    manualWaves,
    teamWaves,
    waveShift,
    analyzeOptions,
    onWavesChange: setManualWaves,
    onCaptureComplete: (patch) => {
      publishOverlayState(patch);
      setCaptureError(null);
    },
    onTrainingCapture: registerTrainingCapture,
  });

  const manualUnitsKey = useMemo(
    () => JSON.stringify(manualArmyEntries(manualWaves)),
    [manualWaves]
  );
  const submitTrainingCorrectionRef = useRef(submitTrainingCorrection);
  submitTrainingCorrectionRef.current = submitTrainingCorrection;

  useEffect(() => {
    const id = window.setTimeout(() => {
      const units = manualArmyEntries(manualWaves);
      if (units.length > 0) {
        void submitTrainingCorrectionRef.current(units);
      }
    }, 600);
    return () => clearTimeout(id);
  }, [manualUnitsKey, manualWaves]);

  useEffect(() => {
    setCaptureError(captureScanError);
  }, [captureScanError]);

  useEffect(() => {
    document.body.classList.add("overlay-mode", "overlay-panel-window");
    if (panel === "team") {
      document.body.classList.add("overlay-team-panel");
    }
    if (window.starcraftDS?.isElectron) {
      document.body.classList.add("overlay-electron");
    }
    const initial = loadCoachState();
    if (initial) applyRemoteState(initial);
    return () => {
      document.body.classList.remove(
        "overlay-mode",
        "overlay-panel-window",
        "overlay-team-panel",
        "overlay-electron"
      );
    };
  }, [applyRemoteState, panel]);

  useEffect(() => subscribeCoachState(applyRemoteState), [applyRemoteState]);

  useEffect(() => {
    if (!window.starcraftDS?.onClickThroughStateChange) return;
    return window.starcraftDS.onClickThroughStateChange(setClickThrough);
  }, []);

  useEffect(() => {
    const api = window.starcraftDS;
    if (!api?.setIgnoreMouseEvents) return;

    const INTERACTIVE =
      ".floating-overlay-panel-header, .floating-overlay-panel-footer, .capture-hotkey-settings, .capture-hotkey-interactive, .overlay-interactive, .overlay-interactive *";
    let ignoring = false;

    const applyIgnore = (ignore: boolean) => {
      if (ignore === ignoring) return;
      ignoring = ignore;
      void api.setIgnoreMouseEvents!(ignore);
    };

    if (!clickThrough || hotkeyUiActive) {
      applyIgnore(false);
      if (!clickThrough) return;
    }

    if (hotkeyUiActive) return;

    const pointerIsInteractive = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el?.closest(INTERACTIVE));
    };

    const onPointerMove = (e: PointerEvent) => {
      applyIgnore(!pointerIsInteractive(e.clientX, e.clientY));
    };

    const onPointerLeave = () => {
      applyIgnore(true);
    };

    applyIgnore(true);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerleave", onPointerLeave);

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      applyIgnore(false);
    };
  }, [clickThrough, hotkeyUiActive]);

  const handleClickThroughChange = useCallback((enabled: boolean) => {
    if (!window.starcraftDS?.setClickThrough) return;
    void window.starcraftDS.setClickThrough(enabled);
  }, []);

  const handleClearSelections = useCallback(() => {
    const cleared = clearAllWaves(manualWaves);
    setManualWaves(cleared);
    setResult(null);
    setCaptureError(null);
    publishOverlayState({ manualWaves: cleared, result: null });
  }, [manualWaves, publishOverlayState]);

  // Chrome blocks two popups from one click — open team from the enemy popup instead.
  useEffect(() => {
    if (panel !== "enemy" || isElectronApp()) return;
    const t = window.setTimeout(() => {
      openOverlayPanel("team");
    }, 150);
    return () => window.clearTimeout(t);
  }, [panel]);

  return (
    <OverlayPanelShell
      title={spec.title}
      panelId={panel}
      onClose={closeOverlayWindow}
      clickThrough={clickThrough}
      onClickThroughChange={
        window.starcraftDS?.isElectron ? handleClickThroughChange : undefined
      }
    >
      {panel === "enemy" ? (
        <>
          {isElectronApp() ? (
            <CaptureHotkeySettings
              scanning={captureScanning}
              lastCaptureAt={lastCaptureAt}
              lastCaptureSummary={lastCaptureSummary}
              onInteractionChange={setHotkeyUiActive}
            />
          ) : null}
          {captureError ? (
            <p className="capture-hotkey-error overlay-capture-error">
              {captureError}
            </p>
          ) : null}
          <div className="overlay-interactive">
            <ManualArmyBuilder
              waves={manualWaves}
              collapsibleWaves
              onChange={(waves) => {
                setManualWaves(waves);
                publishOverlayState({ manualWaves: waves });
              }}
              onClearSelections={handleClearSelections}
              onSaveTraining={() => {
                const units = manualArmyEntries(manualWaves);
                if (units.length === 0) return;
                setTrainingSaving(true);
                void confirmCurrentLabels(units).finally(() =>
                  setTrainingSaving(false)
                );
              }}
              trainingPending={trainingPending}
              trainingSaving={trainingSaving}
            />
          </div>
        </>
      ) : (
        <div className="overlay-team-stack">
          <TeamSelection
            teamWaves={teamWaves}
            waveShift={waveShift}
            tierUnlocked={tierUnlocked}
            collapsibleWaves
            onChange={(teams) => {
              setTeamWaves(teams);
              publishOverlayState({ teamRaces: teams });
            }}
            onWaveShiftChange={(shift) => {
              setWaveShift(shift);
              publishOverlayState({ waveShift: shift });
            }}
            onTierUnlockedChange={(tiers) => {
              setTierUnlocked(tiers);
              publishOverlayState({ tierUnlocked: tiers });
            }}
          />
          <SuggestionsPanel
            playerRace={primaryTeamRace(teamWaves)}
            result={result}
            live={live}
            scanning={scanning}
            lastScanAt={lastScanAt}
            counterRefreshing={counterRefreshing}
            overlayMode
          />
        </div>
      )}
    </OverlayPanelShell>
  );
}
