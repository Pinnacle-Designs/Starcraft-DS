/** Screen capture, video preview, and upload — hidden on production until launched. */
export const captureMediaEnabled =
  import.meta.env.VITE_ENABLE_CAPTURE_MEDIA === "true" ||
  (import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_CAPTURE_MEDIA !== "false");
