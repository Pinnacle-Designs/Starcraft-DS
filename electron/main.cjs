const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  globalShortcut,
} = require("electron");
const path = require("path");

const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
const isDev = !app.isPackaged;

let mainWindow = null;
let overlayWindow = null;

function appUrl(hash = "") {
  if (isDev) return `${DEV_URL}${hash}`;
  const indexPath = path.join(__dirname, "../client/dist/index.html");
  return `file://${indexPath}${hash}`;
}

function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Starcraft-DS",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(appUrl());
  } else {
    mainWindow.loadFile(path.join(__dirname, "../client/dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (overlayWindow) overlayWindow.close();
  });
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    width: 400,
    height: 560,
    minWidth: 280,
    minHeight: 200,
    title: "SC2 Coach Overlay",
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  if (isDev) {
    overlayWindow.loadURL(appUrl("#/overlay"));
  } else {
    overlayWindow.loadFile(
      path.join(__dirname, "../client/dist/index.html"),
      { hash: "#/overlay" }
    );
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

function registerOverlayShortcuts() {
  globalShortcut.register("Control+Shift+D", () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("overlay:toggleClickThrough");
    }
  });
}

app.whenReady().then(() => {
  createMainWindow();
  setTimeout(() => createOverlayWindow(), 600);
  registerOverlayShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle("overlay:open", () => {
  createOverlayWindow();
});

ipcMain.handle("overlay:setAlwaysOnTop", (event, enabled) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setAlwaysOnTop(Boolean(enabled), "screen-saver");
});

ipcMain.handle("overlay:setClickThrough", (event, enabled) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (enabled) {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
});

ipcMain.on("shell:openExternal", (_e, url) => {
  void shell.openExternal(url);
});
