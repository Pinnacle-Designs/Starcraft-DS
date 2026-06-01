import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  getAllUnitNames,
  getSuggestions,
  normalizeUnitName,
  type PlayerRace,
} from "./counterService.js";
import { listReplayPlayers, parseReplayBuffer } from "./replayService.js";
import {
  analyzeScreenshot,
  detectFromText,
  getVisionStatus,
} from "./vision/index.js";

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
  res.json({ units: getAllUnitNames() });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", playerRace, manualUnits } =
      req.body as {
        imageBase64?: string;
        mimeType?: string;
        playerRace?: PlayerRace;
        manualUnits?: string[];
      };

    let detected: { name: string; confidence: string; notes?: string }[] = [];
    let mode: "ai" | "heuristic" = "heuristic";
    let scene: string | undefined;
    let provider: string | undefined;

    if (manualUnits?.length) {
      detected = manualUnits
        .map((n) => {
          const canonical = normalizeUnitName(n);
          return canonical
            ? { name: canonical, confidence: "high" as const }
            : null;
        })
        .filter((u): u is { name: string; confidence: "high" } => u !== null);
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

app.listen(PORT, async () => {
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
