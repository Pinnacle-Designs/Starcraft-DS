import { useEffect, useState } from "react";
import { GITHUB_REPO, isStaticWebDeploy } from "./apiConfig";
import {
  resolveInstallerDownload,
  type InstallerDownloadInfo,
} from "./installerDownload";
import { isElectronApp } from "./overlaySync";

export function DownloadApp({ compact = false }: { compact?: boolean }) {
  const [installer, setInstaller] = useState<InstallerDownloadInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void resolveInstallerDownload().then((info) => {
      if (!cancelled) {
        setInstaller(info);
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
          <span className="download-app-status">Checking for installer…</span>
        ) : installer?.downloadUrl ? (
          <a
            className="btn btn-primary download-app-btn"
            href={installer.downloadUrl}
            rel="noopener noreferrer"
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
      </div>
      {installer && !loading ? (
        <p className="download-app-version">
          {installer.source === "hosted"
            ? "Windows installer"
            : `Latest release: ${installer.tagName}`}
          {" · "}
          {installer.fileName}
        </p>
      ) : null}
    </section>
  );
}
