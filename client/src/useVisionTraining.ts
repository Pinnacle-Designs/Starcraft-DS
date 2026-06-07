import { useCallback, useEffect, useRef, useState } from "react";
import type { ManualUnitInput, TeamWaves, WaveShift } from "./api";
import {
  fetchTrainingStats,
  labelsEqual,
  submitVisionCorrection,
  type PendingVisionCapture,
  type TrainingSource,
  type TrainingStats,
} from "./visionTraining";

interface Options {
  teamRaces: TeamWaves;
  waveShift: WaveShift;
}

export function useVisionTraining({ teamRaces, waveShift }: Options) {
  const pendingRef = useRef<PendingVisionCapture | null>(null);
  const submittingRef = useRef(false);
  const [pendingCapture, setPendingCapture] = useState(false);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const next = await fetchTrainingStats();
      setStats(next);
    } catch {
      /* server may be offline */
    }
  }, []);

  useEffect(() => {
    void refreshStats();
    const id = window.setInterval(() => void refreshStats(), 30_000);
    return () => clearInterval(id);
  }, [refreshStats]);

  const registerCapture = useCallback((capture: Omit<PendingVisionCapture, "capturedAt">) => {
    if (!capture.imageBase64?.trim()) return;
    pendingRef.current = { ...capture, capturedAt: Date.now() };
    setPendingCapture(true);
  }, []);

  const submitCorrection = useCallback(
    async (
      corrected: ManualUnitInput[],
      options?: { force?: boolean; source?: TrainingSource }
    ) => {
      const pending = pendingRef.current;
      if (!pending || submittingRef.current) {
        return { saved: false as const, reason: "no pending capture" };
      }
      if (
        !options?.force &&
        corrected.length === 0
      ) {
        return { saved: false as const, reason: "no corrected labels" };
      }
      if (!options?.force && labelsEqual(pending.rawDetected, corrected)) {
        return { saved: false as const, reason: "labels unchanged" };
      }

      submittingRef.current = true;
      setSaveError(null);
      try {
        const result = await submitVisionCorrection({
          imageBase64: pending.imageBase64,
          rawDetected: pending.rawDetected,
          corrected,
          source: options?.source ?? pending.source,
          provider: pending.provider,
          teamRaces,
          waveShift,
          scene: pending.scene,
          force: options?.force,
        });
        if (result.saved) {
          setLastSavedAt(Date.now());
          pendingRef.current = null;
          setPendingCapture(false);
        }
        setStats(result.stats);
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Training save failed";
        setSaveError(message);
        return { saved: false as const, reason: message };
      } finally {
        submittingRef.current = false;
      }
    },
    [teamRaces, waveShift]
  );

  const confirmCurrentLabels = useCallback(
    async (corrected: ManualUnitInput[]) => {
      return submitCorrection(corrected, {
        force: true,
        source: "manual-confirm",
      });
    },
    [submitCorrection]
  );

  return {
    stats,
    lastSavedAt,
    saveError,
    pendingCapture,
    registerCapture,
    submitCorrection,
    confirmCurrentLabels,
    refreshStats,
  };
}
