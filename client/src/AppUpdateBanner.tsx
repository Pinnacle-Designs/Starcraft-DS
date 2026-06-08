import { useAppUpdate } from "./useAppUpdate";

export function AppUpdateBanner() {
  const { status, visible, dismiss, applyUpdate } = useAppUpdate();

  if (!visible) return null;

  const current = status.currentVersion ? `v${status.currentVersion}` : "your version";
  const next = status.version ? `v${status.version}` : "a new version";

  let title = "Update available";
  let message = `A newer version (${next}) is available. You have ${current}.`;
  let primaryLabel = "Update now";
  let primaryAction = () => void applyUpdate();
  let showDismiss = true;
  let disabled = false;

  if (status.phase === "downloading") {
    title = "Downloading update";
    message = `Fetching ${next}… ${status.percent ?? 0}%`;
    primaryLabel = "Downloading…";
    primaryAction = () => {};
    showDismiss = false;
    disabled = true;
  } else if (status.phase === "ready" || status.phase === "installing") {
    title = "Installing update";
    message = "Starcraft Coach will restart in a moment…";
    primaryLabel = "Restarting…";
    primaryAction = () => {};
    showDismiss = false;
    disabled = true;
  } else if (status.phase === "error") {
    title = "Update failed";
    message = status.error ?? "Could not download the latest version.";
    primaryLabel = "Try again";
    primaryAction = () => void applyUpdate();
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
          disabled={disabled}
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
