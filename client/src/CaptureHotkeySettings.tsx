import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CAPTURE_HOTKEY,
  formatHotkeyLabel,
  isValidCaptureHotkey,
  keyboardEventToAccelerator,
  loadCaptureHotkey,
  normalizeAccelerator,
  saveCaptureHotkey,
} from "./overlayCaptureHotkey";

interface Props {
  onHotkeyChange?: (accelerator: string) => void;
  scanning?: boolean;
  lastCaptureAt?: number | null;
  lastCaptureSummary?: string | null;
  compact?: boolean;
}

export function CaptureHotkeySettings({
  onHotkeyChange,
  scanning = false,
  lastCaptureAt = null,
  lastCaptureSummary = null,
  compact = false,
}: Props) {
  const initial = loadCaptureHotkey();
  const [hotkey, setHotkey] = useState(initial);
  const [recording, setRecording] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState(formatHotkeyLabel(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recordingRef = useRef(false);

  const endRecordingMode = useCallback(async () => {
    setRecording(false);
    if (window.starcraftDS?.endHotkeyRecording) {
      await window.starcraftDS.endHotkeyRecording();
    }
  }, []);

  useEffect(() => {
    const api = window.starcraftDS;
    if (!api?.getCaptureHotkey) return;
    void (async () => {
      const accel = await api.getCaptureHotkey();
      if (accel) {
        const normalized = normalizeAccelerator(accel);
        setHotkey(normalized);
        saveCaptureHotkey(normalized);
        setManualValue(formatHotkeyLabel(normalized));
      }
      if (api.getCaptureHotkeyStatus) {
        const status = await api.getCaptureHotkeyStatus();
        if (!status.registered) {
          setError(
            `${formatHotkeyLabel(status.saved)} is not available on this PC. Choose another shortcut.`
          );
        } else if (status.active !== status.saved) {
          setError(
            `${formatHotkeyLabel(status.saved)} is in use by another app. Active shortcut: ${formatHotkeyLabel(status.active)}.`
          );
          setHotkey(normalizeAccelerator(status.active));
          setManualValue(formatHotkeyLabel(status.active));
        }
      }
    })();
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        void window.starcraftDS?.endHotkeyRecording?.();
      }
    };
  }, []);

  const persistHotkey = useCallback(
    async (rawAccelerator: string) => {
      const accelerator = normalizeAccelerator(rawAccelerator);
      if (!isValidCaptureHotkey(accelerator)) {
        setError("Use at least one modifier (Ctrl, Alt, Shift) plus a key.");
        await endRecordingMode();
        return false;
      }

      setSaving(true);
      setError(null);

      try {
        if (window.starcraftDS?.setCaptureHotkey) {
          const result = await window.starcraftDS.setCaptureHotkey(accelerator);
          if (!result.ok) {
            setError(result.error ?? "Hotkey could not be registered.");
            return false;
          }
          const saved = normalizeAccelerator(
            result.accelerator ?? accelerator
          );
          saveCaptureHotkey(saved);
          setHotkey(saved);
          setManualValue(formatHotkeyLabel(saved));
          onHotkeyChange?.(saved);
          return true;
        }

        saveCaptureHotkey(accelerator);
        setHotkey(accelerator);
        setManualValue(formatHotkeyLabel(accelerator));
        onHotkeyChange?.(accelerator);
        return true;
      } finally {
        setSaving(false);
        await endRecordingMode();
      }
    },
    [endRecordingMode, onHotkeyChange]
  );

  const startRecording = useCallback(async () => {
    setError(null);
    if (window.starcraftDS?.beginHotkeyRecording) {
      await window.starcraftDS.beginHotkeyRecording();
    }
    setRecording(true);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        void endRecordingMode();
        return;
      }
      const accelerator = keyboardEventToAccelerator(event);
      if (!accelerator) return;
      void persistHotkey(accelerator).then((ok) => {
        if (ok) setManualOpen(false);
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, persistHotkey, endRecordingMode]);

  const resetHotkey = () => {
    void persistHotkey(DEFAULT_CAPTURE_HOTKEY);
  };

  const applyManual = () => {
    void persistHotkey(manualValue).then((ok) => {
      if (ok) setManualOpen(false);
    });
  };

  return (
    <div
      className={`capture-hotkey-settings capture-hotkey-interactive${
        compact ? " capture-hotkey-compact" : ""
      }`}
    >
      <div className="capture-hotkey-row">
        <span className="capture-hotkey-label">Screen capture hotkey</span>
        <kbd className="capture-hotkey-current">{formatHotkeyLabel(hotkey)}</kbd>
        <button
          type="button"
          className={`btn btn-sm${recording ? " recording" : ""}`}
          onClick={() => {
            void startRecording();
          }}
          disabled={scanning || saving}
        >
          {recording ? "Press shortcut…" : "Change"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={resetHotkey}
          disabled={scanning || saving || hotkey === DEFAULT_CAPTURE_HOTKEY}
          title="Reset to default"
        >
          Reset
        </button>
      </div>

      {recording ? (
        <p className="capture-hotkey-hint capture-hotkey-recording">
          Press the key combination you want (Esc to cancel). Example: Ctrl+Shift+S
        </p>
      ) : (
        <p className="capture-hotkey-hint">
          {scanning
            ? "Reading screen…"
            : `During a game, press ${formatHotkeyLabel(hotkey)} to capture the screen and detect enemy units anywhere on the map (Ollama visual AI).`}
        </p>
      )}

      <div className="capture-hotkey-manual">
        <button
          type="button"
          className="capture-hotkey-manual-toggle"
          onClick={() => setManualOpen((open) => !open)}
          disabled={scanning || saving || recording}
        >
          {manualOpen ? "Hide manual entry" : "Type shortcut manually"}
        </button>
        {manualOpen ? (
          <div className="capture-hotkey-manual-row">
            <input
              type="text"
              className="capture-hotkey-input"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="Ctrl+Shift+S"
              disabled={scanning || saving || recording}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyManual();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={applyManual}
              disabled={scanning || saving || recording || !manualValue.trim()}
            >
              Apply
            </button>
          </div>
        ) : null}
      </div>

      {!compact && lastCaptureAt ? (
        <p className="capture-hotkey-status">
          Last capture {new Date(lastCaptureAt).toLocaleTimeString()}
          {lastCaptureSummary ? ` — ${lastCaptureSummary}` : ""}
        </p>
      ) : null}
      {error ? <p className="capture-hotkey-error">{error}</p> : null}
    </div>
  );
}
