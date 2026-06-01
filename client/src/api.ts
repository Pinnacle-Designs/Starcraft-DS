export type PlayerRace = "Protoss" | "Terran" | "Zerg";

export interface CounterSuggestion {
  enemyUnit: string;
  build: string[];
  counterType: "hard" | "soft" | "general";
  tip?: string;
}

export interface AnalyzeResponse {
  detectedUnits: { name: string; confidence: string; notes?: string }[];
  suggestions: CounterSuggestion[];
  playerRace: PlayerRace;
  mode: "ai" | "heuristic";
  provider?: "openai" | "ollama";
  scene?: string;
}

export interface VisionProviders {
  openai: boolean;
  ollama: boolean;
  active: "auto" | "openai" | "ollama" | null;
}

export interface ReplayPlayerInfo {
  slot: number;
  name: string;
  race: string;
  result: string;
}

export async function analyzeFrame(
  imageBase64: string,
  playerRace: PlayerRace,
  manualUnits?: string[]
): Promise<AnalyzeResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: imageBase64 || undefined,
      mimeType: "image/jpeg",
      playerRace,
      manualUnits,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<AnalyzeResponse>;
}

export async function fetchHealth(): Promise<{
  ok: boolean;
  vision: boolean;
  visionProviders: VisionProviders;
}> {
  const res = await fetch("/api/health");
  return res.json() as Promise<{
    ok: boolean;
    vision: boolean;
    visionProviders: VisionProviders;
  }>;
}

export async function inspectReplay(file: File): Promise<{
  players: ReplayPlayerInfo[];
  mapTitle: string | null;
  durationSeconds: number;
}> {
  const form = new FormData();
  form.append("replay", file);
  const res = await fetch("/api/replay/inspect", { method: "POST", body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Replay inspect failed");
  }
  return res.json() as Promise<{
    players: ReplayPlayerInfo[];
    mapTitle: string | null;
    durationSeconds: number;
  }>;
}

export async function analyzeReplay(
  file: File,
  options: {
    playerRace: PlayerRace;
    myPlayerSlot: number;
    atGameSeconds?: number;
  }
): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("replay", file);
  form.append("playerRace", options.playerRace);
  form.append("myPlayerSlot", String(options.myPlayerSlot));
  if (options.atGameSeconds !== undefined) {
    form.append("atGameSeconds", String(options.atGameSeconds));
  }
  const res = await fetch("/api/replay", { method: "POST", body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Replay analysis failed");
  }
  return res.json() as Promise<AnalyzeResponse>;
}
