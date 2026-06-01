import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  getAllUnitNames,
  getSuggestions,
  getUnitTiersMap,
  getUnitsByRace,
  normalizeUnitName,
  type PlayerRace,
} from "./counterService.js";
import { listReplayPlayers, parseReplayBuffer } from "./replayService.js";
import { startOllamaForUser } from "./ollamaManager.js";
import {
  analyzeScreenshot,
  detectFromText,
  getVisionStatus,
} from "./vision/index.js";

startOllamaForUser();

const app = express();
const PORT = Number(process.env.PORT) || 3847;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", async (_req, res) => {
  const vision = await getVisionStatus();
  res.json({
    ok: true,
    vision: vision.active !== null,
    visionProviders: vision,
    units: getAllUnitNames().length,
  });
});

app.get("/api/units", (_req, res) => {
  res.json({
    units: getAllUnitNames(),
    byRace: getUnitsByRace(),
    tierByUnit: getUnitTiersMap(),
  });
});

function parseManualUnits(
  input: unknown
): { name: string; count: number; wave?: 1 | 2 | 3 }[] {
  if (!Array.isArray(input)) return [];
  const out: { name: string; count: number; wave?: 1 | 2 | 3 }[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      const name = normalizeUnitName(item);
      if (name) out.push({ name, count: 1 });
      continue;
    }
    if (item && typeof item === "object" && "name" in item) {
      const name = normalizeUnitName(String((item as { name: string }).name));
      const count = Math.max(
        0,
        Math.floor(Number((item as { count?: number }).count) || 0)
      );
      const rawWave = Number((item as { wave?: number }).wave);
      const wave =
        rawWave === 1 || rawWave === 2 || rawWave === 3 ? rawWave : undefined;
      if (name && count > 0) out.push({ name, count, wave });
    }
  }
  return out;
}

app.post("/api/analyze", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", playerRace, manualUnits } =
      req.body as {
        imageBase64?: string;
        mimeType?: string;
        playerRace?: PlayerRace;
        manualUnits?: Array<
          string | { name: string; count?: number; wave?: number }
        >;
      };

    let detected: {
      name: string;
      confidence: string;
      notes?: string;
      wave?: 1 | 2 | 3;
    }[] = [];
    let mode: "ai" | "heuristic" = "heuristic";
    let scene: string | undefined;
    let provider: string | undefined;

    const parsedManual = parseManualUnits(manualUnits);
    if (parsedManual.length) {
      detected = parsedManual.map(({ name, count, wave }) => ({
        name,
        confidence: "high" as const,
        notes: count > 1 ? `×${count}` : undefined,
        wave,
      }));
      mode = "heuristic";
    } else if (imageBase64) {
      const vision = await analyzeScreenshot(imageBase64, mimeType);
      detected = vision.detectedUnits;
      mode = vision.mode;
      scene = vision.scene;
      provider = vision.provider;
    } else {
      res.status(400).json({ error: "imageBase64 or manualUnits required" });
      return;
    }

    const race = playerRace ?? "Terran";
    const enemyNames = detected.map((d) => d.name);
    const suggestions = getSuggestions(enemyNames, race);

    res.json({
      detectedUnits: detected,
      suggestions,
      playerRace: race,
      mode,
      scene,
      provider,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Analysis failed",
    });
  }
});

app.post("/api/suggest", (req, res) => {
  const { enemyUnits, playerRace, text } = req.body as {
    enemyUnits?: string[];
    playerRace?: PlayerRace;
    text?: string;
  };

  const race = playerRace ?? "Terran";
  let units = enemyUnits ?? [];

  if (text) {
    const fromText = detectFromText(text);
    units = [...units, ...fromText.detectedUnits.map((d) => d.name)];
  }

  const suggestions = getSuggestions(units, race);
  res.json({ suggestions, playerRace: race });
});

app.post("/api/replay/inspect", upload.single("replay"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Upload a .SC2Replay file" });
      return;
    }
    const meta = await listReplayPlayers(req.file.buffer);
    res.json(meta);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Replay inspect failed",
    });
  }
});

app.post("/api/replay", upload.single("replay"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Upload a .SC2Replay file" });
      return;
    }

    const playerRace = (req.body.playerRace as PlayerRace) ?? "Terran";
    const myPlayerSlot = Number(req.body.myPlayerSlot ?? 0);
    const atGameSeconds = req.body.atGameSeconds
      ? Number(req.body.atGameSeconds)
      : undefined;

    const parsed = await parseReplayBuffer(req.file.buffer, {
      myPlayerSlot,
      atGameSeconds,
    });

    const suggestions = getSuggestions(parsed.enemyUnits, playerRace);
    const detectedUnits = parsed.enemyUnits.map((name) => ({
      name,
      confidence: "high",
      notes: `replay (${parsed.method})`,
    }));

    res.json({
      ...parsed,
      detectedUnits,
      suggestions,
      playerRace,
      mode: "heuristic" as const,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({
      error: err instanceof Error ? err.message : "Replay parse failed",
    });
  }
});

const httpServer = app.listen(PORT, async () => {
  const vision = await getVisionStatus();
  console.log(`Starcraft-DS API http://localhost:${PORT}`);
  if (vision.active) {
    console.log(`Vision: ${vision.active}`);
  } else {
    console.warn(
      "Vision off — start Ollama (ollama pull llava) or set OPENAI_API_KEY"
    );
  }
});

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use (another API instance is running).`,
      "\nRun: npm run kill-ports",
      "\nThen: npm run dev\n"
    );
    process.exit(1);
  }
  throw err;
});
