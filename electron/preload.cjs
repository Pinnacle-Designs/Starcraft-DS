const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("starcraftDS", {
  isElectron: true,
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
});
