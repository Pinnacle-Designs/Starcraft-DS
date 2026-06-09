import { useCallback, useEffect, useState } from "react";
import { isElectronApp } from "./overlaySync";

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface AppUpdateStatus {
  phase: AppUpdatePhase;
  currentVersion?: string;
  version?: string;
  percent?: number;
  releaseNotes?: string;
  error?: string;
}

const IDLE_STATUS: AppUpdateStatus = { phase: "idle" };

export function useAppUpdate() {
  const [status, setStatus] = useState<AppUpdateStatus>(IDLE_STATUS);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    const api = window.starcraftDS;
    if (!isElectronApp() || !api?.onAppUpdateStatus) return;

    void api.getAppUpdateStatus?.().then((next) => {
      if (next) setStatus(next as AppUpdateStatus);
    });

    const unsubscribe = api.onAppUpdateStatus((next) => {
      setStatus(next as AppUpdateStatus);
    });

    const timer = window.setTimeout(() => {
      void api.checkForAppUpdate?.().then((next) => {
        if (next) setStatus(next as AppUpdateStatus);
      });
    }, 1500);

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const dismiss = useCallback(() => {
    if (status.version) setDismissedVersion(status.version);
  }, [status.version]);

  const checkForUpdate = useCallback(async () => {
    const next = await window.starcraftDS?.checkForAppUpdate?.();
    if (next) setStatus(next as AppUpdateStatus);
  }, []);

  const applyUpdate = useCallback(async () => {
    const next = await window.starcraftDS?.applyAppUpdate?.();
    if (next) setStatus(next as AppUpdateStatus);
  }, []);

  const visible =
    isElectronApp() &&
    status.phase !== "idle" &&
    status.phase !== "checking" &&
    !(status.phase === "available" && status.version === dismissedVersion);

  return {
    status,
    visible,
    dismiss,
    checkForUpdate,
    applyUpdate,
  };
}
