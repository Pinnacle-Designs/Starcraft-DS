/** Screen capture, video preview, and upload — hidden on production until launched. */
export const captureMediaEnabled =
  import.meta.env.VITE_ENABLE_CAPTURE_MEDIA === "true" ||
  (import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_CAPTURE_MEDIA !== "false");

/** Pop-out overlay — disabled until launched. Set VITE_ENABLE_OVERLAY=true to enable. */
export const overlayEnabled = import.meta.env.VITE_ENABLE_OVERLAY === "true";
