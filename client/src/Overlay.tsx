import { useCallback, useEffect, useState } from "react";
import type { WaveShift } from "./api";
import { ManualArmyBuilder } from "./ManualArmyBuilder";
import { TeamSelection } from "./TeamSelection";
import { OverlayPanelShell } from "./OverlayPanelShell";
import {
  DEFAULT_TEAM_WAVES,
  DEFAULT_TIER_UNLOCKED,
  type TierUnlocked,
} from "./teamWaves";
import { EMPTY_MANUAL_WAVES, type ManualWavesState } from "./manualArmy";
import {
  loadCoachState,
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

  const applyRemoteState = useCallback((incoming: CoachState) => {
    if (incoming.origin === OVERLAY_SYNC_ORIGIN) return;
    if (incoming.teamRaces) setTeamWaves(incoming.teamRaces);
    if (incoming.waveShift != null) setWaveShift(incoming.waveShift);
    if (incoming.tierUnlocked) setTierUnlocked(incoming.tierUnlocked);
    if (incoming.manualWaves) setManualWaves(incoming.manualWaves);
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
    if (window.starcraftDS?.isElectron) {
      document.body.classList.add("overlay-electron");
    }
    const initial = loadCoachState();
    if (initial) applyRemoteState(initial);
    return () => {
      document.body.classList.remove(
        "overlay-mode",
        "overlay-panel-window",
        "overlay-electron"
      );
    };
  }, [applyRemoteState]);

  useEffect(() => subscribeCoachState(applyRemoteState), [applyRemoteState]);

  useEffect(() => {
    if (!window.starcraftDS?.isElectron) return;
    void window.starcraftDS.setAlwaysOnTop(true);
  }, []);

  return (
    <OverlayPanelShell title={spec.title} onClose={closeOverlayWindow}>
      {panel === "enemy" ? (
        <ManualArmyBuilder
          waves={manualWaves}
          onChange={(waves) => {
            setManualWaves(waves);
            publishOverlayState({ manualWaves: waves });
          }}
        />
      ) : (
        <TeamSelection
          teamWaves={teamWaves}
          waveShift={waveShift}
          tierUnlocked={tierUnlocked}
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
      )}
    </OverlayPanelShell>
  );
}
