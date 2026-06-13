import { useMemo, useState } from "react";
import {
  setUnitCount,
  type ManualArmyState,
  type WaveIndex,
} from "./manualArmy";

interface Props {
  waveIndex: WaveIndex;
  colorClass: string;
  units: string[];
  tierByUnit: Record<string, number>;
  waveArmy: ManualArmyState;
  patchWaveArmy: (next: ManualArmyState) => void;
  emptyMessage?: string;
}

function groupUnitsByTier(
  units: string[],
  tierByUnit: Record<string, number>
): Map<number, string[]> {
  const byTier = new Map<number, string[]>();
  for (const name of units) {
    const tier = tierByUnit[name] ?? 2;
    const list = byTier.get(tier) ?? [];
    list.push(name);
    byTier.set(tier, list);
  }
  return byTier;
}

function tierSummary(
  units: string[],
  counts: Record<string, number>
): string | undefined {
  const tagged = units.filter((name) => (counts[name] ?? 0) > 0).length;
  if (tagged === 0) return undefined;
  const total = units.reduce((sum, name) => sum + (counts[name] ?? 0), 0);
  return tagged === 1 ? `1 tagged · ${total}` : `${tagged} tagged · ${total}`;
}

const MIN_UNIT_COUNT = 0;
const MAX_UNIT_COUNT = 9999;

function clampUnitCount(n: number): number {
  return Math.max(MIN_UNIT_COUNT, Math.min(MAX_UNIT_COUNT, n));
}

function bumpUnitCount(
  waveArmy: ManualArmyState,
  name: string,
  delta: number
): ManualArmyState {
  const current = waveArmy.counts[name] ?? 0;
  return setUnitCount(waveArmy, name, clampUnitCount(current + delta));
}

export function TieredUnitGrid({
  waveIndex,
  colorClass,
  units,
  tierByUnit,
  waveArmy,
  patchWaveArmy,
  emptyMessage = "No units at this tech tier.",
}: Props) {
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>(
    {}
  );

  const unitsByTier = useMemo(
    () => groupUnitsByTier(units, tierByUnit),
    [units, tierByUnit]
  );
  const sortedTiers = useMemo(
    () => [...unitsByTier.keys()].sort((a, b) => a - b),
    [unitsByTier]
  );

  const tierKey = (tier: number) => `${waveIndex}-${tier}`;
  const isTierExpanded = (tier: number) =>
    expandedTiers[tierKey(tier)] ?? true;

  const toggleTier = (tier: number) => {
    const key = tierKey(tier);
    setExpandedTiers((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  };

  if (units.length === 0) {
    return <p className="status">{emptyMessage}</p>;
  }

  return (
    <div className="tier-collapsible-list">
      {sortedTiers.map((tier) => {
        const tierUnits = unitsByTier.get(tier) ?? [];
        const expanded = isTierExpanded(tier);
        const summary = tierSummary(tierUnits, waveArmy.counts);

        return (
          <section
            key={tier}
            className={`tier-collapsible ${colorClass}`}
          >
            <button
              type="button"
              className="tier-collapsible-toggle"
              onClick={() => toggleTier(tier)}
              aria-expanded={expanded}
            >
              <span className="panel-section-chevron" aria-hidden>
                {expanded ? "▼" : "▶"}
              </span>
              <span className="tier-collapsible-label">Tier {tier}</span>
              {summary ? (
                <span className="tier-collapsible-summary">{summary}</span>
              ) : null}
            </button>
            {expanded ? (
              <div className={`manual-army-grid tier-collapsible-body ${colorClass}`}>
                {tierUnits.map((name) => {
                  const count = waveArmy.counts[name] ?? 0;
                  return (
                    <div key={name} className="manual-army-row">
                      <span className="manual-army-name" title={name}>
                        {name}
                      </span>
                      <div className="unit-count-controls">
                        {([-10, -5] as const).map((delta) => (
                          <button
                            key={delta}
                            type="button"
                            className="unit-count-bulk-btn"
                            aria-label={`Decrease ${name} by ${Math.abs(delta)}`}
                            disabled={count <= MIN_UNIT_COUNT}
                            onClick={() =>
                              patchWaveArmy(
                                bumpUnitCount(waveArmy, name, delta)
                              )
                            }
                          >
                            {delta}
                          </button>
                        ))}
                        <div className="unit-count-stepper">
                          <input
                            type="number"
                            className="unit-count-input"
                            min={MIN_UNIT_COUNT}
                            max={MAX_UNIT_COUNT}
                            step={1}
                            value={count === 0 ? "" : count}
                            placeholder="0"
                            aria-label={`${name} count`}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const n =
                                raw === ""
                                  ? 0
                                  : clampUnitCount(parseInt(raw, 10) || 0);
                              patchWaveArmy(
                                setUnitCount(waveArmy, name, n)
                              );
                            }}
                          />
                          <div className="unit-count-arrows">
                            <button
                              type="button"
                              className="unit-count-arrow"
                              aria-label={`Increase ${name}`}
                              disabled={count >= MAX_UNIT_COUNT}
                              onClick={() =>
                                patchWaveArmy(
                                  bumpUnitCount(waveArmy, name, 1)
                                )
                              }
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="unit-count-arrow"
                              aria-label={`Decrease ${name}`}
                              disabled={count <= MIN_UNIT_COUNT}
                              onClick={() =>
                                patchWaveArmy(
                                  bumpUnitCount(waveArmy, name, -1)
                                )
                              }
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                        {([5, 10] as const).map((delta) => (
                          <button
                            key={delta}
                            type="button"
                            className="unit-count-bulk-btn"
                            aria-label={`Increase ${name} by ${delta}`}
                            disabled={count >= MAX_UNIT_COUNT}
                            onClick={() =>
                              patchWaveArmy(
                                bumpUnitCount(waveArmy, name, delta)
                              )
                            }
                          >
                            +{delta}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
