const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  shell,
  systemPreferences,
} = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { initAutoUpdater } = require("./updater.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
const API_PORT = process.env.PORT || "3847";
const API_HEALTH_URL = `http://127.0.0.1:${API_PORT}/api/health`;
const PACKAGED_UI_URL = `http://127.0.0.1:${API_PORT}/`;
const isDev = !app.isPackaged;
let apiServerProcess = null;

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
let captureAccessWindow = null;
let screenCaptureAccessGranted = false;
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
let hotkeyRecordingBlurHandler = null;
let hotkeyRecordingInputHandlers = null;
let hotkeyRecorderWindow = null;
let clickThroughBeforeRecording = false;
const HOTKEY_RECORDING_TIMEOUT_MS = 60_000;
let hotkeyRecordingTimeout = null;

const MODIFIER_ONLY_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "OS",
  "Command",
  "CapsLock",
  "Tab",
  "NumLock",
  "ScrollLock",
]);

const CLICK_THROUGH_HOTKEY = "Control+Shift+D";

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
  if (process.platform === "win32") {
    win.show();
  } else if (typeof win.showInactive === "function") {
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

function ensureCaptureAccessWindow() {
  if (captureAccessWindow && !captureAccessWindow.isDestroyed()) {
    return captureAccessWindow;
  }

  captureAccessWindow = new BrowserWindow({
    width: 1,
    height: 1,
    x: -20000,
    y: -20000,
    frame: false,
    show: false,
    transparent: true,
    opacity: 0,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    thickFrame: false,
    resizable: false,
    movable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  captureAccessWindow.setIgnoreMouseEvents(true, { forward: true });
  void captureAccessWindow.loadURL("data:text/html,<html></html>");
  return captureAccessWindow;
}

function screenCapturePermissionHint() {
  if (process.platform === "darwin") {
    return "Allow screen recording for Starcraft Coach in System Settings → Privacy & Security → Screen Recording, then try again.";
  }
  if (process.platform === "win32") {
    return "Windows blocked screen capture. Close other screen recorders and try again.";
  }
  return "Screen capture permission denied.";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Hide every coach window so desktopCapturer grabs only the game. */
async function withCaptureUiHidden(captureFn) {
  const restore = [];

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed() || win === captureAccessWindow) continue;
    if (!win.isVisible()) continue;
    restore.push({
      win,
      opacity: typeof win.getOpacity === "function" ? win.getOpacity() : 1,
    });
    if (typeof win.setOpacity === "function") win.setOpacity(0);
    win.hide();
  }

  if (restore.length > 0) {
    // DWM on Windows can return a stale thumbnail; wait for compositor refresh.
    await sleep(320);
  }

  try {
    return await captureFn();
  } finally {
    for (const { win, opacity } of restore) {
      if (win.isDestroyed()) continue;
      if (overlayWindows.enemy === win || overlayWindows.team === win) {
        showOverlayWindow(win);
      } else {
        win.show();
      }
      if (typeof win.setOpacity === "function") win.setOpacity(opacity);
    }
  }
}

async function capturePrimaryScreenBase64() {
  return withCaptureUiHidden(async () => {
    ensureCaptureAccessWindow();
    const display = screen.getPrimaryDisplay();
    const scale = display.scaleFactor || 1;
    const width = Math.max(1, Math.floor(display.size.width * scale));
    const height = Math.max(1, Math.floor(display.size.height * scale));
    const captureOpts = {
      types: ["screen"],
      thumbnailSize: { width, height },
    };
    // First frame can still include hidden overlays; discard and grab again.
    await desktopCapturer.getSources(captureOpts);
    await sleep(80);
    const sources = await desktopCapturer.getSources(captureOpts);
    if (!sources.length) {
      throw new Error("No screen sources available");
    }
    const source =
      sources.find((entry) => entry.display_id === String(display.id)) ||
      sources[0];
    return source.thumbnail.toJPEG(95).toString("base64");
  });
}

async function requestScreenCaptureAccess() {
  ensureCaptureAccessWindow();
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("screen");
    if (status === "denied" || status === "restricted") {
      screenCaptureAccessGranted = false;
      return { ok: false, granted: false, error: screenCapturePermissionHint() };
    }
  }

  try {
    await capturePrimaryScreenBase64();
    screenCaptureAccessGranted = true;
    return { ok: true, granted: true };
  } catch (err) {
    screenCaptureAccessGranted = false;
    const message = err instanceof Error ? err.message : "Screen capture failed";
    return {
      ok: false,
      granted: false,
      error: `${message}. ${screenCapturePermissionHint()}`,
    };
  }
}

function broadcastCaptureScreen(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("overlay:captureScreen", payload);
    }
  }
}

