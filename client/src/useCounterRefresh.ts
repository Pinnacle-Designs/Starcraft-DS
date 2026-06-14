import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeFrame,
  type AnalyzeOptions,
  type AnalyzeResponse,
  type ManualUnitInput,
  type TeamWaves,
  type WaveShift,
} from "./api";
import { detectedToManual } from "./detectedUnits";
import { manualArmyEntries, type ManualWavesState } from "./manualArmy";
import type { TierUnlocked } from "./teamWaves";

interface Options {
  manualWaves: ManualWavesState;
  teamWaves: TeamWaves;
  waveShift: WaveShift;
  tierUnlocked: TierUnlocked;
  friendlyUnitsKey: string;
  analyzeOptions: AnalyzeOptions;
  result: AnalyzeResponse | null;
  onResult: (data: AnalyzeResponse) => void;
  onError: (message: string | null) => void;
  onClearResult?: () => void;
  trainingPending?: boolean;
  onTrainingSubmit?: (units: ManualUnitInput[]) => unknown;
}

export function useCounterRefresh({
  manualWaves,
  teamWaves,
  waveShift,
  tierUnlocked,
  friendlyUnitsKey,
  analyzeOptions,
  result,
  onResult,
  onError,
  onClearResult,
  trainingPending = false,
  onTrainingSubmit,
}: Options) {
  const [counterRefreshing, setCounterRefreshing] = useState(false);

  const manualWavesRef = useRef(manualWaves);
  manualWavesRef.current = manualWaves;
  const teamWavesRef = useRef(teamWaves);
  teamWavesRef.current = teamWaves;
  const waveShiftRef = useRef(waveShift);
  waveShiftRef.current = waveShift;
  const analyzeOptionsRef = useRef(analyzeOptions);
  analyzeOptionsRef.current = analyzeOptions;
  const resultRef = useRef(result);
  resultRef.current = result;

  const manualUnitsKey = useMemo(
    () => JSON.stringify(manualArmyEntries(manualWaves)),
    [manualWaves]
  );
  const teamWavesKey = useMemo(() => JSON.stringify(teamWaves), [teamWaves]);
  const tierUnlockedKey = useMemo(
    () => JSON.stringify(tierUnlocked),
    [tierUnlocked]
  );

  const refreshCounters = useCallback(async () => {
    const units = manualArmyEntries(manualWavesRef.current);
    const teams = teamWavesRef.current;
    const shift = waveShiftRef.current;
    const current = resultRef.current;

    setCounterRefreshing(true);
    onError(null);
    try {
      if (units.length > 0) {
        onResult(
          await analyzeFrame("", teams, units, shift, analyzeOptionsRef.current)
        );
        return;
      }

      if (current?.detectedUnits?.length) {
        onResult(
          await analyzeFrame(
            "",
            teams,
            detectedToManual(current.detectedUnits),
            shift,
            analyzeOptionsRef.current
          )
        );
        return;
      }

      onError("Tag enemy units or analyze a frame to refresh counters.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Counter refresh failed");
    } finally {
      setCounterRefreshing(false);
    }
  }, [onError, onResult]);

  const refreshCountersRef = useRef(refreshCounters);
  refreshCountersRef.current = refreshCounters;
  const onTrainingSubmitRef = useRef(onTrainingSubmit);
  onTrainingSubmitRef.current = onTrainingSubmit;

  useEffect(() => {
    const id = window.setTimeout(() => {
      const units = manualArmyEntries(manualWavesRef.current);
      const current = resultRef.current;

      if (units.length > 0 || current?.detectedUnits?.length) {
        void refreshCountersRef.current();
        if (trainingPending && units.length > 0) {
          void onTrainingSubmitRef.current?.(units);
        }
        return;
      }

      if (current?.suggestions?.length) {
        onClearResult?.();
      }
    }, 200);
    return () => clearTimeout(id);
  }, [
    manualUnitsKey,
    friendlyUnitsKey,
    tierUnlockedKey,
    teamWavesKey,
    waveShift,
    trainingPending,
    onClearResult,
  ]);

  return { counterRefreshing, refreshCounters };
}
