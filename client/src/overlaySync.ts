import type { AnalyzeResponse, PlayerRace } from "./api";

export const OVERLAY_CHANNEL = "starcraft-ds-overlay";
export const OVERLAY_STORAGE_KEY = "starcraft-ds-coach-state";

export interface CoachState {
  playerRace: PlayerRace;
  result: AnalyzeResponse | null;
  live: boolean;
  updatedAt: number;
}

export function publishCoachState(state: CoachState): void {
  const payload = JSON.stringify(state);
  try {
    localStorage.setItem(OVERLAY_STORAGE_KEY, payload);
  } catch {
    /* quota */
  }
  try {
    const ch = new BroadcastChannel(OVERLAY_CHANNEL);
    ch.postMessage(state);
    ch.close();
  } catch {
    /* unsupported */
  }
}

export function loadCoachState(): CoachState | null {
  try {
    const raw = localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CoachState;
  } catch {
    return null;
  }
}

export function subscribeCoachState(
  onState: (state: CoachState) => void
): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== OVERLAY_STORAGE_KEY || !e.newValue) return;
    try {
      onState(JSON.parse(e.newValue) as CoachState);
    } catch {
      /* ignore */
    }
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(OVERLAY_CHANNEL);
    channel.onmessage = (e) => onState(e.data as CoachState);
  } catch {
    /* ignore */
  }

  window.addEventListener("storage", onStorage);
  const poll = window.setInterval(() => {
    const s = loadCoachState();
    if (s) onState(s);
  }, 1500);

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
    clearInterval(poll);
  };
}

export function openOverlayWindow(): Window | null {
  const url = `${window.location.origin}${window.location.pathname}#/overlay`;
  return window.open(
    url,
    "starcraft-ds-overlay",
    "width=400,height=560,menubar=no,toolbar=no,location=no,status=no"
  );
}
