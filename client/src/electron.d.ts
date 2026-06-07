export interface CaptureHotkeyPayload {
  base64: string;
  at: number;
}

export interface SetCaptureHotkeyResult {
  ok: boolean;
  accelerator?: string;
  error?: string;
}

export interface OverlayOpenResult {
  enemy: boolean;
  team: boolean;
}

export interface StarcraftDSElectron {
  isElectron: true;
  openNativeOverlay: () => Promise<OverlayOpenResult>;
  broadcastCoachState: (state: unknown) => Promise<{ ok: boolean }>;
  onCoachState: (callback: (state: unknown) => void) => () => void;
  closeOverlayPanel: () => Promise<void>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  setClickThrough: (enabled: boolean) => Promise<void>;
  setIgnoreMouseEvents: (ignore: boolean) => Promise<void>;
  onClickThroughHotkey: (callback: () => void) => () => void;
  onClickThroughStateChange: (callback: (enabled: boolean) => void) => () => void;
  getCaptureHotkey: () => Promise<string>;
  getCaptureHotkeyStatus: () => Promise<{
    saved: string;
    active: string;
    registered: boolean;
  }>;
  setCaptureHotkey: (accelerator: string) => Promise<SetCaptureHotkeyResult>;
  beginHotkeyRecording: () => Promise<{ ok: boolean }>;
  endHotkeyRecording: () => Promise<{ ok: boolean }>;
  onCaptureHotkey: (callback: (payload: CaptureHotkeyPayload) => void) => () => void;
}

declare global {
  interface Window {
    starcraftDS?: StarcraftDSElectron;
  }
}

export {};
