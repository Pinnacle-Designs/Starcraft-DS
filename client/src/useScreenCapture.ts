import { useCallback, useEffect, useRef, useState } from "react";

export function useScreenCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturingRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    capturingRef.current = false;
    setCapturing(false);
    setFrameReady(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setFrameReady(false);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      const onReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setFrameReady(true);
        }
      };
      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("resize", onReady);
      onReady();

      capturingRef.current = true;
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
    if (
      !video ||
      !canvas ||
      !capturingRef.current ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0
    ) {
      return null;
    }

    const w = Math.min(video.videoWidth, 960);
    const h = Math.round((w / video.videoWidth) * video.videoHeight);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    try {
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
      return dataUrl.split(",")[1] ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    canvasRef,
    capturing,
    frameReady,
    error,
    start,
    stop,
    captureFrameBase64,
  };
}
