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
import { Sc2DisplayModeHint } from "./Sc2DisplayModeHint";

interface Props {
  onHotkeyChange?: (accelerator: string) => void;
  onInteractionChange?: (active: boolean) => void;
  scanning?: boolean;
  lastCaptureAt?: number | null;
  lastCaptureSummary?: string | null;
  compact?: boolean;
}

export function CaptureHotkeySettings({
  onHotkeyChange,
  onInteractionChange,
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
  const rootRef = useRef<HTMLDivElement>(null);

  const pinMouseEvents = useCallback(() => {
    void window.starcraftDS?.setIgnoreMouseEvents?.(false);
  }, []);

  const endRecordingMode = useCallback(async () => {
    setRecording(false);
    if (window.starcraftDS?.endHotkeyRecording) {
      await window.starcraftDS.endHotkeyRecording();
    }
  }, []);

  const syncHotkeyFromElectron = useCallback(async () => {
    const api = window.starcraftDS;
    if (!api?.getCaptureHotkey) return;
    const accel = await api.getCaptureHotkey();
    const status = api.getCaptureHotkeyStatus
      ? await api.getCaptureHotkeyStatus()
      : null;
    const active = normalizeAccelerator(
      status?.active?.trim() || accel || DEFAULT_CAPTURE_HOTKEY
    );
    setHotkey(active);
    saveCaptureHotkey(active);
    setManualValue(formatHotkeyLabel(active));
    if (!status) {
      setError(null);
      return;
    }
    if (!status.registered) {
      setError(
        `${formatHotkeyLabel(status.saved)} is not available on this PC. Choose another shortcut.`
      );
      return;
    }
    if (status.active !== status.saved) {
      setError(
        `${formatHotkeyLabel(status.saved)} is in use by another app. Using ${formatHotkeyLabel(status.active)} instead.`
      );
      return;
    }
    setError(null);
  }, []);

  useEffect(() => {
    void syncHotkeyFromElectron();
  }, [syncHotkeyFromElectron]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    const api = window.starcraftDS;
    if (!api?.onHotkeyRecordingCancelled) return;
    return api.onHotkeyRecordingCancelled(() => {
      setRecording(false);
      setSaving(false);
      setError(null);
    });
  }, []);

  useEffect(() => {
    const api = window.starcraftDS;
    if (!api?.onHotkeyRecorded) return;

    const offRecorded = api.onHotkeyRecorded((payload) => {
      const saved = normalizeAccelerator(payload.accelerator);
      setRecording(false);
      setSaving(false);
      setError(null);
      saveCaptureHotkey(saved);
      setHotkey(saved);
      setManualValue(formatHotkeyLabel(saved));
      onHotkeyChange?.(saved);
      setManualOpen(false);
      void syncHotkeyFromElectron();
    });

    const offFailed = api.onHotkeyRecordFailed?.((payload) => {
      setRecording(false);
      setSaving(false);
      setError(payload.error ?? "Hotkey could not be registered.");
    });

    return () => {
      offRecorded();
      offFailed?.();
    };
  }, [onHotkeyChange, syncHotkeyFromElectron]);

  useEffect(() => {
    onInteractionChange?.(recording || manualOpen);
  }, [recording, manualOpen, onInteractionChange]);

  useEffect(() => {
    if (!recording) return;
    pinMouseEvents();
  }, [recording, pinMouseEvents]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPointerEnter = () => pinMouseEvents();
    const onPointerDown = () => pinMouseEvents();
    root.addEventListener("pointerenter", onPointerEnter);
    root.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      root.removeEventListener("pointerenter", onPointerEnter);
      root.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [pinMouseEvents]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        void window.starcraftDS?.cancelHotkeyRecording?.();
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
          void syncHotkeyFromElectron();
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
    [endRecordingMode, onHotkeyChange, syncHotkeyFromElectron]
  );

  const startRecording = useCallback(async () => {
    setError(null);
    setSaving(false);
    pinMouseEvents();
    if (window.starcraftDS?.beginHotkeyRecording) {
      await window.starcraftDS.beginHotkeyRecording();
      setRecording(true);
      return;
    }
    setRecording(true);
  }, [pinMouseEvents]);

  useEffect(() => {
    if (!recording) return;
    if (window.starcraftDS?.beginHotkeyRecording) return;
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
    void persistHotkey(manualValue.replace(/\s*\+\s*/g, "+")).then((ok) => {
      if (ok) setManualOpen(false);
    });
  };

  return (
    <div
      ref={rootRef}
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
          disabled={saving || recording}
        >
          {recording ? "Press shortcut…" : "Change"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={resetHotkey}
          disabled={saving || recording || hotkey === DEFAULT_CAPTURE_HOTKEY}
          title="Reset to default"
        >
          Reset
        </button>
      </div>

      {recording ? (
        <p className="capture-hotkey-hint capture-hotkey-recording">
          Press the key combination you want here (Esc to cancel). Keep this window
          focused — example: Ctrl+Alt+C
        </p>
      ) : (
        <p className="capture-hotkey-hint">
          {scanning
            ? "Reading screen…"
            : `During a game, press ${formatHotkeyLabel(hotkey)} to capture the screen and detect enemy units anywhere on the map (Ollama visual AI).`}
        </p>
      )}

      {!recording ? (
        <Sc2DisplayModeHint
          compact={compact}
          className="capture-hotkey-hint sc2-display-hint"
        />
      ) : null}

      <div className="capture-hotkey-manual">
        <button
          type="button"
          className="capture-hotkey-manual-toggle"
          onClick={() => setManualOpen((open) => !open)}
          disabled={saving || recording}
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
              disabled={saving || recording}
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
              disabled={saving || recording || !manualValue.trim()}
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
