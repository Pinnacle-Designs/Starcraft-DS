const { contextBridge, ipcRenderer } = require("electron");

const hotkeyRecorderApi = {
  submit: (accelerator) =>
    ipcRenderer.invoke("overlay:submitRecordedHotkey", accelerator),
  cancel: () => ipcRenderer.invoke("overlay:cancelHotkeyRecording"),
};

contextBridge.exposeInMainWorld("hotkeyRecorder", hotkeyRecorderApi);

contextBridge.exposeInMainWorld("starcraftDS", {
  isElectron: true,
  apiBase: "http://127.0.0.1:3847",
  openNativeOverlay: () => ipcRenderer.invoke("overlay:open"),
  broadcastCoachState: (state) => ipcRenderer.invoke("coach:publish", state),
  onCoachState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("coach:state", handler);
    return () => ipcRenderer.removeListener("coach:state", handler);
  },
  closeOverlayPanel: () => ipcRenderer.invoke("overlay:close"),
  setAlwaysOnTop: (enabled) =>
    ipcRenderer.invoke("overlay:setAlwaysOnTop", enabled),
  setClickThrough: (enabled) =>
    ipcRenderer.invoke("overlay:setClickThrough", enabled),
  setIgnoreMouseEvents: (ignore) =>
    ipcRenderer.invoke("overlay:setIgnoreMouseEvents", ignore),
  moveOverlayWindow: (dx, dy) =>
    ipcRenderer.invoke("overlay:moveBy", dx, dy),
  onClickThroughHotkey: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("overlay:toggleClickThrough", handler);
    return () => ipcRenderer.removeListener("overlay:toggleClickThrough", handler);
  },
  onClickThroughStateChange: (callback) => {
    const handler = (_event, enabled) => callback(Boolean(enabled));
    ipcRenderer.on("overlay:clickThroughState", handler);
    return () =>
      ipcRenderer.removeListener("overlay:clickThroughState", handler);
  },
  getCaptureHotkey: () => ipcRenderer.invoke("overlay:getCaptureHotkey"),
  getCaptureHotkeyStatus: () =>
    ipcRenderer.invoke("overlay:getCaptureHotkeyStatus"),
  setCaptureHotkey: (accelerator) =>
    ipcRenderer.invoke("overlay:setCaptureHotkey", accelerator),
  beginHotkeyRecording: () =>
    ipcRenderer.invoke("overlay:beginHotkeyRecording"),
  endHotkeyRecording: () => ipcRenderer.invoke("overlay:endHotkeyRecording"),
  cancelHotkeyRecording: () =>
    ipcRenderer.invoke("overlay:cancelHotkeyRecording"),
  onHotkeyRecordingCancelled: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("overlay:hotkeyRecordingCancelled", handler);
    return () =>
      ipcRenderer.removeListener("overlay:hotkeyRecordingCancelled", handler);
  },
  onHotkeyRecorded: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("overlay:hotkeyRecorded", handler);
    return () => ipcRenderer.removeListener("overlay:hotkeyRecorded", handler);
  },
  onHotkeyRecordFailed: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("overlay:hotkeyRecordFailed", handler);
    return () =>
      ipcRenderer.removeListener("overlay:hotkeyRecordFailed", handler);
  },
  onCaptureHotkey: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("overlay:captureScreen", handler);
    return () =>
      ipcRenderer.removeListener("overlay:captureScreen", handler);
  },
  requestScreenCaptureAccess: () =>
    ipcRenderer.invoke("screenCapture:requestAccess"),
  captureScreenNow: () => ipcRenderer.invoke("screenCapture:captureNow"),
  getScreenCaptureStatus: () => ipcRenderer.invoke("screenCapture:getStatus"),
  getAppUpdateStatus: () => ipcRenderer.invoke("updates:getStatus"),
  checkForAppUpdate: () => ipcRenderer.invoke("updates:check"),
  downloadAppUpdate: () => ipcRenderer.invoke("updates:download"),
  applyAppUpdate: () => ipcRenderer.invoke("updates:apply"),
  installAppUpdate: () => ipcRenderer.invoke("updates:install"),
  onAppUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("updates:status", handler);
    return () => ipcRenderer.removeListener("updates:status", handler);
  },
  hotkeyRecorder: hotkeyRecorderApi,
});
