import type { TeamWaves, WaveShift } from "./api";
import { ManualArmyBuilder } from "./ManualArmyBuilder";
import { TeamSelection } from "./TeamSelection";
import { WebFloatingPanel } from "./WebFloatingPanel";
import {
  OVERLAY_PANELS,
  type OverlayPanelId,
  type PanelVisibility,
} from "./overlayStorage";
import type { ManualWavesState } from "./manualArmy";
import type { TierUnlocked } from "./teamWaves";

interface Props {
  visible: PanelVisibility;
  onVisibleChange: (next: PanelVisibility) => void;
  /** True after the user has opened the overlay at least once this session. */
  sessionActive: boolean;
  manualWaves: ManualWavesState;
  onManualWavesChange: (waves: ManualWavesState) => void;
  teamWaves: TeamWaves;
  onTeamWavesChange: (teams: TeamWaves) => void;
  waveShift: WaveShift;
  onWaveShiftChange: (shift: WaveShift) => void;
  tierUnlocked: TierUnlocked;
  onTierUnlockedChange: (tiers: TierUnlocked) => void;
}

export function WebOverlayPanels({
  visible,
  onVisibleChange,
  sessionActive,
  manualWaves,
  onManualWavesChange,
  teamWaves,
  onTeamWavesChange,
  waveShift,
  onWaveShiftChange,
  tierUnlocked,
  onTierUnlockedChange,
}: Props) {
  const closePanel = (key: OverlayPanelId) => {
    onVisibleChange({ ...visible, [key]: false });
  };

  const openPanel = (key: OverlayPanelId) => {
    onVisibleChange({ ...visible, [key]: true });
  };

  const anyOpen = visible.enemy || visible.team;
  const anyClosed = !visible.enemy || !visible.team;
  const showDock = sessionActive && anyClosed;

  return (
    <div className="web-overlay-layer" aria-hidden={!anyOpen && !showDock}>
      {visible.enemy ? (
        <WebFloatingPanel
          id={OVERLAY_PANELS.enemy.storageKey}
          title={OVERLAY_PANELS.enemy.title}
          defaultPosition={OVERLAY_PANELS.enemy.defaultPosition}
          onClose={() => closePanel("enemy")}
        >
          <ManualArmyBuilder
            waves={manualWaves}
            onChange={onManualWavesChange}
          />
        </WebFloatingPanel>
      ) : null}

      {visible.team ? (
        <WebFloatingPanel
          id={OVERLAY_PANELS.team.storageKey}
          title={OVERLAY_PANELS.team.title}
          defaultPosition={OVERLAY_PANELS.team.defaultPosition}
          onClose={() => closePanel("team")}
        >
          <TeamSelection
            teamWaves={teamWaves}
            waveShift={waveShift}
            tierUnlocked={tierUnlocked}
            onChange={onTeamWavesChange}
            onWaveShiftChange={onWaveShiftChange}
            onTierUnlockedChange={onTierUnlockedChange}
          />
        </WebFloatingPanel>
      ) : null}

      {showDock ? (
        <div className="web-overlay-dock">
          {!visible.enemy ? (
            <button
              type="button"
              className="web-overlay-dock-btn"
              onClick={() => openPanel("enemy")}
            >
              Enemy waves
            </button>
          ) : null}
          {!visible.team ? (
            <button
              type="button"
              className="web-overlay-dock-btn"
              onClick={() => openPanel("team")}
            >
              Team selection
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
