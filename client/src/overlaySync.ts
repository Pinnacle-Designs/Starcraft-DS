import type {
  AnalyzeResponse,
  PlayerRace,
  TeamWaves,
  TierUnlocked,
  WaveShift,
} from "./api";
import type { ManualWavesState } from "./manualArmy";
import {
  loadPanelPosition,
  OVERLAY_PANELS,
  type OverlayPanelId,
} from "./overlayStorage";

export const OVERLAY_CHANNEL = "starcraft-ds-overlay";
export const OVERLAY_STORAGE_KEY = "starcraft-ds-coach-state";
export const MAIN_SYNC_ORIGIN = "main";
export const OVERLAY_SYNC_ORIGIN = "overlay";

export interface CoachState {
  playerRace: PlayerRace;
  teamRaces?: TeamWaves;
  waveShift?: WaveShift;
  tierUnlocked?: TierUnlocked;
  manualWaves?: ManualWavesState;
  result: AnalyzeResponse | null;
  live: boolean;
  scanning?: boolean;
  lastScanAt?: number | null;
  counterRefreshing?: boolean;
  /** Prevents sync echo between main window and overlay. */
  origin?: string;
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

export function overlayPanelHref(panel: OverlayPanelId): string {
  const base = window.location.pathname || "/";
  return `${base}?panel=${panel}`;
}

function clampPopupPosition(
  pos: { x: number; y: number },
  width: number,
  height: number
): { x: number; y: number } {
  const maxX = Math.max(0, window.screen.availWidth - width);
  const maxY = Math.max(0, window.screen.availHeight - height);
  return {
    x: Math.min(Math.max(pos.x, 0), maxX),
    y: Math.min(Math.max(pos.y, 0), maxY),
  };
}

export interface OverlayOpenResult {
  enemy: boolean;
  team: boolean;
}

function overlayWindowFeatures(
  spec: (typeof OVERLAY_PANELS)[OverlayPanelId],
  pos: { x: number; y: number }
): string {
  return [
    `width=${spec.width}`,
    `height=${spec.height}`,
    `left=${pos.x}`,
    `top=${pos.y}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
}

/** Opens one overlay as a separate browser window (not confined to the parent tab). */
export function openOverlayPanel(panel: OverlayPanelId): Window | null {
  const spec = OVERLAY_PANELS[panel];
  const pos = clampPopupPosition(
    loadPanelPosition(spec.storageKey, spec.defaultPosition),
    spec.width,
    spec.height
  );
  const url = `${window.location.origin}${overlayPanelHref(panel)}`;
  const name = `starcraft-ds-overlay-${panel}`;
  const features = overlayWindowFeatures(spec, pos);

  const win = window.open(url, name, features);
  if (!win || win.closed) return null;
  try {
    win.focus();
  } catch {
    /* ignore */
  }
  return win;
}

function openOverlayPopups(): OverlayOpenResult {
  const enemy = Boolean(openOverlayPanel("enemy"));
  const team = Boolean(openOverlayPanel("team"));
  // Browsers often block a 2nd popup from one click; enemy panel spawns team on load.
  return { enemy, team: team || enemy };
}

/**
 * Electron: separate always-on-top OS windows.
 * Browser: separate popup windows that can be placed anywhere on screen.
 */
export function openOverlay(): OverlayOpenResult | void {
  if (window.starcraftDS?.isElectron) {
    void window.starcraftDS.openNativeOverlay();
    return;
  }
  return openOverlayPopups();
}

export function isElectronApp(): boolean {
  return Boolean(window.starcraftDS?.isElectron);
}
