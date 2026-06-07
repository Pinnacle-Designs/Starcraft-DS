const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  shell,
} = require("electron");
const fs = require("fs");
const path = require("path");

const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
const isDev = !app.isPackaged;

const OVERLAY_PANELS = {
  enemy: {
    width: 380,
    height: 520,
    defaultX: 24,
    defaultY: 24,
    panel: "enemy",
    title: "Enemy waves",
  },
  team: {
    width: 380,
    height: 440,
    defaultX: 408,
    defaultY: 24,
    panel: "team",
    title: "Team selection",
  },
};

let mainWindow = null;
const overlayWindows = { enemy: null, team: null };

function positionsFile() {
  return path.join(app.getPath("userData"), "overlay-panel-positions.json");
}

function loadOverlayPositions() {
  try {
    return JSON.parse(fs.readFileSync(positionsFile(), "utf8"));
  } catch {
    return {};
  }
}

function saveOverlayPosition(panel, x, y) {
  const all = loadOverlayPositions();
  all[panel] = { x, y };
  try {
    fs.writeFileSync(positionsFile(), JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function clampOverlayBounds(x, y, width, height) {
  const area = screen.getPrimaryDisplay().workArea;
  const maxX = Math.max(area.x, area.x + area.width - width);
  const maxY = Math.max(area.y, area.y + area.height - height);
  return {
    x: Math.min(Math.max(x, area.x), maxX),
    y: Math.min(Math.max(y, area.y), maxY),
  };
}

function panelLoadUrl(config) {
  const query = `panel=${config.panel}`;
  if (isDev) return `${DEV_URL}?${query}`;
  const indexPath = path.join(__dirname, "../client/dist/index.html");
  return `file://${indexPath}?${query}`;
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
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../client/dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    for (const panel of Object.keys(overlayWindows)) {
      const win = overlayWindows[panel];
      if (win && !win.isDestroyed()) win.close();
      overlayWindows[panel] = null;
    }
  });
}

function createOverlayPanelWindow(panel) {
  const config = OVERLAY_PANELS[panel];
  if (!config) return null;

  const existing = overlayWindows[panel];
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const saved = loadOverlayPositions()[panel];
  const rawX = saved?.x ?? config.defaultX;
  const rawY = saved?.y ?? config.defaultY;
  const { x, y } = clampOverlayBounds(
    rawX,
    rawY,
    config.width,
    config.height
  );

  const win = new BrowserWindow({
    x,
    y,
    width: config.width,
    height: config.height,
    minWidth: 300,
    minHeight: 200,
    title: config.title,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });

  void win.loadURL(panelLoadUrl(config));

  win.on("moved", () => {
    if (win.isDestroyed()) return;
    const [px, py] = win.getPosition();
    saveOverlayPosition(panel, px, py);
    const storageKey =
      panel === "enemy" ? "enemy-waves" : "team-selection";
    win.webContents
      .executeJavaScript(
        `try { localStorage.setItem('starcraft-ds-overlay-pos-${storageKey}', JSON.stringify({x:${px},y:${py}})); } catch(e) {}`
      )
      .catch(() => {});
  });

  win.on("closed", () => {
    overlayWindows[panel] = null;
  });

  overlayWindows[panel] = win;
  return win;
}

function openAllOverlayPanels() {
  createOverlayPanelWindow("enemy");
  setTimeout(() => {
    createOverlayPanelWindow("team");
  }, 200);
}

app.whenReady().then(() => {
  createMainWindow();
  setTimeout(() => openAllOverlayPanels(), 800);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("overlay:open", () => {
  openAllOverlayPanels();
});

ipcMain.handle("overlay:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
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
