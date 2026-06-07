import { useRef, useState } from "react";
import {
  loadPanelPosition,
  savePanelPosition,
  type PanelPosition,
} from "./overlayStorage";

interface Props {
  id: string;
  title: string;
  defaultPosition: PanelPosition;
  onClose: () => void;
  children: React.ReactNode;
}

function clampToViewport(pos: PanelPosition, el: HTMLElement | null): PanelPosition {
  const width = el?.offsetWidth ?? 380;
  const height = el?.offsetHeight ?? 400;
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);
  return {
    x: Math.min(Math.max(pos.x, 0), maxX),
    y: Math.min(Math.max(pos.y, 0), maxY),
  };
}

export function WebFloatingPanel({
  id,
  title,
  defaultPosition,
  onClose,
  children,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() =>
    clampToViewport(loadPanelPosition(id, defaultPosition), null)
  );
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    const next = clampToViewport(
      {
        x: e.clientX - offset.current.x,
        y: e.clientY - offset.current.y,
      },
      rootRef.current
    );
    setPos(next);
  };

  const onHeaderPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const next = clampToViewport(
      {
        x: e.clientX - offset.current.x,
        y: e.clientY - offset.current.y,
      },
      rootRef.current
    );
    setPos(next);
    savePanelPosition(id, next);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <div
      ref={rootRef}
      className="web-floating-panel"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={title}
    >
      <header
        className="floating-overlay-panel-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
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
