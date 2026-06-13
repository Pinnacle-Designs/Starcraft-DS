import { useCallback } from "react";
import { isElectronApp } from "./overlaySync";

export function useOverlayHeaderDrag() {
  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isElectronApp() || e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".floating-overlay-panel-close")) {
        return;
      }

      const api = window.starcraftDS;
      if (!api?.moveOverlayWindow) return;

      e.preventDefault();
      const header = e.currentTarget;
      header.setPointerCapture(e.pointerId);
      void api.setIgnoreMouseEvents?.(false);

      let lastX = e.screenX;
      let lastY = e.screenY;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.screenX - lastX;
        const dy = ev.screenY - lastY;
        lastX = ev.screenX;
        lastY = ev.screenY;
        if (dx !== 0 || dy !== 0) {
          void api.moveOverlayWindow(dx, dy);
        }
      };

      const endDrag = () => {
        header.removeEventListener("pointermove", onMove);
        header.removeEventListener("pointerup", endDrag);
        header.removeEventListener("pointercancel", endDrag);
        if (header.hasPointerCapture(e.pointerId)) {
          header.releasePointerCapture(e.pointerId);
        }
      };

      header.addEventListener("pointermove", onMove);
      header.addEventListener("pointerup", endDrag);
      header.addEventListener("pointercancel", endDrag);
    },
    []
  );

  return onHeaderPointerDown;
}
