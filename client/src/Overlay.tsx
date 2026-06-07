import { useCallback, useEffect, useState } from "react";
import type { AnalyzeResponse, WaveShift } from "./api";
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
import { EMPTY_MANUAL_WAVES, type ManualWavesState } from "./manualArmy";
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
        result: base?.result ?? null,
        live: base?.live ?? false,
        scanning: base?.scanning,
        lastScanAt: base?.lastScanAt,
        origin: OVERLAY_SYNC_ORIGIN,
        updatedAt: Date.now(),
      });
    },
    [teamWaves, waveShift, tierUnlocked, manualWaves]
  );

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
    if (!window.starcraftDS?.isElectron) return;
    const repin = () => {
      void window.starcraftDS?.setAlwaysOnTop(true);
    };
    repin();
    window.addEventListener("blur", repin);
    return () => window.removeEventListener("blur", repin);
  }, []);

  useEffect(() => {
    if (!window.starcraftDS?.onClickThroughStateChange) return;
    return window.starcraftDS.onClickThroughStateChange(setClickThrough);
  }, []);

  const handleClickThroughChange = useCallback((enabled: boolean) => {
    if (!window.starcraftDS?.setClickThrough) return;
    void window.starcraftDS.setClickThrough(enabled);
  }, []);

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
        <ManualArmyBuilder
          waves={manualWaves}
          collapsibleWaves
          onChange={(waves) => {
            setManualWaves(waves);
            publishOverlayState({ manualWaves: waves });
          }}
        />
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
