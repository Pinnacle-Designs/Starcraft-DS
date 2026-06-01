import { useEffect, useState } from "react";

interface Props {
  videoFileName: string | null;
  onUpload: (file: File) => void;
}

export function VideoUpload({ videoFileName, onUpload }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(Boolean(videoFileName));
  }, [videoFileName]);

  return (
    <section className="panel-section replay-import">
      <button
        type="button"
        className="panel-section-toggle capture-section-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="panel-heading panel-heading-inline">Video upload</span>
        {videoFileName && (
          <span className="panel-section-status capture-section-status" title={videoFileName}>
            {videoFileName}
          </span>
        )}
        <span className="panel-section-chevron capture-history-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      <div
        className={`panel-section-body capture-section-body${open ? "" : " panel-section-body-collapsed capture-section-body-collapsed"}`}
        aria-hidden={!open}
      >
        <p className="status">
          Upload a recording to analyze frames with vision AI — MP4, WebM, MOV,
          MKV, and other video formats supported by your browser.
        </p>
        <div className="file-picker">
          <input
            id="video-file"
            type="file"
            className="file-picker-input"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
          <label htmlFor="video-file" className="btn file-picker-btn">
            {videoFileName ? "Change video" : "Upload video"}
          </label>
          {videoFileName && (
            <span className="file-picker-name" title={videoFileName}>
              {videoFileName}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
