/** Screen capture, video preview, and upload — hidden on production until launched. */
export const captureMediaEnabled =
  import.meta.env.VITE_ENABLE_CAPTURE_MEDIA === "true" ||
  (import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_CAPTURE_MEDIA !== "false");

/** Pop-out always-on-top overlay panels. Set VITE_ENABLE_OVERLAY=false to disable. */
export const overlayEnabled = import.meta.env.VITE_ENABLE_OVERLAY !== "false";
