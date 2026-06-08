import { useAppUpdate } from "./useAppUpdate";

export function AppUpdateBanner() {
  const {
    status,
    visible,
    dismiss,
    downloadUpdate,
    installUpdate,
  } = useAppUpdate();

  if (!visible) return null;

  const current = status.currentVersion ? `v${status.currentVersion}` : "your version";
  const next = status.version ? `v${status.version}` : "a new version";

  let title = "Update available";
  let message = `Starcraft Coach ${next} is ready. You have ${current}.`;
  let primaryLabel = "Update now";
  let primaryAction = () => void downloadUpdate();
  let showDismiss = true;

  if (status.phase === "downloading") {
    title = "Downloading update";
    message = `Fetching ${next}… ${status.percent ?? 0}%`;
    primaryLabel = "Downloading…";
    primaryAction = () => {};
    showDismiss = false;
  } else if (status.phase === "ready") {
    title = "Update ready";
    message = `${next} downloaded. Restart to finish installing.`;
    primaryLabel = "Restart and update";
    primaryAction = () => void installUpdate();
    showDismiss = false;
  } else if (status.phase === "error") {
    title = "Update failed";
    message = status.error ?? "Could not download the latest version.";
    primaryLabel = "Try again";
    primaryAction = () => void downloadUpdate();
    showDismiss = true;
  }

  return (
    <section className="app-update-banner" role="status" aria-live="polite">
      <div className="app-update-copy">
        <strong className="app-update-title">{title}</strong>
        <p className="app-update-message">{message}</p>
      </div>
      <div className="app-update-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={status.phase === "downloading"}
          onClick={primaryAction}
        >
          {primaryLabel}
        </button>
        {showDismiss ? (
          <button type="button" className="btn" onClick={dismiss}>
            Later
          </button>
        ) : null}
      </div>
      {status.phase === "downloading" ? (
        <div
          className="app-update-progress"
          aria-hidden
          style={{ width: `${Math.max(0, Math.min(100, status.percent ?? 0))}%` }}
        />
      ) : null}
    </section>
  );
}
