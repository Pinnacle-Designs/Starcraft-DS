import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchUnitCatalog,
  type AnalyzeOptions,
  type TeamWaves,
  type WaveShift,
} from "./api";
import { applyScreenCaptureToWaves } from "./overlayScreenCapture";
import type { ManualWavesState } from "./manualArmy";
import type { CoachState } from "./overlaySync";
import type { PendingVisionCapture } from "./visionTraining";

let lastHandledCaptureAt = 0;

function shouldHandleCaptureEvent(at?: number): boolean {
  const stamp = at ?? 0;
  if (!stamp) return true;
  if (stamp <= lastHandledCaptureAt) return false;
  lastHandledCaptureAt = stamp;
  return true;
}

interface Options {
  enabled: boolean;
  manualWaves: ManualWavesState;
  teamWaves: TeamWaves;
  waveShift: WaveShift;
  analyzeOptions?: AnalyzeOptions;
  onWavesChange: (waves: ManualWavesState) => void;
  onCaptureComplete?: (patch: Partial<CoachState>) => void;
  onTrainingCapture?: (capture: Omit<PendingVisionCapture, "capturedAt">) => void;
}

export function useOverlayScreenCapture({
  enabled,
  manualWaves,
  teamWaves,
  waveShift,
  analyzeOptions,
  onWavesChange,
  onCaptureComplete,
  onTrainingCapture,
}: Options) {
  const [scanning, setScanning] = useState(false);
  const [lastCaptureAt, setLastCaptureAt] = useState<number | null>(null);
  const [lastCaptureSummary, setLastCaptureSummary] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const manualWavesRef = useRef(manualWaves);
  manualWavesRef.current = manualWaves;
  const teamWavesRef = useRef(teamWaves);
  teamWavesRef.current = teamWaves;
  const waveShiftRef = useRef(waveShift);
  waveShiftRef.current = waveShift;
  const analyzeOptionsRef = useRef(analyzeOptions);
  analyzeOptionsRef.current = analyzeOptions;
  const byRaceRef = useRef<Awaited<ReturnType<typeof fetchUnitCatalog>>["byRace"] | null>(
    null
  );
  const scanningRef = useRef(false);

  useEffect(() => {
    fetchUnitCatalog()
      .then((catalog) => {
        byRaceRef.current = catalog.byRace;
      })
      .catch(() => {
        byRaceRef.current = null;
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void window.starcraftDS?.requestScreenCaptureAccess?.();
  }, [enabled]);

  const runCapture = useCallback(async (imageBase64: string) => {
    if (!imageBase64?.trim() || scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setError(null);
    try {
      const applied = await applyScreenCaptureToWaves({
        imageBase64,
        manualWaves: manualWavesRef.current,
        teamWaves: teamWavesRef.current,
        waveShift: waveShiftRef.current,
        analyzeOptions: analyzeOptionsRef.current,
        byRace: byRaceRef.current ?? undefined,
      });

      onWavesChange(applied.waves);
      onTrainingCapture?.({
        imageBase64: applied.imageBase64,
        rawDetected: applied.detectedUnits,
        source: "overlay-hotkey",
        provider: applied.visionProvider,
        scene: applied.visionScene,
      });
      const waveBits = applied.detectedUnits
        .slice(0, 6)
        .map(
          (u) =>
            `${u.name}${u.wave ? ` W${u.wave}` : ""}${u.count > 1 ? ` ×${u.count}` : ""}`
        );
      const summary =
        applied.addedCount > 0
          ? `${applied.addedCount} unit${applied.addedCount === 1 ? "" : "s"} (${waveBits.join(", ")}${applied.detectedUnits.length > 6 ? "…" : ""})`
          : "No units detected";
      setLastCaptureAt(Date.now());
      setLastCaptureSummary(summary);
      onCaptureComplete?.({
        manualWaves: applied.waves,
        result: applied.result,
        scanning: false,
        lastScanAt: Date.now(),
      });
      if (applied.addedCount === 0) {
        setError(
          "No enemy units detected on screen — capture while enemies are visible on the map."
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screen capture failed");
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [onCaptureComplete, onTrainingCapture, onWavesChange]);

  useEffect(() => {
    if (!enabled || !window.starcraftDS?.onCaptureHotkey) return;
    return window.starcraftDS.onCaptureHotkey((payload) => {
      if (payload.error) {
        setError(payload.error);
        return;
      }
      if (!shouldHandleCaptureEvent(payload.at)) return;
      void runCapture(payload.base64);
    });
  }, [enabled, runCapture]);

  return {
    scanning,
    lastCaptureAt,
    lastCaptureSummary,
    error,
    runCapture,
  };
}
