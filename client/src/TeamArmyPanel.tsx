import { useEffect, useState } from "react";
import {
  fetchUnitCatalog,
  type PlayerRace,
  type TierUnlocked,
  type UnitTier,
  type UnitsByRace,
  type WaveShift,
} from "./api";
import { CollapsibleWaveSection } from "./CollapsibleWaveSection";
import {
  clearWaveArmy,
  manualArmyEntries,
  manualArmyTotal,
  setUnitCount,
  updateWave,
  waveEntries,
  WAVE_DEFS,
  type ManualArmyState,
  type ManualWavesState,
  type WaveIndex,
} from "./manualArmy";
import {
  raceForWave,
  setTierUnlockedForWave,
  toggleTeamWaveRace,
  type TeamWaves,
} from "./teamWaves";

const RACES: PlayerRace[] = ["Protoss", "Terran", "Zerg"];

const WAVE_SHIFT_OPTIONS: { value: WaveShift; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "+1 wave" },
  { value: 2, label: "+2 waves" },
];

const TIER_OPTIONS: UnitTier[] = [1, 2, 3];

const DEFAULT_EXPANDED: Record<WaveIndex, boolean> = {
  0: true,
  1: false,
  2: false,
};

interface Props {
  teamWaves: TeamWaves;
  waveShift: WaveShift;
  tierUnlocked: TierUnlocked;
  friendlyWaves: ManualWavesState;
  onTeamChange: (teams: TeamWaves) => void;
  onWaveShiftChange: (shift: WaveShift) => void;
  onTierChange: (tiers: TierUnlocked) => void;
  onFriendlyChange: (waves: ManualWavesState) => void;
  onClearFriendly: () => void;
}

