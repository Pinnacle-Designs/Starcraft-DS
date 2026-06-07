import { useState } from "react";
import type { PlayerRace, TierUnlocked, UnitTier, WaveShift } from "./api";
import { CollapsibleWaveSection } from "./CollapsibleWaveSection";
import { WAVE_DEFS, type WaveIndex } from "./manualArmy";
import {
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
  0: false,
  1: false,
  2: false,
};

interface Props {
  teamWaves: TeamWaves;
  waveShift: WaveShift;
  tierUnlocked: TierUnlocked;
  onChange: (teams: TeamWaves) => void;
  onWaveShiftChange: (shift: WaveShift) => void;
  onTierUnlockedChange: (tiers: TierUnlocked) => void;
  collapsibleWaves?: boolean;
}

export function TeamSelection({
  teamWaves,
  waveShift,
  tierUnlocked,
  onChange,
  onWaveShiftChange,
  onTierUnlockedChange,
  collapsibleWaves = false,
}: Props) {
  const [expandedWaves, setExpandedWaves] =
    useState<Record<WaveIndex, boolean>>(DEFAULT_EXPANDED);

  const toggleWave = (index: WaveIndex) => {
    setExpandedWaves((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const waveSummary = (index: WaveIndex) =>
    `${teamWaves[index]} · T${tierUnlocked[index]}`;

  const renderWaveControls = (def: (typeof WAVE_DEFS)[number]) => (
    <div className="team-wave-controls">
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
              onChange(toggleTeamWaveRace(teamWaves, def.index, race))
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
                onTierUnlockedChange(
                  setTierUnlockedForWave(tierUnlocked, def.index, tier)
                )
              }
            >
              T{tier}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="panel-section team-selection">
      <h2 className="panel-section-title">
        <span className="panel-heading panel-heading-inline">Team selection</span>
      </h2>
      <p className="status team-selection-hint">
        Pick up to 3 races in wave order. Wave 2–3 are optional — counters fall
        back to earlier waves.
      </p>
      {collapsibleWaves ? (
        <div className="wave-collapsible-list">
          {WAVE_DEFS.map((def) => (
            <CollapsibleWaveSection
              key={def.index}
              label={def.label}
              colorClass={def.colorClass}
              summary={waveSummary(def.index)}
              expanded={expandedWaves[def.index]}
              onToggle={() => toggleWave(def.index)}
            >
              {renderWaveControls(def)}
            </CollapsibleWaveSection>
          ))}
        </div>
      ) : (
        WAVE_DEFS.map((def) => (
          <div key={def.index} className={`team-wave-row ${def.colorClass}`}>
            <span className="team-wave-label">{def.label}</span>
            {renderWaveControls(def)}
          </div>
        ))
      )}

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
        {" "}
        Tech tier sets which counters you can still build.
      </p>
    </div>
  );
}
