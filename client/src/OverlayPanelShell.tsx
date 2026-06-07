import { isElectronApp } from "./overlaySync";
import type { OverlayPanelId } from "./overlayStorage";

interface Props {
  title: string;
  panelId: OverlayPanelId;
  onClose: () => void;
  clickThrough?: boolean;
  onClickThroughChange?: (enabled: boolean) => void;
  children: React.ReactNode;
}

export function OverlayPanelShell({
  title,
  panelId,
  onClose,
  clickThrough = false,
  onClickThroughChange,
  children,
}: Props) {
  const electron = isElectronApp();

  return (
    <div
      className={`overlay-panel-window-root${
        panelId === "team" ? " overlay-panel-team" : ""
      }${clickThrough ? " overlay-click-through-active" : ""}`}
      role="dialog"
      aria-label={title}
    >
      <header
        className={`floating-overlay-panel-header${
          electron ? " overlay-window-drag" : ""
        }`}
      >
        <span className="floating-overlay-panel-title">{title}</span>
        <button
          type="button"
          className="floating-overlay-panel-close"
          onClick={onClose}
          aria-label={`Close ${title}`}
          title="Close panel"
        >
          ×
        </button>
      </header>
      <div
        className={
          clickThrough
            ? "floating-overlay-panel-body passthrough"
            : "floating-overlay-panel-body"
        }
      >
        {children}
      </div>
      {electron && onClickThroughChange ? (
        <footer className="floating-overlay-panel-footer">
          <label className="overlay-toggle">
            <input
              type="checkbox"
              checked={clickThrough}
              onChange={(e) => onClickThroughChange(e.target.checked)}
            />
            Click-through (game receives clicks)
          </label>
          <span className="overlay-hotkey-hint">
            Ctrl+Shift+D click-through. Set screen-capture hotkey on the enemy
            panel. Drag the header to move.
          </span>
        </footer>
      ) : null}
    </div>
  );
}
