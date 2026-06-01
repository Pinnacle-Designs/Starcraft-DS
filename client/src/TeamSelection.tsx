import type { PlayerRace, WaveShift } from "./api";
import { WAVE_DEFS } from "./manualArmy";
import {
  toggleTeamWaveRace,
  type TeamWaves,
} from "./teamWaves";

const RACES: PlayerRace[] = ["Protoss", "Terran", "Zerg"];

const WAVE_SHIFT_OPTIONS: { value: WaveShift; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "+1 wave" },
  { value: 2, label: "+2 waves" },
];

interface Props {
  teamWaves: TeamWaves;
  waveShift: WaveShift;
  onChange: (teams: TeamWaves) => void;
  onWaveShiftChange: (shift: WaveShift) => void;
}

export function TeamSelection({
  teamWaves,
  waveShift,
  onChange,
  onWaveShiftChange,
}: Props) {
  return (
    <div className="panel-section team-selection">
      <h2 className="panel-section-title">
        <span className="panel-heading panel-heading-inline">Team selection</span>
      </h2>
      <p className="status team-selection-hint">
        Pick up to 3 races in wave order. Wave 2–3 are optional — counters fall
        back to earlier waves.
      </p>
      {WAVE_DEFS.map((def) => (
        <div
          key={def.index}
          className={`team-wave-row ${def.colorClass}`}
        >
          <span className="team-wave-label">{def.label}</span>
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
        </div>
      ))}

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
    </div>
  );
}