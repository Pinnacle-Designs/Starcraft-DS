import { isElectronApp } from "./overlaySync";
import type { OverlayPanelId } from "./overlayStorage";
import { useOverlayHeaderDrag } from "./useOverlayHeaderDrag";

interface Props {
  title: string;
  panelId: OverlayPanelId;
  onClose: () => void;
  clickThrough?: boolean;
  onClickThroughChange?: (enabled: boolean) => void;
  /** Rendered in the footer above click-through controls (always receives clicks). */
  footerTop?: React.ReactNode;
  children: React.ReactNode;
}

export function OverlayPanelShell({
  title,
  panelId,
  onClose,
  clickThrough = false,
  onClickThroughChange,
  footerTop,
  children,
}: Props) {
  const electron = isElectronApp();
  const { onHeaderPointerDown, onHeaderPointerEnter } = useOverlayHeaderDrag();

  return (
    <div
      className={`overlay-panel-window-root${
        panelId === "team" ? " overlay-panel-team" : ""
      }${clickThrough && panelId !== "team" ? " overlay-click-through-active" : ""}`}
      role="dialog"
      aria-label={title}
    >
      <header
        className={`floating-overlay-panel-header${
          electron ? " overlay-window-drag" : ""
        }`}
        onPointerDown={electron ? onHeaderPointerDown : undefined}
        onPointerEnter={electron ? onHeaderPointerEnter : undefined}
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
          clickThrough && panelId !== "team"
            ? "floating-overlay-panel-body passthrough"
            : "floating-overlay-panel-body"
        }
      >
        {children}
      </div>
      {electron && panelId === "team" ? (
        <footer className="floating-overlay-panel-footer">
          <span className="overlay-hotkey-hint">
            Drag the header to move. This panel stays clickable while you play.
          </span>
        </footer>
      ) : null}
      {electron && onClickThroughChange ? (
        <footer className="floating-overlay-panel-footer">
          {footerTop}
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
