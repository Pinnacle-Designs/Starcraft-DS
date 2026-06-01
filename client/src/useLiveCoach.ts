import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeFrame,
  type AnalyzeResponse,
  type PlayerRace,
} from "./api";

const LIVE_INTERVAL_MS = 4000;
const LIVE_INTERVAL_MANUAL_MS = 2000;

export function parseManualUnits(input: string): string[] {
  return input
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Options {
  live: boolean;
  capturing: boolean;
  frameReady: boolean;
  playerRace: PlayerRace;
  visionEnabled: boolean;
  manualInput: string;
  captureFrameBase64: () => string | null;
  onResult: (data: AnalyzeResponse) => void;
  onError: (message: string | null) => void;
}

export function useLiveCoach({
  live,
  capturing,
  frameReady,
  playerRace,
  visionEnabled,
  manualInput,
  captureFrameBase64,
  onResult,
  onError,
}: Options) {
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const manualUnits = parseManualUnits(manualInput);
  const manualOnly = manualUnits.length > 0 && !visionEnabled;
  const canLive = visionEnabled || manualUnits.length > 0;

  const runScan = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setScanning(true);
    onError(null);

    try {
      if (manualOnly) {
        onResult(await analyzeFrame("", playerRace, manualUnits));
        setLastScanAt(Date.now());
        return;
      }

      const b64 = captureFrameBase64();
      if (!b64) {
        onError("Waiting for video frame…");
        return;
      }

      const data = await analyzeFrame(b64, playerRace);
      onResult(data);
      setLastScanAt(Date.now());

      if (data.detectedUnits.length === 0) {
        onError(
          data.scene?.slice(0, 120) ||
            "No enemy units detected in this frame — adjust view or use manual tags."
        );
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Live scan failed");
    } finally {
      inFlightRef.current = false;
      setScanning(false);
    }
  }, [
    manualOnly,
    manualUnits,
    playerRace,
    captureFrameBase64,
    onResult,
    onError,
  ]);

  useEffect(() => {
    if (!live || !capturing || !canLive) return;
    if (!manualOnly && !frameReady) return;

    let cancelled = false;
    let timeoutId = 0;
    const delay = manualOnly ? LIVE_INTERVAL_MANUAL_MS : LIVE_INTERVAL_MS;

    const schedule = (ms: number) => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        void runScan().finally(() => {
          if (!cancelled && live) schedule(delay);
        });
      }, ms);
    };

    void runScan().finally(() => {
      if (!cancelled && live) schedule(delay);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [live, capturing, frameReady, canLive, manualOnly, runScan]);

  return { scanning, lastScanAt, canLive, manualOnly };
}
