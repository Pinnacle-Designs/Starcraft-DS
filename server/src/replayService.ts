import { SC2Replay } from "sc2ts";
import type { Player, TrackerEvent } from "sc2ts";

type UnitBornEvent = TrackerEvent & {
  m_unitTypeName?: string;
  m_controlPlayerId?: number;
};
import { getAllUnitNames, normalizeUnitName } from "./counterService.js";

const WORKERS = new Set(["SCV", "Probe", "Drone", "MULE"]);
const LOOPS_PER_SECOND = 16;

export interface ReplayPlayerInfo {
  slot: number;
  name: string;
  race: string;
  result: string;
}

export interface ReplayParseResult {
  mapTitle: string | null;
  durationSeconds: number;
  players: ReplayPlayerInfo[];
  enemyUnits: string[];
  unitCounts: Record<string, number>;
  method: "tracker" | "scan";
}

function resultLabel(result: number): string {
  if (result === 1) return "Win";
  if (result === 2) return "Loss";
  if (result === 4) return "Draw";
  return "Unknown";
}

function isMilitaryUnit(typeName: string): boolean {
  const canonical = normalizeUnitName(typeName);
  if (!canonical) return false;
  if (WORKERS.has(canonical)) return false;
  return getAllUnitNames().includes(canonical);
}

function scanBufferForUnits(buffer: Buffer): Record<string, number> {
  const text = buffer.toString("latin1");
  const counts: Record<string, number> = {};
  for (const name of getAllUnitNames()) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = text.match(re);
    if (matches && matches.length > 0) {
      counts[name] = matches.length;
    }
  }
  return counts;
}

function extractEnemyUnitsFromTracker(
  replay: SC2Replay,
  myPlayerId: number,
  maxLoop?: number
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const ev of replay.trackerEvents) {
    if (maxLoop !== undefined && ev.loop > maxLoop) continue;
    const born = ev as UnitBornEvent;
    const typeName = born.m_unitTypeName;
    if (!typeName) continue;

    const isBorn =
      ev._event === "NUnitBorn" ||
      ev.eventType === "NUnitBorn" ||
      String(ev._event ?? "").includes("UnitBorn");
    if (!isBorn) continue;

    const controlId = born.m_controlPlayerId;
    if (controlId === undefined || controlId === myPlayerId) continue;
    if (!isMilitaryUnit(typeName)) continue;

    const name = normalizeUnitName(typeName);
    if (!name) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }

  return counts;
}

function mapPlayers(players: Player[]): ReplayPlayerInfo[] {
  return players.map((p, slot) => ({
    slot,
    name: p.name || `Player ${slot + 1}`,
    race: p.race || "Unknown",
    result: resultLabel(p.result),
  }));
}

export async function parseReplayBuffer(
  buffer: Buffer,
  options: {
    myPlayerSlot: number;
    atGameSeconds?: number;
  }
): Promise<ReplayParseResult> {
  let replay: SC2Replay;
  try {
    replay = await SC2Replay.fromBuffer(buffer, {
      decodeTrackerEvents: true,
      decodeGameEvents: false,
      decodeMessageEvents: false,
    });
  } catch {
    const scanned = scanBufferForUnits(buffer);
    return {
      mapTitle: null,
      durationSeconds: 0,
      players: [],
      enemyUnits: Object.keys(scanned),
      unitCounts: scanned,
      method: "scan",
    };
  }

  const players = replay.players ?? [];
  const myPlayerId = options.myPlayerSlot + 1;
  const maxLoop =
    options.atGameSeconds !== undefined
      ? Math.floor(options.atGameSeconds * LOOPS_PER_SECOND)
      : undefined;

  let unitCounts = extractEnemyUnitsFromTracker(replay, myPlayerId, maxLoop);

  if (Object.keys(unitCounts).length === 0) {
    unitCounts = scanBufferForUnits(buffer);
  }

  const enemyUnits = Object.entries(unitCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const details = replay.replayDetails;
  const mapTitle =
    details && typeof details === "object" && "title" in details
      ? String((details as { title?: string }).title ?? "")
      : null;

  return {
    mapTitle: mapTitle || null,
    durationSeconds: replay.duration ?? 0,
    players: mapPlayers(players),
    enemyUnits,
    unitCounts,
    method: Object.keys(unitCounts).length > 0 ? "tracker" : "scan",
  };
}

export async function listReplayPlayers(
  buffer: Buffer
): Promise<{ players: ReplayPlayerInfo[]; mapTitle: string | null; durationSeconds: number }> {
  try {
    const replay = await SC2Replay.fromBuffer(buffer, {
      decodeTrackerEvents: false,
      decodeGameEvents: false,
    });
    const details = replay.replayDetails;
    const mapTitle =
      details && typeof details === "object" && "title" in details
        ? String((details as { title?: string }).title ?? "")
        : null;
    return {
      players: mapPlayers(replay.players ?? []),
      mapTitle,
      durationSeconds: replay.duration ?? 0,
    };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Could not read replay file"
    );
  }
}