async function triggerScreenCapture() {
  const at = Date.now();
  try {
    if (!screenCaptureAccessGranted) {
      const access = await requestScreenCaptureAccess();
      if (!access.ok) {
        broadcastCaptureScreen({
          base64: "",
          at,
          error: access.error ?? "Screen capture not available",
        });
        return;
      }
    }
    const base64 = await capturePrimaryScreenBase64();
    screenCaptureAccessGranted = true;
    broadcastCaptureScreen({ base64, at });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screen capture failed";
    console.error("Screen capture failed:", err);
    broadcastCaptureScreen({ base64: "", at, error: message });
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

function unregisterAccelerator(accelerator) {
  if (accelerator && globalShortcut.isRegistered(accelerator)) {
    globalShortcut.unregister(accelerator);
  }
}

function registerClickThroughHotkey() {
  unregisterAccelerator(CLICK_THROUGH_HOTKEY);
  return globalShortcut.register(CLICK_THROUGH_HOTKEY, () => {
    applyOverlayClickThrough(!overlayClickThrough);
  });
}

function registerCaptureHotkey(accelerator) {
  unregisterAccelerator(accelerator);
  return globalShortcut.register(accelerator, () => {
    void triggerScreenCapture();
  });
}

function unregisterCaptureHotkey() {
  unregisterAccelerator(captureHotkeyAccelerator);
}

function stopHotkeyRecordingInputCapture() {
  if (!hotkeyRecordingInputHandlers) return;
  const { handler, wins } = hotkeyRecordingInputHandlers;
  for (const win of wins) {
    if (!win.isDestroyed()) {
      win.webContents.removeListener("before-input-event", handler);
    }
  }
  hotkeyRecordingInputHandlers = null;
}

function acceleratorFromInput(input) {
  if (!input || input.type !== "keyDown") return null;
  const key = input.key;
  if (!key || key === "Escape" || MODIFIER_ONLY_KEYS.has(key)) return null;

  const parts = [];
  if (input.control) parts.push("Control");
  if (input.alt) parts.push("Alt");
  if (input.shift) parts.push("Shift");
  if (input.meta) parts.push("Command");
  if (parts.length === 0) return null;

  let token = key;
  if (token === " ") token = "Space";
  else if (token.length === 1) token = token.toUpperCase();
  else if (/^f\d{1,2}$/i.test(token)) token = token.toUpperCase();
  else if (token === "ArrowUp") token = "Up";
  else if (token === "ArrowDown") token = "Down";
  else if (token === "ArrowLeft") token = "Left";
  else if (token === "ArrowRight") token = "Right";

  parts.push(token);
  return normalizeCaptureHotkey(parts.join("+"));
}

function broadcastHotkeyRecorded(accelerator) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("overlay:hotkeyRecorded", { accelerator });
    }
  }
}

function broadcastHotkeyRecordFailed(error) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("overlay:hotkeyRecordFailed", { error });
    }
  }
}

function startHotkeyRecordingInputCapture() {
  stopHotkeyRecordingInputCapture();
  const handler = (event, input) => {
    if (!hotkeyRecording) return;

    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      cancelHotkeyRecording(true);
      return;
    }

    const accelerator = acceleratorFromInput(input);
    if (!accelerator) return;

    event.preventDefault();
    const result = applyCaptureHotkey(accelerator);
    if (result.ok) {
      broadcastHotkeyRecorded(result.accelerator ?? accelerator);
    } else {
      registerOverlayHotkeys();
      broadcastHotkeyRecordFailed(
        result.error ?? "Hotkey could not be registered."
      );
    }
  };

  const wins = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
  for (const win of wins) {
    win.webContents.on("before-input-event", handler);
  }
  hotkeyRecordingInputHandlers = { handler, wins };
}

