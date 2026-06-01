export type PlayerRace = "Protoss" | "Terran" | "Zerg";

export interface ManualUnitInput {
  name: string;
  count: number;
  wave?: 1 | 2 | 3;
}

export interface DetectedUnit {
  name: string;
  confidence: string;
  notes?: string;
  wave?: 1 | 2 | 3;
}

export type UnitsByRace = Record<PlayerRace, string[]>;

export type TeamWaves = [PlayerRace, PlayerRace | null, PlayerRace | null];

/** How many waves your active team is ahead of enemy tags (0–2). */
export type WaveShift = 0 | 1 | 2;

export interface CounterBuildCount {
  name: string;
  suggested?: number;
  role: "primary" | "alternative";
}

export interface CounterSuggestion {
  enemyUnit: string;
  build: string[];
  buildCounts?: CounterBuildCount[];
  enemyCount?: number;
  counterType: "hard" | "soft" | "general";
  tip?: string;
  playerRace?: PlayerRace;
  /** Which of your team waves supplied the counter race. */
  teamWave?: 1 | 2 | 3;
  /** Enemy wave tag (1–3) this suggestion was generated from. */
  enemyWave?: 1 | 2 | 3;
}

export interface AnalyzeResponse {
  detectedUnits: DetectedUnit[];
  suggestions: CounterSuggestion[];
  playerRace: PlayerRace;
  teamRaces?: TeamWaves;
  waveShift?: WaveShift;
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

export interface UnitCatalog {
  byRace: UnitsByRace;
  tierByUnit: Record<string, number>;
}

export async function fetchUnitCatalog(): Promise<UnitCatalog> {
  const res = await fetch("/api/units");
  if (!res.ok) throw new Error("Failed to load units");
  const data = (await res.json()) as UnitCatalog;
  return { byRace: data.byRace, tierByUnit: data.tierByUnit ?? {} };
}

export async function analyzeFrame(
  imageBase64: string,
  teamRaces: TeamWaves,
  manualUnits?: ManualUnitInput[],
  waveShift: WaveShift = 0
): Promise<AnalyzeResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: imageBase64 || undefined,
      mimeType: "image/jpeg",
      playerRace: teamRaces[0],
      teamRaces,
      waveShift,
      manualUnits: manualUnits?.length ? manualUnits : undefined,
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
