import { useState } from "react";
import {
  type PlayerRace,
  type TeamWaves,
} from "./api";
import { CollapsibleWaveSection } from "./CollapsibleWaveSection";
import { showAiCaptureReplay } from "./featureFlags";
import { raceForWave } from "./teamWaves";
import {
  activeWaveArmy,
  clearWaveArmy,
  manualArmyEntries,
  manualArmyTotal,
  setActiveWave,
  setEnemyRace,
  updateActiveWave,
  updateWave,
  WAVE_DEFS,
  waveEntries,
  type ManualArmyState,
  type ManualWavesState,
  type WaveIndex,
} from "./manualArmy";
import { TieredUnitGrid } from "./TieredUnitGrid";
import { useUnitCatalog } from "./useUnitCatalog";

const RACES: PlayerRace[] = ["Protoss", "Terran", "Zerg"];

const DEFAULT_EXPANDED: Record<WaveIndex, boolean> = {
  0: false,
  1: false,
  2: false,
};

interface Props {
  waves: ManualWavesState;
  onChange: (waves: ManualWavesState) => void;
  onSubmit?: () => void;
  onClearSelections?: () => void;
  onSaveTraining?: () => void;
  trainingPending?: boolean;
  trainingSaving?: boolean;
  refreshing?: boolean;
  variant?: "enemy" | "friendly";
  teamWaves?: TeamWaves;
  collapsibleWaves?: boolean;
}