function setupHotkeyRecordingFocusGuard(win) {
  if (!win || win.isDestroyed()) return;
  if (hotkeyRecordingBlurHandler) {
    const { win: prevWin, handler } = hotkeyRecordingBlurHandler;
    if (prevWin && !prevWin.isDestroyed()) {
      prevWin.removeListener("blur", handler);
    }
  }
  const handler = () => {
    if (!hotkeyRecording) return;
    setTimeout(() => {
      if (!hotkeyRecording || !win || win.isDestroyed()) return;
      pinOverlayAlwaysOnTop(win);
      win.show();
      win.focus();
      win.webContents.focus();
    }, 30);
  };
  win.on("blur", handler);
  hotkeyRecordingBlurHandler = { win, handler };
}

function closeHotkeyRecorderWindow() {
  if (!hotkeyRecorderWindow || hotkeyRecorderWindow.isDestroyed()) {
    hotkeyRecorderWindow = null;
    return;
  }
  hotkeyRecorderWindow.close();
  hotkeyRecorderWindow = null;
}

function openHotkeyRecorderWindow() {
  closeHotkeyRecorderWindow();
  hotkeyRecorderWindow = new BrowserWindow({
    width: 440,
    height: 200,
    show: false,
    alwaysOnTop: true,
    center: true,
    frame: true,
    title: "Record screen capture hotkey",
    backgroundColor: "#14181f",
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  pinOverlayAlwaysOnTop(hotkeyRecorderWindow);
  void hotkeyRecorderWindow.loadFile(
    path.join(__dirname, "hotkey-recorder.html")
  );
  hotkeyRecorderWindow.once("ready-to-show", () => {
    if (!hotkeyRecorderWindow || hotkeyRecorderWindow.isDestroyed()) return;
    hotkeyRecorderWindow.show();
    hotkeyRecorderWindow.focus();
    hotkeyRecorderWindow.webContents.focus();
  });
  hotkeyRecorderWindow.on("closed", () => {
    hotkeyRecorderWindow = null;
    if (hotkeyRecording) {
      cancelHotkeyRecording(true);
    }
  });
}

function clearHotkeyRecordingSession() {
  hotkeyRecording = false;
  closeHotkeyRecorderWindow();
  stopHotkeyRecordingInputCapture();
  if (hotkeyRecordingTimeout) {
    clearTimeout(hotkeyRecordingTimeout);
    hotkeyRecordingTimeout = null;
  }
  if (hotkeyRecordingBlurHandler) {
    const { win, handler } = hotkeyRecordingBlurHandler;
    if (win && !win.isDestroyed()) {
      win.removeListener("blur", handler);
    }
    hotkeyRecordingBlurHandler = null;
  }
  if (clickThroughBeforeRecording) {
    applyOverlayClickThrough(true);
    clickThroughBeforeRecording = false;
  }
}

function applyCaptureHotkey(accelerator) {
  const previous = loadCaptureHotkey();
  const next = normalizeCaptureHotkey(accelerator);
  const parts = next.split("+");
  const hasModifier = parts.some((part) =>
    ["Control", "Command", "CommandOrControl", "Alt", "Shift"].includes(part)
  );
  if (!hasModifier || parts.length < 2) {
    clearHotkeyRecordingSession();
    return {
      ok: false,
      error: "Use at least one modifier (Ctrl, Alt, Shift) plus a key.",
    };
  }
  if (next === CLICK_THROUGH_HOTKEY) {
    clearHotkeyRecordingSession();
    return {
      ok: false,
      error: "Ctrl+Shift+D is reserved for click-through toggle.",
    };
  }

  saveCaptureHotkey(next);
  clearHotkeyRecordingSession();
  captureHotkeyAccelerator = next;
  registerClickThroughHotkey();
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
}

function cancelHotkeyRecording(notifyRenderer) {
  if (!hotkeyRecording) return;
  clearHotkeyRecordingSession();
  registerOverlayHotkeys();
  if (notifyRenderer) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("overlay:hotkeyRecordingCancelled");
      }
    }
  }
}

