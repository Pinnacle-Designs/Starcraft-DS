const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
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
    width: 300,
    height: 820,
    defaultX: 24,
    defaultY: 24,
    panel: "enemy",
    title: "Enemy waves",
  },
  team: {
    width: 300,
    height: 920,
    defaultX: 336,
    defaultY: 24,
    panel: "team",
    title: "Team selection",
  },
};

let mainWindow = null;
const overlayWindows = { enemy: null, team: null };
let overlayClickThrough = false;
const DEFAULT_CAPTURE_HOTKEY = "Alt+Shift+C";
const CAPTURE_HOTKEY_FALLBACKS = [
  "Alt+Shift+C",
  "Control+Shift+S",
  "Control+Alt+C",
  "F10",
];
let captureHotkeyAccelerator = DEFAULT_CAPTURE_HOTKEY;
let hotkeyRecording = false;

const OVERLAY_TOP_LEVEL =
  process.platform === "darwin" ? "floating" : "screen-saver";

function pinOverlayAlwaysOnTop(win) {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, OVERLAY_TOP_LEVEL);
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
}

function showOverlayWindow(win) {
  if (!win || win.isDestroyed()) return;
  pinOverlayAlwaysOnTop(win);
  if (typeof win.showInactive === "function") {
    win.showInactive();
  } else {
    win.show();
  }
}

/** Re-pin overlays that are already visible (blur/focus). Does not show hidden windows. */
function bringOverlayForward(win) {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  pinOverlayAlwaysOnTop(win);
  if (typeof win.showInactive === "function") {
    win.showInactive();
  } else {
    win.show();
  }
}

function repinAllOverlayWindows() {
  for (const panel of Object.keys(overlayWindows)) {
    bringOverlayForward(overlayWindows[panel]);
  }
}

function attachOverlayPinHandlers(win) {
  if (!win || win.isDestroyed()) return;
  win.on("show", () => pinOverlayAlwaysOnTop(win));
}

function clearOverlayMouseIgnore(win) {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(false);
}

function broadcastOverlayClickThrough() {
  for (const panel of Object.keys(overlayWindows)) {
    const win = overlayWindows[panel];
    if (!win || win.isDestroyed()) continue;
    if (!overlayClickThrough) {
      clearOverlayMouseIgnore(win);
    }
    win.webContents.send("overlay:clickThroughState", overlayClickThrough);
  }
}

function applyOverlayClickThrough(enabled) {
  overlayClickThrough = Boolean(enabled);
  broadcastOverlayClickThrough();
}

function syncOverlayClickThrough(win) {
  if (!win || win.isDestroyed()) return;
  if (!overlayClickThrough) {
    clearOverlayMouseIgnore(win);
  }
  win.webContents.send("overlay:clickThroughState", overlayClickThrough);
}

function captureHotkeyFile() {
  return path.join(app.getPath("userData"), "capture-hotkey.json");
}

function loadCaptureHotkey() {
  try {
    const data = JSON.parse(fs.readFileSync(captureHotkeyFile(), "utf8"));
    if (typeof data.accelerator === "string" && data.accelerator.trim()) {
      return data.accelerator.trim();
    }
  } catch {
    /* first run */
  }
  return DEFAULT_CAPTURE_HOTKEY;
}

function saveCaptureHotkey(accelerator) {
  try {
    fs.writeFileSync(
      captureHotkeyFile(),
      JSON.stringify({ accelerator }, null, 2),
      "utf8"
    );
  } catch {
    /* ignore */
  }
}

async function capturePrimaryScreenBase64() {
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const width = Math.max(1, Math.floor(display.size.width * scale));
  const height = Math.max(1, Math.floor(display.size.height * scale));
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
  });
  if (!sources.length) {
    throw new Error("No screen sources available");
  }
  const source =
    sources.find((entry) => entry.display_id === String(display.id)) ||
    sources[0];
  return source.thumbnail.toJPEG(72).toString("base64");
}

function broadcastCaptureScreen(base64) {
  const payload = { base64, at: Date.now() };
  const enemyWin = overlayWindows.enemy;
  if (enemyWin && !enemyWin.isDestroyed()) {
    enemyWin.webContents.send("overlay:captureScreen", payload);
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("overlay:captureScreen", payload);
  }
}

async function triggerScreenCapture() {
  try {
    const base64 = await capturePrimaryScreenBase64();
    broadcastCaptureScreen(base64);
  } catch (err) {
    console.error("Screen capture failed:", err);
  }
}

function normalizeCaptureHotkey(input) {
  if (typeof input !== "string" || !input.trim()) {
    return DEFAULT_CAPTURE_HOTKEY;
  }
  return input
    .trim()
    .replace(/\s*\+\s*/g, "+")
    .split("+")
    .map((part) => {
      const token = part.trim();
      if (!token) return "";
      const lower = token.toLowerCase();
      if (lower === "ctrl" || lower === "control") return "Control";
      if (lower === "cmd" || lower === "command") return "Command";
      if (lower === "alt" || lower === "option") return "Alt";
      if (lower === "shift") return "Shift";
      if (/^f\d{1,2}$/i.test(token)) return token.toUpperCase();
      if (token.length === 1) return token.toUpperCase();
      return token;
    })
    .filter(Boolean)
    .join("+");
}

function registerCaptureHotkey(accelerator) {
  if (globalShortcut.isRegistered(accelerator)) {
    globalShortcut.unregister(accelerator);
  }
  return globalShortcut.register(accelerator, () => {
    void triggerScreenCapture();
  });
}

