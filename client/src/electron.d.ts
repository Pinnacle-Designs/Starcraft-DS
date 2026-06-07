export interface StarcraftDSElectron {
  isElectron: true;
  openNativeOverlay: () => Promise<void>;
  closeOverlayPanel: () => Promise<void>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  setClickThrough: (enabled: boolean) => Promise<void>;
  setIgnoreMouseEvents: (ignore: boolean) => Promise<void>;
  onClickThroughHotkey: (callback: () => void) => () => void;
  onClickThroughStateChange: (callback: (enabled: boolean) => void) => () => void;
}

declare global {
  interface Window {
    starcraftDS?: StarcraftDSElectron;
  }
}

export {};
