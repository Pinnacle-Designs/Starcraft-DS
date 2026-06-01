import { useCallback, useEffect, useRef, useState } from "react";

export function useScreenCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCapturing(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          frameRate: { ideal: 30, max: 60 },
        } as MediaTrackConstraints,
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCapturing(true);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stop();
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Screen capture permission denied"
      );
      stop();
    }
  }, [stop]);

  const captureFrameBase64 = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !capturing || video.videoWidth === 0) {
      return null;
    }
    const w = Math.min(video.videoWidth, 1280);
    const h = Math.round((w / video.videoWidth) * video.videoHeight);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    return dataUrl.split(",")[1] ?? null;
  }, [capturing]);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    canvasRef,
    capturing,
    error,
    start,
    stop,
    captureFrameBase64,
  };
}