export function TeamArmyPanel({
  teamWaves,
  waveShift,
  tierUnlocked,
  friendlyWaves,
  onTeamChange,
  onWaveShiftChange,
  onTierChange,
  onFriendlyChange,
  onClearFriendly,
}: Props) {
  const [byRace, setByRace] = useState<UnitsByRace | null>(null);
  const [tierByUnit, setTierByUnit] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedWaves, setExpandedWaves] =
    useState<Record<WaveIndex, boolean>>(DEFAULT_EXPANDED);

  useEffect(() => {
    fetchUnitCatalog()
      .then(({ byRace: races, tierByUnit: tiers }) => {
        setByRace(races);
        setTierByUnit(tiers);
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Failed to load units")
      );
  }, []);

  const allEntries = manualArmyEntries(friendlyWaves);
  const total = manualArmyTotal(friendlyWaves);

  const toggleWave = (index: WaveIndex) => {
    setExpandedWaves((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const waveSummary = (index: WaveIndex) => {
    const race = raceForWave(teamWaves, (index + 1) as 1 | 2 | 3);
    const tagged = waveEntries(friendlyWaves.waves[index]).length;
    const parts = [race, `T${tierUnlocked[index]}`];
    if (tagged > 0) parts.push(`${tagged} tagged`);
    return parts.join(" · ");
  };

  const renderUnitGrid = (
    waveIndex: WaveIndex,
    waveArmy: ManualArmyState,
    patchWaveArmy: (next: ManualArmyState) => void
  ) => {
    const def = WAVE_DEFS[waveIndex];
    const race = raceForWave(teamWaves, (waveIndex + 1) as 1 | 2 | 3);
    const maxTier = tierUnlocked[waveIndex];
    const units = (byRace?.[race] ?? []).filter(
      (name) => (tierByUnit[name] ?? 2) <= maxTier
    );

    return (
      <>
        <p className={`status manual-army-hint ${def.colorClass}`}>
          {race} units at T{maxTier} or below — tag what you already have on the
          battlefield.
        </p>
        <div className={`manual-army-grid ${def.colorClass}`}>
          {units.length === 0 ? (
            <p className="status">No units at this tech tier.</p>
          ) : null}
          {units.flatMap((name, index) => {
            const tier = tierByUnit[name] ?? 2;
            const prevTier =
              index > 0 ? (tierByUnit[units[index - 1]] ?? 2) : null;
            const count = waveArmy.counts[name] ?? 0;
            const row = (
              <div key={name} className="manual-army-row">
                <span className="manual-army-name" title={name}>
                  {name}
                </span>
                <div className="unit-count-stepper">
                  <input
                    type="number"
                    className="unit-count-input"
                    min={0}
                    max={9999}
                    step={1}
                    value={count === 0 ? "" : count}
                    placeholder="0"
                    aria-label={`${name} count`}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n =
                        raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                      patchWaveArmy(setUnitCount(waveArmy, name, n));
                    }}
                  />
                  <div className="unit-count-arrows">
                    <button
                      type="button"
                      className="unit-count-arrow"
                      aria-label={`Increase ${name}`}
                      disabled={count >= 9999}
                      onClick={() =>
                        patchWaveArmy(
                          setUnitCount(waveArmy, name, Math.min(9999, count + 1))
                        )
                      }
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="unit-count-arrow"
                      aria-label={`Decrease ${name}`}
                      disabled={count <= 0}
                      onClick={() =>
                        patchWaveArmy(
                          setUnitCount(waveArmy, name, Math.max(0, count - 1))
                        )
                      }
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>
            );
            if (tier === prevTier) return [row];
            return [
              <div
                key={`tier-${waveIndex}-${tier}`}
                className="manual-army-tier-label"
              >
                Tier {tier}
              </div>,
              row,
            ];
          })}
        </div>
      </>
    );
  };

  return (
    <div className="panel-section team-army-panel">
      <h2 className="panel-section-title">
        <span className="panel-heading panel-heading-inline">
          Team &amp; army (up to 3)
        </span>
      </h2>
      <p className="status team-selection-hint">
        Pick races and tech per wave, then tag units you already have on the
        field.
      </p>

      {loadError ? (
        <p className="status" style={{ color: "var(--danger)" }}>
          {loadError}
        </p>
      ) : null}
      {!byRace && !loadError ? (
        <p className="status">Loading unit list…</p>
      ) : null}

      {byRace ? (
        <div className="wave-collapsible-list">
          {WAVE_DEFS.map((def) => {
            const waveArmy = friendlyWaves.waves[def.index];
            const patchWaveArmy = (next: ManualArmyState) =>
              onFriendlyChange(updateWave(friendlyWaves, def.index, next));

            return (
              <CollapsibleWaveSection
                key={def.index}
                label={def.label}
                colorClass={def.colorClass}
                summary={waveSummary(def.index)}
                expanded={expandedWaves[def.index]}
                onToggle={() => toggleWave(def.index)}
              >
                <div className="team-wave-controls team-wave-controls-stacked">
                  <div className="race-picker team-wave-picker">
                    {RACES.map((race) => (
                      <button
                        key={race}
                        type="button"
                        className={`race-btn ${
                          teamWaves[def.index] === race
                            ? `active-${race.toLowerCase()}`
                            : ""
                        }`}
                        onClick={() =>
                          onTeamChange(
                            toggleTeamWaveRace(teamWaves, def.index, race)
                          )
                        }
                      >
                        {race}
                      </button>
                    ))}
                  </div>
                  <div className="team-wave-tier">
                    <span className="team-tier-label">Tech</span>
                    <div className="tier-unlock-picker">
                      {TIER_OPTIONS.map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          className={`tier-unlock-btn${
                            tierUnlocked[def.index] === tier ? " active" : ""
                          }`}
                          title={`Max tech tier unlocked on ${def.label}`}
                          onClick={() =>
                            onTierChange(
                              setTierUnlockedForWave(
                                tierUnlocked,
                                def.index,
                                tier
                              )
                            )
                          }
                        >
                          T{tier}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {renderUnitGrid(def.index, waveArmy, patchWaveArmy)}

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
              </CollapsibleWaveSection>
            );
          })}
        </div>
      ) : null}

      <div className="wave-shift-row">
        <span className="panel-subheading">Wave shift</span>
        <div className="wave-shift-picker">
          {WAVE_SHIFT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`wave-shift-btn${waveShift === value ? " active" : ""}`}
              onClick={() => onWaveShiftChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="status team-selection-hint team-shift-hint">
        {waveShift === 0
          ? "Enemy tags match your team waves 1:1."
          : waveShift === 1
            ? "Your team is 1 wave ahead — enemy Wave 1 uses your Wave 2 counters, etc."
            : "Your team is 2 waves ahead — enemy Wave 1 uses your Wave 3 counters, etc."}
      </p>

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
          onClick={() => onClearFriendly()}
        >
          Clear selections
        </button>
      </div>
    </div>
  );
}
