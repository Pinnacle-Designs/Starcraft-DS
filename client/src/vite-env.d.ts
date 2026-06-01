/// <reference types="vite/client" />

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
