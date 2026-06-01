export interface StarcraftDSElectron {
  isElectron: true;
  openNativeOverlay: () => Promise<void>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  setClickThrough: (enabled: boolean) => Promise<void>;
  onClickThroughHotkey: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    starcraftDS?: StarcraftDSElectron;
  }
}

export {};
