import { isElectronApp } from "./overlaySync";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function OverlayPanelShell({ title, onClose, children }: Props) {
  const electron = isElectronApp();

  return (
    <div className="overlay-panel-window-root" role="dialog" aria-label={title}>
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
      <div className="floating-overlay-panel-body">{children}</div>
    </div>
  );
}
