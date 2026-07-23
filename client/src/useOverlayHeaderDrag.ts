import { useCallback } from "react";
import { isElectronApp } from "./overlaySync";

export function useOverlayHeaderDrag() {
  const onHeaderPointerEnter = useCallback(() => {
    if (!isElectronApp()) return;
    void window.starcraftDS?.prepareOverlayInteraction?.();
    void window.starcraftDS?.setIgnoreMouseEvents?.(false);
  }, []);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!isElectronApp() || e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".floating-overlay-panel-close")) {
        return;
      }

      const api = window.starcraftDS;
      if (!api?.beginOverlayDrag) return;

      e.preventDefault();
      e.stopPropagation();
      void api.prepareOverlayInteraction?.();
      void api.setIgnoreMouseEvents?.(false);
      void api.beginOverlayDrag();

      const endDrag = () => {
        document.removeEventListener("pointerup", endDrag, true);
        document.removeEventListener("pointercancel", endDrag, true);
        void api.endOverlayDrag?.();
      };

      document.addEventListener("pointerup", endDrag, true);
      document.addEventListener("pointercancel", endDrag, true);
    },
    []
  );

  return { onHeaderPointerDown, onHeaderPointerEnter };
}
