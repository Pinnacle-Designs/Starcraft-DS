const { app, BrowserWindow } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 4_000;
const UPDATE_FEED_URL =
  "https://github.com/Pinnacle-Designs/Starcraft-DS/releases/latest/download";

let updateStatus = {
  phase: "idle",
  currentVersion: app.getVersion(),
};
let checkTimer = null;
let startupTimer = null;
let downloadRequested = false;
let installAfterDownload = false;
let checkInFlight = false;
let startupCheckDone = false;

function broadcastUpdateStatus() {
  const payload = { ...updateStatus };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("updates:status", payload);
    }
  }
}

function setStatus(patch) {
  updateStatus = { ...updateStatus, ...patch };
  broadcastUpdateStatus();
}

function schedulePeriodicChecks() {
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(() => {
    void runUpdateCheck();
  }, CHECK_INTERVAL_MS);
}

async function runUpdateCheck() {
  if (!app.isPackaged || checkInFlight) return;
  checkInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updater] check failed:", message);
    if (updateStatus.phase === "checking") {
      setStatus({ phase: "error", error: message });
    }
  } finally {
    checkInFlight = false;
  }
}

function quitAndRestart() {
  setStatus({ phase: "installing", error: undefined });
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 400);
}

function registerUpdateHandlers(ipcMain) {
  ipcMain.handle("updates:getStatus", () => ({ ...updateStatus }));

  ipcMain.handle("updates:check", async () => {
    if (!app.isPackaged) {
      return {
        ...updateStatus,
        phase: "idle",
        message: "Updates are only available in the installed app.",
      };
    }
    setStatus({ phase: "checking", error: undefined });
    await runUpdateCheck();
    return { ...updateStatus };
  });

  ipcMain.handle("updates:download", async () => {
    if (!app.isPackaged) return { ...updateStatus };
    if (updateStatus.phase !== "available") {
      return { ...updateStatus };
    }
    downloadRequested = true;
    installAfterDownload = false;
    setStatus({ phase: "downloading", percent: 0, error: undefined });
    try {
      await autoUpdater.downloadUpdate();
      return { ...updateStatus };
    } catch (err) {
      downloadRequested = false;
      const message =
        err instanceof Error ? err.message : "Download failed.";
      setStatus({ phase: "error", error: message });
      return { ...updateStatus };
    }
  });

  ipcMain.handle("updates:apply", async () => {
    if (!app.isPackaged) return { ...updateStatus };

    if (updateStatus.phase === "ready") {
      quitAndRestart();
      return { ...updateStatus };
    }

    if (
      updateStatus.phase !== "available" &&
      updateStatus.phase !== "error"
    ) {
      return { ...updateStatus };
    }

    installAfterDownload = true;
    downloadRequested = true;
    setStatus({ phase: "downloading", percent: 0, error: undefined });
    try {
      await autoUpdater.downloadUpdate();
      return { ...updateStatus };
    } catch (err) {
      installAfterDownload = false;
      downloadRequested = false;
      const message =
        err instanceof Error ? err.message : "Download failed.";
      setStatus({ phase: "error", error: message });
      return { ...updateStatus };
    }
  });

  ipcMain.handle("updates:install", () => {
    if (!app.isPackaged) return { ok: false };
    if (updateStatus.phase !== "ready") return { ok: false };
    quitAndRestart();
    return { ok: true };
  });
}

function runStartupUpdateCheck() {
  if (startupCheckDone || checkInFlight || !app.isPackaged) return;
  startupCheckDone = true;
  if (
    updateStatus.phase === "available" ||
    updateStatus.phase === "ready" ||
    updateStatus.phase === "downloading" ||
    updateStatus.phase === "installing"
  ) {
    return;
  }
  void runUpdateCheck();
}

function notifyRendererReady() {
  broadcastUpdateStatus();
  runStartupUpdateCheck();
}

function initAutoUpdater(ipcMain) {
  registerUpdateHandlers(ipcMain);

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.logger = console;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  // Allow updates when CI builds are unsigned (signed installs still need a signed release).
  autoUpdater.verifyUpdateCodeSignature = false;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: UPDATE_FEED_URL,
  });

  autoUpdater.on("checking-for-update", () => {
    setStatus({ phase: "checking", error: undefined });
  });

  autoUpdater.on("update-available", (info) => {
    downloadRequested = false;
    setStatus({
      phase: "available",
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
      error: undefined,
    });
  });

  autoUpdater.on("update-not-available", () => {
    downloadRequested = false;
    installAfterDownload = false;
    setStatus({
      phase: "idle",
      version: undefined,
      releaseNotes: undefined,
      error: undefined,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setStatus({
      phase: "downloading",
      percent: Math.round(progress.percent ?? 0),
      transferred: progress.transferred,
      total: progress.total,
      error: undefined,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setStatus({
      phase: "ready",
      version: info.version,
      percent: 100,
      error: undefined,
    });
    if (installAfterDownload) {
      installAfterDownload = false;
      quitAndRestart();
    }
  });

  autoUpdater.on("error", (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updater] error:", message);
    if (!downloadRequested && updateStatus.phase === "checking") {
      setStatus({ phase: "error", error: message });
      return;
    }
    setStatus({ phase: "error", error: message });
    downloadRequested = false;
    installAfterDownload = false;
  });

  app.whenReady().then(() => {
    startupTimer = setTimeout(() => {
      runStartupUpdateCheck();
      schedulePeriodicChecks();
    }, STARTUP_DELAY_MS);
  });

  app.on("will-quit", () => {
    if (startupTimer) clearTimeout(startupTimer);
    if (checkTimer) clearInterval(checkTimer);
  });
}

module.exports = { initAutoUpdater, notifyRendererReady };
