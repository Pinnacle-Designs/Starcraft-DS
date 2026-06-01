import { useEffect, useState } from "react";
import type { AnalyzeResponse, PlayerRace } from "./api";
import { SuggestionsPanel } from "./SuggestionsPanel";
import {
  isElectronApp,
  loadCoachState,
  subscribeCoachState,
  type CoachState,
} from "./overlaySync";

export default function Overlay() {
  const [state, setState] = useState<CoachState | null>(() => loadCoachState());
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [clickThrough, setClickThrough] = useState(false);
  const electron = isElectronApp();

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    if (electron) document.body.classList.add("overlay-electron");
    return () => {
      document.body.classList.remove("overlay-mode", "overlay-electron");
    };
  }, [electron]);

  useEffect(() => subscribeCoachState(setState), []);

  useEffect(() => {
    if (!window.starcraftDS?.onClickThroughHotkey) return;
    return window.starcraftDS.onClickThroughHotkey(() => {
      setClickThrough((v) => !v);
    });
  }, []);

  useEffect(() => {
    if (!electron || !window.starcraftDS) return;
    void window.starcraftDS.setAlwaysOnTop(alwaysOnTop);
  }, [alwaysOnTop, electron]);

  useEffect(() => {
    if (!electron || !window.starcraftDS) return;
    void window.starcraftDS.setClickThrough(clickThrough);
  }, [clickThrough, electron]);

  const playerRace: PlayerRace = state?.playerRace ?? "Terran";
  const result: AnalyzeResponse | null = state?.result ?? null;
  const live = state?.live ?? false;

  return (
    <div className="overlay-app">
      <header className="overlay-header overlay-drag">
        <span className="logo">SC2 COACH</span>
        {live && <span className="live-dot">● LIVE</span>}
      </header>

      <div className={clickThrough ? "overlay-content passthrough" : "overlay-content"}>
        <SuggestionsPanel playerRace={playerRace} result={result} compact />
      </div>

      {electron && (
        <div className="overlay-controls">
          <label className="overlay-toggle">
            <input
              type="checkbox"
              checked={alwaysOnTop}
              onChange={(e) => setAlwaysOnTop(e.target.checked)}
            />
            Always on top
          </label>
          <label className="overlay-toggle">
            <input
              type="checkbox"
              checked={clickThrough}
              onChange={(e) => setClickThrough(e.target.checked)}
            />
            Click-through (game receives clicks)
          </label>
        </div>
      )}

      <footer className="overlay-footer">
        {electron
          ? "Drag header to move. Click-through: Ctrl+Shift+D to toggle when enabled."
          : "Drag over your game. Use Electron for true always-on-top."}
      </footer>
    </div>
  );
}
