const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("starcraftDS", {
  isElectron: true,
  openNativeOverlay: () => ipcRenderer.invoke("overlay:open"),
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
});
