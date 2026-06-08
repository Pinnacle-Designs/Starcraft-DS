/** True when the client was built for GitHub Pages (no local API). */
export function isStaticWebDeploy(): boolean {
  return import.meta.env.VITE_GITHUB_PAGES === "true";
}

const DEFAULT_LOCAL_API = "http://127.0.0.1:3847";

/** Base URL for API requests (no trailing slash). Empty string uses same-origin `/api`. */
export function getApiBase(): string {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const bridge = window.starcraftDS;
    if (bridge?.apiBase) return bridge.apiBase.replace(/\/$/, "");
    if (bridge?.isElectron || window.location.protocol === "file:") {
      return DEFAULT_LOCAL_API;
    }
  }

  if (isStaticWebDeploy()) return "";
  return "";
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  if (!base) return path;
  return `${base}${path}`;
}

export const GITHUB_REPO = "pinnacle-designs/Starcraft-DS";
export const GITHUB_PAGES_URL =
  import.meta.env.VITE_GITHUB_PAGES_URL ?? "https://starcraftcoach.com/";

/**
 * Optional direct installer URL on your web server (Step 3–4 in distribution guide).
 * Example: https://downloads.starcraftcoach.com/Starcraft-Coach-Setup.exe
 * When set, the download button uses this instead of the GitHub Releases API.
 */
export const WINDOWS_INSTALLER_URL =
  import.meta.env.VITE_WINDOWS_INSTALLER_URL?.trim() || "";
