export const CAPTURE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DB_NAME = "starcraft-ds-captures";
const DB_VERSION = 1;
const STORE = "captures";
const MAX_CAPTURES = 100;
const LIVE_SAVE_INTERVAL_MS = 45_000;

export interface CaptureRecord {
  id: string;
  createdAt: number;
  summary?: string;
}

interface StoredCapture extends CaptureRecord {
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let lastLiveSaveAt = 0;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
  }
  return dbPromise;
}

function base64ToBlob(base64: string, mimeType = "image/jpeg"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function summarizeUnits(units: { name: string }[]): string | undefined {
  if (units.length === 0) return undefined;
  return units
    .slice(0, 6)
    .map((u) => u.name)
    .join(", ");
}

export function buildCaptureFilename(createdAt: number): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `sc2-capture-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function deleteById(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onerror = () => reject(req.error ?? new Error("Delete failed"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Delete transaction failed"));
  });
}

export async function pruneCaptureHistory(): Promise<void> {
  const cutoff = Date.now() - CAPTURE_RETENTION_MS;
  const db = await openDb();
  const all = await new Promise<StoredCapture[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as StoredCapture[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("Read failed"));
  });

  const toDelete = all
    .filter((c) => c.createdAt < cutoff)
    .map((c) => c.id);
  for (const id of toDelete) await deleteById(id);

  const remaining = all
    .filter((c) => c.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (remaining.length > MAX_CAPTURES) {
    for (const row of remaining.slice(MAX_CAPTURES)) {
      await deleteById(row.id);
    }
  }
}

export async function listCaptureHistory(): Promise<CaptureRecord[]> {
  await pruneCaptureHistory();
  const db = await openDb();
  const rows = await new Promise<StoredCapture[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as StoredCapture[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("Read failed"));
  });
  return rows
    .map(({ id, createdAt, summary }) => ({ id, createdAt, summary }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCaptureBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const row = await new Promise<StoredCapture | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoredCapture | undefined);
    req.onerror = () => reject(req.error ?? new Error("Read failed"));
  });
  return row?.blob ?? null;
}

export async function saveCaptureFromBase64(
  base64: string,
  options?: { summary?: string; throttleLive?: boolean }
): Promise<CaptureRecord | null> {
  if (!base64) return null;
  if (options?.throttleLive) {
    const now = Date.now();
    if (now - lastLiveSaveAt < LIVE_SAVE_INTERVAL_MS) return null;
    lastLiveSaveAt = now;
  }

  await pruneCaptureHistory();
  const record: StoredCapture = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    summary: options?.summary,
    blob: base64ToBlob(base64),
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.put(record);
    req.onerror = () => reject(req.error ?? new Error("Save failed"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Save transaction failed"));
  });

  return { id: record.id, createdAt: record.createdAt, summary: record.summary };
}

export async function saveCaptureFromAnalysis(
  base64: string,
  detectedUnits: { name: string }[],
  options?: { throttleLive?: boolean }
): Promise<CaptureRecord | null> {
  return saveCaptureFromBase64(base64, {
    summary: summarizeUnits(detectedUnits),
    throttleLive: options?.throttleLive,
  });
}

export async function deleteCapture(id: string): Promise<void> {
  await deleteById(id);
}

export async function clearCaptureHistory(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.clear();
    req.onerror = () => reject(req.error ?? new Error("Clear failed"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Clear transaction failed"));
  });
}
