const { app, BrowserWindow } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 30_000;

let updateStatus = {
  phase: "idle",
  currentVersion: app.getVersion(),
};
let checkTimer = null;
let startupTimer = null;
let downloadRequested = false;

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
    void autoUpdater.checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL_MS);
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
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result?.updateInfo) {
        setStatus({ phase: "idle", error: undefined });
      }
      return { ...updateStatus };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not check for updates.";
      setStatus({ phase: "error", error: message });
      return { ...updateStatus };
    }
  });

  ipcMain.handle("updates:download", async () => {
    if (!app.isPackaged) return { ...updateStatus };
    if (updateStatus.phase !== "available") {
      return { ...updateStatus };
    }
    downloadRequested = true;
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

  ipcMain.handle("updates:install", () => {
    if (!app.isPackaged) return { ok: false };
    if (updateStatus.phase !== "ready") return { ok: false };
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
}

function initAutoUpdater(ipcMain) {
  registerUpdateHandlers(ipcMain);

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

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
  });

  autoUpdater.on("error", (err) => {
    if (!downloadRequested && updateStatus.phase === "checking") {
      setStatus({ phase: "idle", error: undefined });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    setStatus({ phase: "error", error: message });
    downloadRequested = false;
  });

  app.whenReady().then(() => {
    startupTimer = setTimeout(() => {
      void autoUpdater.checkForUpdates().catch(() => {});
      schedulePeriodicChecks();
    }, STARTUP_DELAY_MS);
  });

  app.on("will-quit", () => {
    if (startupTimer) clearTimeout(startupTimer);
    if (checkTimer) clearInterval(checkTimer);
  });
}

module.exports = { initAutoUpdater };
