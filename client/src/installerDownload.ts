import { GITHUB_REPO, WINDOWS_INSTALLER_URL } from "./apiConfig";

export interface InstallerDownloadInfo {
  tagName: string;
  downloadUrl: string;
  fileName: string;
  source: "hosted" | "github";
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/** Installer hosted on your site, e.g. https://starcraftcoach.com/downloads/Starcraft-Coach-Setup.exe */
export function getHostedInstaller(): InstallerDownloadInfo | null {
  if (!WINDOWS_INSTALLER_URL) return null;
  const fileName =
    WINDOWS_INSTALLER_URL.split("/").pop()?.split("?")[0] ||
    "Starcraft-Coach-Setup.exe";
  return {
    tagName: "latest",
    downloadUrl: WINDOWS_INSTALLER_URL,
    fileName,
    source: "hosted",
  };
}

export async function fetchGitHubInstaller(): Promise<InstallerDownloadInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tag_name?: string;
      assets?: ReleaseAsset[];
    };
    const assets = data.assets ?? [];
    const winAsset =
      assets.find((asset) => /\.exe$/i.test(asset.name)) ??
      assets.find((asset) => /windows|win/i.test(asset.name)) ??
      assets[0];
    if (!winAsset?.browser_download_url) return null;
    return {
      tagName: data.tag_name ?? "latest",
      downloadUrl: winAsset.browser_download_url,
      fileName: winAsset.name,
      source: "github",
    };
  } catch {
    return null;
  }
}

export async function resolveInstallerDownload(): Promise<InstallerDownloadInfo | null> {
  const hosted = getHostedInstaller();
  if (hosted) return hosted;
  return fetchGitHubInstaller();
}
