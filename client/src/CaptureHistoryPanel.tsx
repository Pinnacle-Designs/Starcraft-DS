import { useCallback, useEffect, useState } from "react";
import {
  buildCaptureFilename,
  CAPTURE_RETENTION_MS,
  clearCaptureHistory,
  deleteCapture,
  downloadBlob,
  getCaptureBlob,
  listCaptureHistory,
  type CaptureRecord,
} from "./captureHistory";

interface Props {
  refreshKey: number;
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CaptureThumb({
  record,
  onDeleted,
}: {
  record: CaptureRecord;
  onDeleted: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    void getCaptureBlob(record.id).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setThumbUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [record.id]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await getCaptureBlob(record.id);
      if (!blob) return;
      downloadBlob(blob, buildCaptureFilename(record.createdAt));
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    await deleteCapture(record.id);
    onDeleted();
  };

  return (
    <li className="capture-item">
      <div className="capture-thumb-wrap">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="capture-thumb"
            loading="lazy"
          />
        ) : (
          <div className="capture-thumb capture-thumb-placeholder" />
        )}
      </div>
      <div className="capture-meta">
        <time className="capture-time" dateTime={new Date(record.createdAt).toISOString()}>
          {formatWhen(record.createdAt)}
        </time>
        {record.summary && (
          <p className="capture-summary" title={record.summary}>
            {record.summary}
          </p>
        )}
        <div className="capture-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={downloading}
            onClick={() => void handleDownload()}
          >
            {downloading ? "…" : "Download"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => void handleDelete()}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export function CaptureHistoryPanel({ refreshKey }: Props) {
  const [items, setItems] = useState<CaptureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listCaptureHistory());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [refreshKey, reload]);

  const retentionDays = Math.round(CAPTURE_RETENTION_MS / (24 * 60 * 60 * 1000));

  return (
    <section className="panel-section-nested capture-history">
      <button
        type="button"
        className="panel-section-toggle capture-history-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="panel-heading panel-heading-inline">Recent captures</span>
        <span className="panel-section-count capture-history-count">
          {loading ? "…" : items.length}
        </span>
        <span className="panel-section-chevron capture-history-chevron" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <>
          <p className="status capture-history-hint">
            Saved locally in your browser for {retentionDays} days. Download as
            JPEG anytime.
          </p>
          {items.length === 0 && !loading ? (
            <p className="status">No saved captures yet — analyze a frame or use Save snapshot.</p>
          ) : (
            <ul className="capture-list">
              {items.map((record) => (
                <CaptureThumb
                  key={record.id}
                  record={record}
                  onDeleted={() => void reload()}
                />
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                if (
                  window.confirm(
                    `Remove all ${items.length} saved captures from this browser?`
                  )
                ) {
                  void clearCaptureHistory().then(() => void reload());
                }
              }}
            >
              Clear all
            </button>
          )}
        </>
      )}
    </section>
  );
}