function registerOverlayHotkeys() {
  unregisterCaptureHotkey();
  registerClickThroughHotkey();

  if (hotkeyRecording) return;

  const saved = normalizeCaptureHotkey(loadCaptureHotkey());
  const candidates = [
    saved,
    ...CAPTURE_HOTKEY_FALLBACKS.filter((accel) => accel !== saved),
  ];
  let registered = false;
  for (const candidate of candidates) {
    if (candidate === CLICK_THROUGH_HOTKEY) continue;
    if (registerCaptureHotkey(candidate)) {
      captureHotkeyAccelerator = candidate;
      registered = true;
      if (candidate !== saved) {
        console.warn(
          `Capture hotkey "${saved}" unavailable; using "${candidate}" instead.`
        );
        saveCaptureHotkey(candidate);
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

function packagedClientDist() {
  const inResources = path.join(process.resourcesPath, "client", "dist");
  if (fs.existsSync(path.join(inResources, "index.html"))) {
    return inResources;
  }
  return path.join(app.getAppPath(), "client", "dist");
}

function packagedUiUrl(query) {
  const qs = new URLSearchParams(query).toString();
  return qs ? `${PACKAGED_UI_URL}?${qs}` : PACKAGED_UI_URL;
}

function loadPanelContents(win, config) {
  if (isDev) {
    return win.loadURL(`${DEV_URL}?panel=${config.panel}`);
  }
  return win.loadURL(packagedUiUrl({ panel: config.panel }));
}

function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function packagedResourcesRoot() {
  return isDev ? path.join(__dirname, "..") : process.resourcesPath;
}

function waitForApiHealth(timeoutMs = 45_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(API_HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2_000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error("API server did not start in time"));
        return;
      }
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

function startPackagedApiServer() {
  if (isDev) return Promise.resolve();

  const root = packagedResourcesRoot();
  const serverEntry = path.join(root, "server", "dist", "index.js");
  const dataDir = path.join(root, "data");

  if (!fs.existsSync(serverEntry)) {
    return Promise.reject(
      new Error(`Packaged API server not found at ${serverEntry}`)
    );
  }

  apiServerProcess = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      STARCRAFT_DS_DATA_DIR: dataDir,
      ELECTRON_CLIENT_DIST: packagedClientDist(),
      PORT: API_PORT,
      AUTO_START_OLLAMA: process.env.AUTO_START_OLLAMA ?? "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  apiServerProcess.stdout?.on("data", (chunk) => {
    console.log(`[api] ${chunk.toString().trimEnd()}`);
  });
  apiServerProcess.stderr?.on("data", (chunk) => {
    console.error(`[api] ${chunk.toString().trimEnd()}`);
  });
  apiServerProcess.on("exit", (code, signal) => {
    if (code != null && code !== 0) {
      console.error(`[api] exited with code ${code}`);
    }
    if (signal) {
      console.error(`[api] killed by signal ${signal}`);
    }
    apiServerProcess = null;
  });

  return waitForApiHealth();
}

function stopPackagedApiServer() {
  if (!apiServerProcess || apiServerProcess.killed) return;
  apiServerProcess.kill();
  apiServerProcess = null;
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
    mainWindow.loadURL(PACKAGED_UI_URL);
  }

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`Main window failed to load (${code}): ${description}`);
  });

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
    backgroundColor: "#00000000",
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
  if (typeof win.setContentProtection === "function") {
    win.setContentProtection(true);
  }

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) showOverlayWindow(win);
  });

  void loadPanelContents(win, config).catch((err) => {
    console.error(`Overlay panel "${panel}" failed to load:`, err);
  });

  win.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(
      `Overlay panel "${panel}" did-fail-load (${code}): ${description}`
    );
  });

  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `Overlay panel "${panel}" failed to load (${errorCode}): ${errorDescription} — ${validatedURL}`
      );
    }
  );

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

