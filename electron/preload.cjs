const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("starcraftDS", {
  isElectron: true,
  openNativeOverlay: () => ipcRenderer.invoke("overlay:open"),
  setAlwaysOnTop: (enabled) =>
    ipcRenderer.invoke("overlay:setAlwaysOnTop", enabled),
  setClickThrough: (enabled) =>
    ipcRenderer.invoke("overlay:setClickThrough", enabled),
  onClickThroughHotkey: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("overlay:toggleClickThrough", handler);
    return () => ipcRenderer.removeListener("overlay:toggleClickThrough", handler);
  },
});
