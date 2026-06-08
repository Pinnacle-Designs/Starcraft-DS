import { useEffect, useState } from "react";
import { GITHUB_REPO, isStaticWebDeploy } from "./apiConfig";
import { isElectronApp } from "./overlaySync";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseInfo {
  tagName: string;
  windowsUrl: string | null;
  windowsLabel: string;
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
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
    return {
      tagName: data.tag_name ?? "latest",
      windowsUrl: winAsset?.browser_download_url ?? null,
      windowsLabel: winAsset?.name ?? "Windows installer",
    };
  } catch {
    return null;
  }
}

export function DownloadApp({ compact = false }: { compact?: boolean }) {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchLatestRelease().then((info) => {
      if (!cancelled) {
        setRelease(info);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isElectronApp()) return null;

  const releasesPage = `https://github.com/${GITHUB_REPO}/releases/latest`;
  const showHero = isStaticWebDeploy() && !compact;

  return (
    <section
      className={`download-app${showHero ? " download-app-hero" : ""}${compact ? " download-app-compact" : ""}`}
    >
      <div className="download-app-copy">
        <h2 className="download-app-title">
          {showHero ? "Play with the desktop app" : "Install desktop app"}
        </h2>
        <p className="download-app-text">
          {showHero
            ? "This site runs counter lookups in your browser. Install Starcraft Coach on your PC for always-on-top overlays and a dedicated coach window while you play."
            : "Get always-on-top overlays and a dedicated coach window with the Windows desktop build."}
        </p>
        {!showHero && isStaticWebDeploy() ? (
          <p className="download-app-note">
            Manual wave tagging works here; the desktop app adds overlay panels
            you can place over your game.
          </p>
        ) : null}
      </div>
      <div className="download-app-actions">
        {loading ? (
          <span className="download-app-status">Checking releases…</span>
        ) : release?.windowsUrl ? (
          <a
            className="btn btn-primary download-app-btn"
            href={release.windowsUrl}
            download
          >
            Download for Windows
          </a>
        ) : (
          <a
            className="btn btn-primary download-app-btn"
            href={releasesPage}
            target="_blank"
            rel="noopener noreferrer"
          >
            View releases
          </a>
        )}
        <a
          className="btn download-app-secondary"
          href={releasesPage}
          target="_blank"
          rel="noopener noreferrer"
        >
          All downloads
        </a>
      </div>
      {release?.tagName && !loading ? (
        <p className="download-app-version">
          Latest release: {release.tagName}
          {release.windowsUrl ? ` · ${release.windowsLabel}` : ""}
        </p>
      ) : null}
    </section>
  );
}
