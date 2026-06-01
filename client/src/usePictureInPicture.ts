import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { AnalyzeResponse, PlayerRace } from "./api";

function pipSupported(): boolean {
  return "documentPictureInPicture" in window;
}

function renderPipSuggestions(
  root: HTMLElement,
  playerRace: PlayerRace,
  result: AnalyzeResponse | null,
  live: boolean
): void {
  root.innerHTML = "";
  const header = document.createElement("div");
  header.className = "pip-bar";
  header.textContent = live ? "● LIVE COACH" : "SC2 COACH";
  root.appendChild(header);

  if (!result?.suggestions?.length) {
    const hint = document.createElement("p");
    hint.className = "pip-hint";
    hint.textContent = live ? "Analyzing…" : "Run Analyze or Live coach";
    root.appendChild(hint);
    return;
  }

  for (const s of result.suggestions.slice(0, 5)) {
    const card = document.createElement("div");
    card.className = "pip-card";
    card.innerHTML = `<strong>vs ${s.enemyUnit}</strong><span>${playerRace}: ${s.build.join(", ")}</span>`;
    root.appendChild(card);
  }
}

export function usePictureInPicture(
  videoRef: RefObject<HTMLVideoElement | null>,
  playerRace: PlayerRace,
  result: AnalyzeResponse | null,
  live: boolean
) {
  const [pipActive, setPipActive] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);

  const closePip = useCallback(() => {
    pipWindowRef.current?.close();
    pipWindowRef.current = null;
    suggestionsRef.current = null;
    setPipActive(false);
  }, []);

  const openPip = useCallback(async () => {
    const video = videoRef.current;
    if (!video?.srcObject) {
      throw new Error("Start screen capture before opening Picture-in-Picture.");
    }
    if (!pipSupported()) {
      throw new Error(
        "Picture-in-Picture is not supported in this browser. Try Chrome or Edge."
      );
    }

    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.focus();
      return;
    }

    const pipWindow = await window.documentPictureInPicture!.requestWindow({
      width: Math.min(520, Math.max(320, video.videoWidth || 480)),
      height: Math.min(400, Math.max(240, (video.videoHeight || 270) + 120)),
    });

    pipWindowRef.current = pipWindow;

    const style = pipWindow.document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; margin: 0; }
      body {
        font-family: "Segoe UI", system-ui, sans-serif;
        background: #0a0e14;
        color: #e8eef5;
        overflow: hidden;
      }
      .pip-root { display: flex; flex-direction: column; height: 100vh; }
      .pip-video-wrap { flex: 1; min-height: 0; background: #000; }
      video { width: 100%; height: 100%; object-fit: contain; display: block; }
      .pip-suggestions {
        max-height: 42%;
        overflow-y: auto;
        padding: 6px 8px;
        border-top: 2px solid #00e676;
        background: rgba(10, 14, 20, 0.95);
      }
      .pip-bar {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #00e676;
        margin-bottom: 4px;
      }
      .pip-hint { font-size: 11px; color: #8ba3bf; }
      .pip-card {
        font-size: 11px;
        padding: 4px 0;
        border-bottom: 1px solid #2a3f5c;
      }
      .pip-card strong { display: block; color: #ffd54f; }
      .pip-card span { color: #00e676; }
    `;
    pipWindow.document.head.appendChild(style);

    const root = pipWindow.document.createElement("div");
    root.className = "pip-root";

    const videoWrap = pipWindow.document.createElement("div");
    videoWrap.className = "pip-video-wrap";
    const pipVideo = pipWindow.document.createElement("video");
    pipVideo.srcObject = video.srcObject;
    pipVideo.muted = true;
    void pipVideo.play();
    videoWrap.appendChild(pipVideo);

    const suggestions = pipWindow.document.createElement("div");
    suggestions.className = "pip-suggestions";
    suggestionsRef.current = suggestions;
    renderPipSuggestions(suggestions, playerRace, result, live);

    root.appendChild(videoWrap);
    root.appendChild(suggestions);
    pipWindow.document.body.appendChild(root);

    pipWindow.addEventListener("pagehide", () => {
      pipWindowRef.current = null;
      suggestionsRef.current = null;
      setPipActive(false);
    });

    setPipActive(true);
  }, [videoRef, playerRace, result, live]);

  useEffect(() => {
    if (suggestionsRef.current) {
      renderPipSuggestions(
        suggestionsRef.current,
        playerRace,
        result,
        live
      );
    }
  }, [playerRace, result, live]);

  useEffect(() => () => closePip(), [closePip]);

  return {
    pipSupported: pipSupported(),
    pipActive,
    openPip,
    closePip,
  };
}
