import { useEffect, useState } from "react";
import {
  fetchUnitCatalog,
  type PlayerRace,
  type UnitsByRace,
} from "./api";
import {
  activeWaveArmy,
  clearAllWaves,
  clearWaveArmy,
  manualArmyEntries,
  manualArmyTotal,
  setActiveWave,
  setEnemyRace,
  setUnitCount,
  updateActiveWave,
  WAVE_DEFS,
  waveEntries,
  type ManualWavesState,
} from "./manualArmy";

const RACES: PlayerRace[] = ["Protoss", "Terran", "Zerg"];

interface Props {
  waves: ManualWavesState;
  onChange: (waves: ManualWavesState) => void;
  onSubmit: () => void;
}

export function ManualArmyBuilder({ waves, onChange, onSubmit }: Props) {
  const [byRace, setByRace] = useState<UnitsByRace | null>(null);
  const [tierByUnit, setTierByUnit] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const army = activeWaveArmy(waves);
  const waveDef = WAVE_DEFS[waves.activeWave];

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

  const units = byRace?.[army.enemyRace] ?? [];
  const allEntries = manualArmyEntries(waves);
  const waveOnlyEntries = waveEntries(army);
  const total = manualArmyTotal(waves);

  const patchArmy = (next: typeof army) => onChange(updateActiveWave(waves, next));

  return (
    <div className="manual-army">
      <div className="manual-army-header">
        <span className="status">Enemy waves (up to 3)</span>
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
      </div>

      {loadError && (
        <p className="status" style={{ color: "var(--danger)" }}>
          {loadError}
        </p>
      )}

      {!byRace && !loadError && (
        <p className="status">Loading unit list…</p>
      )}

      {byRace && (
        <>
          <p className={`status manual-army-hint ${waveDef.colorClass}`}>
            Editing <strong>{waveDef.label}</strong> — {army.enemyRace} units by
            tech tier. Counters update automatically when any wave changes.
          </p>

          <div className="manual-army-header">
            <span className="status">Opponent race ({waveDef.label})</span>
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

          <div className={`manual-army-grid ${waveDef.colorClass}`}>
            {units.flatMap((name, index) => {
              const tier = tierByUnit[name] ?? 2;
              const prevTier =
                index > 0 ? (tierByUnit[units[index - 1]] ?? 2) : null;
              const count = army.counts[name] ?? 0;
              const row = (
                <label key={name} className="manual-army-row">
                  <span className="manual-army-name" title={name}>
                    {name}
                  </span>
                  <input
                    type="number"
                    className="unit-count-input"
                    min={0}
                    max={9999}
                    step={1}
                    value={count === 0 ? "" : count}
                    placeholder="0"
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n =
                        raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                      patchArmy(setUnitCount(army, name, n));
                    }}
                  />
                </label>
              );
              if (tier === prevTier) return [row];
              return [
                <div
                  key={`tier-${waves.activeWave}-${tier}`}
                  className="manual-army-tier-label"
                >
                  Tier {tier}
                </div>,
                row,
              ];
            })}
          </div>

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
              onClick={() => onChange(clearAllWaves(waves))}
            >
              Clear all waves
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={allEntries.length === 0}
              onClick={onSubmit}
            >
              Refresh counters
            </button>
          </div>
        </>
      )}
    </div>
  );
}