initAutoUpdater(ipcMain);

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  let apiReady = true;
  if (!isDev) {
    try {
      await startPackagedApiServer();
    } catch (err) {
      apiReady = false;
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to start API server:", err);
      dialog.showErrorBox(
        "Starcraft Coach",
        `Could not start the app backend.\n\n${message}\n\nTry restarting, or reinstall from starcraftcoach.com.`
      );
    }
  }

  if (!apiReady) return;

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
  stopPackagedApiServer();
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

ipcMain.handle("screenCapture:requestAccess", () =>
  requestScreenCaptureAccess()
);

ipcMain.handle("screenCapture:captureNow", async () => {
  if (!screenCaptureAccessGranted) {
    const access = await requestScreenCaptureAccess();
    if (!access.ok) {
      return { ok: false, error: access.error ?? "Screen capture not available" };
    }
  }
  try {
    const base64 = await capturePrimaryScreenBase64();
    return { ok: true, base64, at: Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screen capture failed";
    return { ok: false, error: message };
  }
});

ipcMain.handle("screenCapture:getStatus", () => ({
  granted: screenCaptureAccessGranted,
}));

ipcMain.handle("overlay:getCaptureHotkey", () => loadCaptureHotkey());

ipcMain.handle("overlay:getCaptureHotkeyStatus", () => ({
  saved: loadCaptureHotkey(),
  active: captureHotkeyAccelerator,
  registered: globalShortcut.isRegistered(captureHotkeyAccelerator),
}));

ipcMain.handle("overlay:beginHotkeyRecording", (event) => {
  cancelHotkeyRecording(false);
  hotkeyRecording = true;
  unregisterCaptureHotkey();
  registerClickThroughHotkey();

  clickThroughBeforeRecording = overlayClickThrough;
  if (overlayClickThrough) {
    applyOverlayClickThrough(false);
  }

  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (senderWin && !senderWin.isDestroyed()) {
    pinOverlayAlwaysOnTop(senderWin);
    senderWin.show();
    senderWin.focus();
    senderWin.webContents.focus();
    clearOverlayMouseIgnore(senderWin);
    setupHotkeyRecordingFocusGuard(senderWin);
  }
  for (const panel of Object.keys(overlayWindows)) {
    clearOverlayMouseIgnore(overlayWindows[panel]);
  }

  startHotkeyRecordingInputCapture();

  if (hotkeyRecordingTimeout) clearTimeout(hotkeyRecordingTimeout);
  hotkeyRecordingTimeout = setTimeout(() => {
    cancelHotkeyRecording(true);
  }, HOTKEY_RECORDING_TIMEOUT_MS);

  return { ok: true };
});

ipcMain.handle("overlay:submitRecordedHotkey", (_event, accelerator) => {
  if (!hotkeyRecording) {
    return { ok: false, error: "Hotkey recording is not active." };
  }
  if (typeof accelerator !== "string" || !accelerator.trim()) {
    return { ok: false, error: "Invalid shortcut." };
  }

  const result = applyCaptureHotkey(accelerator);
  closeHotkeyRecorderWindow();
  if (result.ok) {
    broadcastHotkeyRecorded(result.accelerator ?? accelerator);
  } else {
    registerOverlayHotkeys();
    broadcastHotkeyRecordFailed(
      result.error ?? "Hotkey could not be registered."
    );
  }
  return result;
});

ipcMain.handle("overlay:endHotkeyRecording", () => {
  clearHotkeyRecordingSession();
  registerOverlayHotkeys();
  return { ok: true };
});

ipcMain.handle("overlay:cancelHotkeyRecording", () => {
  cancelHotkeyRecording(true);
  return { ok: true };
});

ipcMain.handle("overlay:setCaptureHotkey", (_event, accelerator) => {
  const result = applyCaptureHotkey(accelerator);
  if (!result.ok) {
    registerOverlayHotkeys();
  } else {
    broadcastHotkeyRecorded(result.accelerator ?? accelerator);
  }
  return result;
});

ipcMain.on("shell:openExternal", (_e, url) => {
  void shell.openExternal(url);
});
