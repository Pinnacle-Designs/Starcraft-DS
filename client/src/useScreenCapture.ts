import { useCallback, useEffect, useRef, useState } from "react";

export type VideoSource = "none" | "capture" | "file";

const VIDEO_EXTENSIONS =
  /\.(mp4|webm|ogg|ogv|mov|avi|mkv|m4v|wmv|flv|3gp|mpeg|mpg|ts|m2ts|mts)$/i;

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.test(file.name);
}

export function useScreenCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const capturingRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<VideoSource>("none");
  const [videoFileName, setVideoFileName] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.srcObject = null;
      video.controls = false;
      video.load();
    }
    capturingRef.current = false;
    setCapturing(false);
    setFrameReady(false);
    setSource("none");
    setVideoFileName(null);
  }, []);

  const attachVideoReadyHandlers = useCallback((video: HTMLVideoElement) => {
    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setFrameReady(true);
      }
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("resize", onReady);
    onReady();
  }, []);

  const start = useCallback(async () => {
    stop();
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

      video.controls = false;
      video.srcObject = stream;
      await video.play();

      attachVideoReadyHandlers(video);

      capturingRef.current = true;
      setCapturing(true);
      setSource("capture");

      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stop();
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Screen capture permission denied"
      );
      stop();
    }
  }, [attachVideoReadyHandlers, stop]);

  const loadVideoFile = useCallback(
    async (file: File) => {
      if (!isVideoFile(file)) {
        setError(
          "Please choose a video file (e.g. MP4, WebM, MOV, MKV, AVI)."
        );
        return;
      }

      stop();
      setError(null);
      setFrameReady(false);

      const video = videoRef.current;
      if (!video) return;

      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      video.srcObject = null;
      video.src = url;
      video.controls = true;
      video.muted = false;

      video.onerror = () => {
        setError(
          "Could not play this video in your browser. Try MP4 (H.264) or WebM."
        );
        stop();
      };

      try {
        await video.play();
      } catch {
        /* User can press play — autoplay may be blocked with audio */
      }

      attachVideoReadyHandlers(video);

      capturingRef.current = true;
      setCapturing(true);
      setSource("file");
      setVideoFileName(file.name);
    },
    [attachVideoReadyHandlers, stop]
  );

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
    source,
    videoFileName,
    start,
    stop,
    loadVideoFile,
    captureFrameBase64,
  };
}
