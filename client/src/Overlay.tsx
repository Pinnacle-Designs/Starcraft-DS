import { useEffect, useState } from "react";
import type { AnalyzeResponse, PlayerRace } from "./api";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { loadCoachState, subscribeCoachState, type CoachState } from "./overlaySync";

export default function Overlay() {
  const [state, setState] = useState<CoachState | null>(() => loadCoachState());

  useEffect(() => {
    document.body.classList.add("overlay-mode");
    return () => document.body.classList.remove("overlay-mode");
  }, []);

  useEffect(() => subscribeCoachState(setState), []);

  const playerRace: PlayerRace = state?.playerRace ?? "Terran";
  const result: AnalyzeResponse | null = state?.result ?? null;
  const live = state?.live ?? false;

  return (
    <div className="overlay-app">
      <header className="overlay-header">
        <span className="logo">SC2 COACH</span>
        {live && <span className="live-dot">● LIVE</span>}
      </header>
      <SuggestionsPanel playerRace={playerRace} result={result} compact />
      <footer className="overlay-footer">
        Drag this window over your game. Pin “always on top” with your OS if
        supported.
      </footer>
    </div>
  );
}
