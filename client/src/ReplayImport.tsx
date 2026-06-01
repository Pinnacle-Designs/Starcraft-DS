import { useState } from "react";
import {
  analyzeReplay,
  inspectReplay,
  type AnalyzeResponse,
  type PlayerRace,
  type ReplayPlayerInfo,
} from "./api";

interface Props {
  playerRace: PlayerRace;
  onResult: (result: AnalyzeResponse) => void;
  onError: (msg: string) => void;
}

export function ReplayImport({ playerRace, onResult, onError }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [players, setPlayers] = useState<ReplayPlayerInfo[]>([]);
  const [mySlot, setMySlot] = useState(0);
  const [mapTitle, setMapTitle] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [atMinutes, setAtMinutes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    onError("");
    try {
      const meta = await inspectReplay(f);
      setPlayers(meta.players);
      setMapTitle(meta.mapTitle);
      setDuration(meta.durationSeconds);
      setMySlot(0);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not read replay");
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    onError("");
    try {
      const atGameSeconds = atMinutes
        ? Math.floor(parseFloat(atMinutes) * 60)
        : undefined;
      const data = await analyzeReplay(file, {
        playerRace,
        myPlayerSlot: mySlot,
        atGameSeconds,
      });
      onResult(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Replay analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="replay-import panel-inner">
      <h3 className="section-title">Replay import</h3>
      <p className="status">
        Upload a <strong>.SC2Replay</strong> to extract enemy units and suggest
        counters (no screen capture needed).
      </p>
      <input
        type="file"
        accept=".SC2Replay,.sc2replay"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {mapTitle && (
        <p className="status">
          Map: {mapTitle}
          {duration > 0 && ` · ${Math.round(duration / 60)} min`}
        </p>
      )}

      {players.length > 0 && (
        <>
          <label className="status" htmlFor="replay-slot">
            You played as
          </label>
          <select
            id="replay-slot"
            className="manual-input"
            value={mySlot}
            onChange={(e) => setMySlot(Number(e.target.value))}
          >
            {players.map((p) => (
              <option key={p.slot} value={p.slot}>
                {p.name} ({p.race}) — {p.result}
              </option>
            ))}
          </select>

          <label className="status" htmlFor="replay-time">
            Analyze army at minute (optional, blank = whole game)
          </label>
          <input
            id="replay-time"
            className="manual-input"
            placeholder="e.g. 8"
            value={atMinutes}
            onChange={(e) => setAtMinutes(e.target.value)}
          />

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: "0.5rem" }}
            disabled={loading || !file}
            onClick={() => void handleAnalyze()}
          >
            {loading ? "Parsing replay…" : "Analyze replay"}
          </button>
        </>
      )}
    </div>
  );
}
