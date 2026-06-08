/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_PAGES?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_GITHUB_PAGES_URL?: string;
  readonly VITE_ENABLE_CAPTURE_MEDIA?: string;
  readonly VITE_ENABLE_OVERLAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DocumentPictureInPicture {
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
  }): Promise<Window>;
  readonly window: Window | null;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
}