export function ManualArmyBuilder({
  waves,
  onChange,
  onSubmit,
  onClearSelections,
  onSaveTraining,
  trainingPending = false,
  trainingSaving = false,
  refreshing = false,
  variant = "enemy",
  teamWaves,
  collapsibleWaves = false,
}: Props) {
  const isFriendly = variant === "friendly";
  const [expandedWaves, setExpandedWaves] =
    useState<Record<WaveIndex, boolean>>(DEFAULT_EXPANDED);
  const { byRace, tierByUnit, loadError } = useUnitCatalog();

  const army = activeWaveArmy(waves);
  const waveDef = WAVE_DEFS[waves.activeWave];
  const friendlyRace =
    teamWaves && isFriendly
      ? raceForWave(teamWaves, (waves.activeWave + 1) as 1 | 2 | 3)
      : army.enemyRace;
  const displayRace = isFriendly ? friendlyRace : army.enemyRace;

  const allEntries = manualArmyEntries(waves);
  const waveOnlyEntries = waveEntries(army);
  const total = manualArmyTotal(waves);

  const patchArmy = (next: typeof army) => onChange(updateActiveWave(waves, next));

  const toggleWave = (index: WaveIndex) => {
    setExpandedWaves((prev) => ({ ...prev, [index]: !prev[index] }));
    onChange(setActiveWave(waves, index));
  };

  const waveSummary = (waveIndex: WaveIndex, waveArmy: ManualArmyState) => {
    const count = waveEntries(waveArmy).length;
    const race =
      isFriendly && teamWaves
        ? raceForWave(teamWaves, (waveIndex + 1) as 1 | 2 | 3)
        : waveArmy.enemyRace;
    const parts: string[] = [race];
    if (count > 0) parts.push(`${count} tagged`);
    return parts.join(" · ");
  };

  const renderUnitGrid = (
    waveIndex: WaveIndex,
    waveArmy: ManualArmyState,
    patchWaveArmy: (next: ManualArmyState) => void,
    showWaveClear = false
  ) => {
    const def = WAVE_DEFS[waveIndex];
    const race =
      isFriendly && teamWaves
        ? raceForWave(teamWaves, (waveIndex + 1) as 1 | 2 | 3)
        : waveArmy.enemyRace;
    const units = byRace?.[race] ?? [];

    return (
      <>
        <p className={`status manual-army-hint ${def.colorClass}`}>
          {isFriendly
            ? `${race} units you already have on the battlefield.`
            : `${race} units by tech tier.`}
        </p>

        {!isFriendly ? (
          <div className="manual-army-header">
            <span className="panel-subheading">Opponent race</span>
            <div className="race-picker manual-army-races">
              {RACES.map((raceOption) => (
                <button
                  key={raceOption}
                  type="button"
                  className={`race-btn ${
                    waveArmy.enemyRace === raceOption
                      ? `active-${raceOption.toLowerCase()}`
                      : ""
                  }`}
                  onClick={() => patchWaveArmy(setEnemyRace(waveArmy, raceOption))}
                >
                  {raceOption}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="manual-army-header">
            <span className="panel-subheading">Team race</span>
            <span className="friendly-race-label">{race}</span>
          </div>
        )}

        <TieredUnitGrid
          waveIndex={waveIndex}
          colorClass={def.colorClass}
          units={units}
          tierByUnit={tierByUnit}
          waveArmy={waveArmy}
          patchWaveArmy={patchWaveArmy}
          emptyMessage="No units for this race."
        />

        {showWaveClear ? (
          <div className="manual-army-actions manual-army-actions-inline">
            <button
              type="button"
              className="btn"
              disabled={waveEntries(waveArmy).length === 0}
              onClick={() => patchWaveArmy(clearWaveArmy(waveArmy))}
            >
              Clear {def.label}
            </button>
          </div>
        ) : null}
      </>
    );
  };

  const renderActions = () => (
    <div className="manual-army-actions">
      <span className="status">
        {allEntries.length === 0
          ? "No units tagged across waves"
          : `${allEntries.length} tagged · ${total} units total`}
      </span>
      <button
        type="button"
        className="btn"
        disabled={allEntries.length === 0}
        onClick={() => onClearSelections?.()}
      >
        Clear selections
      </button>
      {!isFriendly && showAiCaptureReplay && onSaveTraining ? (
        <button
          type="button"
          className="btn"
          disabled={!trainingPending || allEntries.length === 0 || trainingSaving}
          title="Save this screenshot with your unit labels so vision improves on future captures"
          onClick={() => onSaveTraining()}
        >
          {trainingSaving ? "Saving…" : "Train from labels"}
        </button>
      ) : null}
      {!isFriendly && onSubmit ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={allEntries.length === 0 || refreshing}
          onClick={() => onSubmit()}
        >
          {refreshing ? "Refreshing…" : "Refresh counters"}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="panel-section manual-army">
      <div className="manual-army-header">
        <h2 className="panel-section-title">
          <span className="panel-heading panel-heading-inline">
            {isFriendly ? "Your army (up to 3)" : "Enemy waves (up to 3)"}
          </span>
        </h2>
        {!collapsibleWaves ? (
          <div className="wave-tabs">
            {WAVE_DEFS.map((def) => {
              const count = waveEntries(waves.waves[def.index]).length;
              return (
                <button
                  key={def.index}
                  type="button"
                  className={`wave-tab ${def.colorClass} ${
                    waves.activeWave === def.index ? "active" : ""
                  }`}
                  onClick={() => onChange(setActiveWave(waves, def.index))}
                >
                  {def.label}
                  {count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {!isFriendly ? (
        <p className="status team-selection-hint">
          Pick opponent race per wave, then tag enemy units on the field.
        </p>
      ) : null}

      {loadError && (
        <p className="status" style={{ color: "var(--danger)" }}>
          {loadError}
        </p>
      )}

      {!byRace && !loadError && (
        <p className="status">Loading unit list…</p>
      )}

      {byRace && collapsibleWaves ? (
        <>
          <div className="wave-collapsible-list">
            {WAVE_DEFS.map((def) => {
              const waveArmy = waves.waves[def.index];
              const patchWaveArmy = (next: ManualArmyState) =>
                onChange(updateWave(waves, def.index, next));
              return (
                <CollapsibleWaveSection
                  key={def.index}
                  label={def.label}
                  colorClass={def.colorClass}
                  summary={waveSummary(def.index, waveArmy)}
                  expanded={expandedWaves[def.index]}
                  onToggle={() => toggleWave(def.index)}
                >
                  {renderUnitGrid(def.index, waveArmy, patchWaveArmy, true)}
                </CollapsibleWaveSection>
              );
            })}
          </div>
          {renderActions()}
        </>
      ) : null}

      {byRace && !collapsibleWaves ? (
        <>
          <p className={`status manual-army-hint ${waveDef.colorClass}`}>
            Editing <strong>{waveDef.label}</strong> — {displayRace} units by
            tech tier.
            {isFriendly
              ? " Tag what you already have on the battlefield."
              : " Counters update automatically when any wave changes."}
          </p>

          {!isFriendly ? (
            <div className="manual-army-header">
              <span className="panel-subheading">Opponent race ({waveDef.label})</span>
              <div className="race-picker manual-army-races">
                {RACES.map((race) => (
                  <button
                    key={race}
                    type="button"
                    className={`race-btn ${
                      army.enemyRace === race
                        ? `active-${race.toLowerCase()}`
                        : ""
                    }`}
                    onClick={() => patchArmy(setEnemyRace(army, race))}
                  >
                    {race}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="manual-army-header">
              <span className="panel-subheading">Team race ({waveDef.label})</span>
              <span className="friendly-race-label">{displayRace}</span>
            </div>
          )}

          {renderUnitGrid(waves.activeWave, army, patchArmy)}

          <div className="manual-army-actions">
            <span className="status">
              {allEntries.length === 0
                ? "No units tagged across waves"
                : `${allEntries.length} tagged · ${total} units total`}
            </span>
            <button
              type="button"
              className="btn"
              disabled={waveOnlyEntries.length === 0}
              onClick={() => patchArmy(clearWaveArmy(army))}
            >
              Clear {waveDef.label}
            </button>
            <button
              type="button"
              className="btn"
              disabled={allEntries.length === 0}
              onClick={() => onClearSelections?.()}
            >
              Clear selections
            </button>
            {!isFriendly && onSubmit ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={allEntries.length === 0 || refreshing}
                onClick={() => onSubmit()}
              >
                {refreshing ? "Refreshing…" : "Refresh counters"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
