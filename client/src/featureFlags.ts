/**
 * When false (default), hides UI that references AI, live screen capture, or replay import.
 * Set VITE_SHOW_AI_CAPTURE_REPLAY=true to expose those features in the UI.
 */
export const showAiCaptureReplay =
  import.meta.env.VITE_SHOW_AI_CAPTURE_REPLAY === "true";

/** Screen capture, video preview, and upload. */
export const captureMediaEnabled =
  showAiCaptureReplay &&
  (import.meta.env.VITE_ENABLE_CAPTURE_MEDIA === "true" ||
    (import.meta.env.DEV &&
      import.meta.env.VITE_ENABLE_CAPTURE_MEDIA !== "false"));

/** Pop-out always-on-top overlay panels. Set VITE_ENABLE_OVERLAY=false to disable. */
export const overlayEnabled = import.meta.env.VITE_ENABLE_OVERLAY !== "false";