function registerOverlayHotkeys() {
  globalShortcut.unregisterAll();
  if (hotkeyRecording) return;

  globalShortcut.register("Control+Shift+D", () => {
    applyOverlayClickThrough(!overlayClickThrough);
  });

  const saved = normalizeCaptureHotkey(loadCaptureHotkey());
  const candidates = [
    saved,
    ...CAPTURE_HOTKEY_FALLBACKS.filter((accel) => accel !== saved),
  ];
  let registered = false;
  for (const candidate of candidates) {
    if (registerCaptureHotkey(candidate)) {
      captureHotkeyAccelerator = candidate;
      registered = true;
      if (candidate !== saved) {
        console.warn(
          `Capture hotkey "${saved}" unavailable; using "${candidate}" instead.`
        );
      }
      break;
    }
  }
  if (!registered) {
    captureHotkeyAccelerator = saved;
    console.warn("Capture hotkey registration failed for all candidates.");
  }
}

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

  mainWindow.on("focus", () => {
    repinAllOverlayWindows();
  });

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
    showOverlayWindow(existing);
    syncOverlayClickThrough(existing);
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
    minWidth: 260,
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
    ...(process.platform === "win32" ? { type: "toolbar" } : {}),
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pinOverlayAlwaysOnTop(win);
  attachOverlayPinHandlers(win);

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) showOverlayWindow(win);
  });

  const url = panelLoadUrl(config);
  void win.loadURL(url).catch((err) => {
    console.error(`Overlay panel "${panel}" failed to load ${url}:`, err);
  });

  win.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(
      `Overlay panel "${panel}" did-fail-load (${code}): ${description}`
    );
  });

  win.webContents.on("did-finish-load", () => {
    syncOverlayClickThrough(win);
    if (!win.isDestroyed() && !win.isVisible()) {
      showOverlayWindow(win);
    }
  });

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
  const enemy = createOverlayPanelWindow("enemy");
  const team = createOverlayPanelWindow("team");
  repinAllOverlayWindows();
  return {
    enemy: Boolean(enemy && !enemy.isDestroyed()),
    team: Boolean(team && !team.isDestroyed()),
  };
}

function broadcastCoachState(state) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("coach:state", state);
    }
  }
}

app.whenReady().then(() => {
  createMainWindow();
  setTimeout(() => openAllOverlayPanels(), 800);
  registerOverlayHotkeys();

  app.on("browser-window-blur", () => {
    setTimeout(repinAllOverlayWindows, 50);
  });

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

ipcMain.handle("overlay:open", () => openAllOverlayPanels());

ipcMain.handle("coach:publish", (_event, state) => {
  broadcastCoachState(state);
  return { ok: true };
});

ipcMain.handle("overlay:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle("overlay:setAlwaysOnTop", (event, enabled) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (enabled) {
    pinOverlayAlwaysOnTop(win);
  } else {
    win.setAlwaysOnTop(false);
  }
});

ipcMain.handle("overlay:setClickThrough", (_event, enabled) => {
  applyOverlayClickThrough(enabled);
});

ipcMain.handle("overlay:setIgnoreMouseEvents", (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (ignore) {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
});

ipcMain.handle("overlay:getCaptureHotkey", () => loadCaptureHotkey());

ipcMain.handle("overlay:getCaptureHotkeyStatus", () => ({
  saved: loadCaptureHotkey(),
  active: captureHotkeyAccelerator,
  registered: globalShortcut.isRegistered(captureHotkeyAccelerator),
}));

ipcMain.handle("overlay:beginHotkeyRecording", (event) => {
  hotkeyRecording = true;
  globalShortcut.unregisterAll();
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.focus();
    win.webContents.focus();
  }
  return { ok: true };
});

ipcMain.handle("overlay:endHotkeyRecording", () => {
  hotkeyRecording = false;
  registerOverlayHotkeys();
  return { ok: true };
});

ipcMain.handle("overlay:setCaptureHotkey", (_event, accelerator) => {
  const previous = loadCaptureHotkey();
  const next = normalizeCaptureHotkey(accelerator);
  const parts = next.split("+");
  const hasModifier = parts.some((part) =>
    ["Control", "Command", "CommandOrControl", "Alt", "Shift"].includes(part)
  );
  if (!hasModifier || parts.length < 2) {
    hotkeyRecording = false;
    registerOverlayHotkeys();
    return {
      ok: false,
      error: "Use at least one modifier (Ctrl, Alt, Shift) plus a key.",
    };
  }
  if (next === "Control+Shift+D") {
    hotkeyRecording = false;
    registerOverlayHotkeys();
    return {
      ok: false,
      error: "Ctrl+Shift+D is reserved for click-through toggle.",
    };
  }

  saveCaptureHotkey(next);
  hotkeyRecording = false;
  globalShortcut.unregisterAll();
  globalShortcut.register("Control+Shift+D", () => {
    applyOverlayClickThrough(!overlayClickThrough);
  });
  captureHotkeyAccelerator = next;
  const captureRegistered = registerCaptureHotkey(next);
  if (!captureRegistered) {
    saveCaptureHotkey(previous);
    captureHotkeyAccelerator = previous;
    registerOverlayHotkeys();
    return {
      ok: false,
      error: `Could not register "${next}". Try a different combination.`,
    };
  }
  return { ok: true, accelerator: next };
});

ipcMain.on("shell:openExternal", (_e, url) => {
  void shell.openExternal(url);
});
