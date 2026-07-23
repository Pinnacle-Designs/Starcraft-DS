export interface CaptureHotkeyPayload {
  base64: string;
  at: number;
  error?: string;
}

export interface ScreenCaptureAccessResult {
  ok: boolean;
  granted?: boolean;
  error?: string;
}

export interface ScreenCaptureNowResult {
  ok: boolean;
  base64?: string;
  at?: number;
  error?: string;
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

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface AppUpdateStatusPayload {
  phase: AppUpdatePhase;
  currentVersion?: string;
  version?: string;
  percent?: number;
  releaseNotes?: string;
  error?: string;
}

export interface StarcraftDSElectron {
  isElectron: true;
  apiBase?: string;
  openNativeOverlay: () => Promise<OverlayOpenResult>;
  broadcastCoachState: (state: unknown) => Promise<{ ok: boolean }>;
  onCoachState: (callback: (state: unknown) => void) => () => void;
  closeOverlayPanel: () => Promise<void>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  setClickThrough: (enabled: boolean) => Promise<void>;
  setIgnoreMouseEvents: (ignore: boolean) => Promise<void>;
  moveOverlayWindow: (dx: number, dy: number) => Promise<void>;
  beginOverlayDrag: () => Promise<void>;
  endOverlayDrag: () => Promise<void>;
  prepareOverlayInteraction: () => Promise<void>;
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
  cancelHotkeyRecording: () => Promise<{ ok: boolean }>;
  onHotkeyRecordingCancelled: (callback: () => void) => () => void;
  onHotkeyRecorded: (callback: (payload: { accelerator: string }) => void) => () => void;
  onHotkeyRecordFailed: (callback: (payload: { error: string }) => void) => () => void;
  onCaptureHotkey: (callback: (payload: CaptureHotkeyPayload) => void) => () => void;
  requestScreenCaptureAccess: () => Promise<ScreenCaptureAccessResult>;
  captureScreenNow: () => Promise<ScreenCaptureNowResult>;
  getScreenCaptureStatus: () => Promise<{ granted: boolean }>;
  getAppUpdateStatus: () => Promise<AppUpdateStatusPayload>;
  checkForAppUpdate: () => Promise<AppUpdateStatusPayload>;
  downloadAppUpdate: () => Promise<AppUpdateStatusPayload>;
  applyAppUpdate: () => Promise<AppUpdateStatusPayload>;
  installAppUpdate: () => Promise<{ ok: boolean }>;
  onAppUpdateStatus: (
    callback: (status: AppUpdateStatusPayload) => void
  ) => () => void;
}

export interface HotkeyRecorderApi {
  submit: (accelerator: string) => Promise<SetCaptureHotkeyResult>;
  cancel: () => Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    starcraftDS?: StarcraftDSElectron & { hotkeyRecorder?: HotkeyRecorderApi };
    hotkeyRecorder?: HotkeyRecorderApi;
  }
}

export {};
