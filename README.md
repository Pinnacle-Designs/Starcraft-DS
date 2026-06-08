# Starcraft-DS

Live counter coach for **StarCraft II**. Capture your game screen in the browser, use vision AI to spot enemy units, tag armies across three waves, import replays, and get real-time build suggestions from community counter charts.

## Features

| Area | What it does |
|------|----------------|
| **Screen capture** | Share your SC2 window or monitor via the browser (`getDisplayMedia`). |
| **Local vision (Ollama)** | Each user runs Ollama on their own PC (auto-started by `npm run dev`; no shared API key). |
| **Cloud vision (OpenAI)** | Optional `OPENAI_API_KEY` in `server/.env` if you prefer cloud over local Ollama. |
| **Live coach** | Auto-analyzes every ~4s (vision) or ~2s (manual-only) while capturing. |
| **Manual army builder** | Tag enemy units across **3 waves** (color-coded), per-unit counts, tech tiers from `data/unit-tiers.json`. |
| **Replay import** | Upload `.SC2Replay` files; extracts enemy units from tracker events. |
| **Capture history** | Saves recent JPEG frames in the browser for **7 days**; download or remove anytime (IndexedDB, not uploaded). |
| **Overlay mode** | Compact always-on-top coach window (`Open overlay`); syncs with the main app. |
| **Picture-in-Picture** | Floating preview + live counters in Chrome/Edge while capturing. |
| **Electron desktop** | Native overlay with always-on-top and click-through (`npm run electron:dev`). |
| **Counter database** | Structured counters from [Osiris SC2 Guide](https://www.osirissc2guide.com/starcraft-2-counters-list.html), [Vaughn Royko charts](https://vaughnroyko.com/sciicounters/), and [Direct Strike guides](https://log.havrlant.cz/) (`data/counters.json`). |

See **[UI wireframes](docs/wireframes.md)** for layout diagrams and user flows.

## Quick start

```bash
# From repo root
npm install
npm run install:all

# One-time per machine: install Ollama from https://ollama.com/download

# Optional: copy env (defaults to local Ollama per user)
cp server/.env.example server/.env

npm run dev
```

`npm run dev` will, for **each user on their own machine**:

1. Free ports **5173** and **3847** if needed (`kill-ports`)
2. Start **Ollama** (`ollama serve`) if it is not already running and pull **llava** on first run
3. Start the Express API and Vite client

No OpenAI key is required for live vision.

Your browser should open **http://localhost:5173** automatically.

### Live website (GitHub Pages)

The web UI is published at **https://david-foy89.github.io/Starcraft-DS/** on every push to `main`.

- **Browser site:** manual wave tagging and counter lookups (static data bundled with the site).
- **Desktop app:** screen capture, vision AI, replay import, and native overlays.

To enable Pages the first time: GitHub repo → **Settings** → **Pages** → **Build and deployment** → Source: **GitHub Actions**.

### Download the Windows app

1. Open [Releases](https://github.com/david-foy89/Starcraft-DS/releases/latest) and download **Starcraft-Coach-Setup-*.exe**.
2. Run the installer. The app starts a local API server and opens the coach window.
3. First launch may download the Ollama vision model (same as dev setup).

Maintainers: tag a release to build the installer automatically:

```bash
git tag v1.0.0
git push origin v1.0.0
```

> Do **not** open `client/index.html` directly in the browser — Vite must serve the app.

### Site won’t load?

1. From the repo root, run `npm run kill-ports` then `npm run dev`.
2. Use the URL Vite prints (should be **http://localhost:5173**).
3. If the API failed, check the terminal for `Port 3847 is already in use`.

### How to use (browser)

1. Choose your race (Protoss / Terran / Zerg) in the header.
2. **Overlay:** click **Open overlay** and position the small window over SC2 (pin always-on-top with your OS or use Electron).
3. **Replay:** upload a `.SC2Replay`, pick your player slot, click **Analyze replay**.
4. **Live play:** **Capture game screen** → **Live coach** (needs Ollama or OpenAI, or tagged enemy waves for manual live mode).
5. **Single frame:** **Analyze now** while capturing.
6. **Manual (no vision):** use the **enemy wave builder** — counters refresh as you edit; click **Refresh counters** to force an update.
7. **Save frames:** **Save snapshot** or automatic saves on analyze / live coach → expand **Recent captures** to download JPEGs (kept 7 days locally).
8. **Picture-in-Picture:** while capturing, click **Pop out PiP** (Chrome/Edge) for a floating preview + live counters.

API runs on **http://localhost:3847**

### Electron desktop app

```bash
npm run install:all
npm run electron:dev
```

Opens the main window plus a frameless overlay. In the overlay:

- **Always on top** — stays above StarCraft
- **Click-through** — pass mouse clicks to the game while reading suggestions

Use **Open overlay** in the main window to show the native overlay again.

### Picture-in-Picture (browser)

After **Capture game screen**, click **Pop out PiP**. The floating window shows your capture feed and updates counter suggestions when **Live coach** is on.

## Project layout

| Path | Purpose |
|------|---------|
| `client/` | React + Vite UI (capture, builder, history, overlay route) |
| `server/` | Express API, vision + counter lookup + replay parsing |
| `data/counters.json` | Unit weakness / counter matrix |
| `data/unit-tiers.json` | Tech tier labels for manual army builder sorting |
| `data/vision-system-prompt.txt` | Vision model instructions (JSON unit list) |
| `docs/wireframes.md` | UI wireframes and flow diagrams |
| `electron/` | Desktop shell and overlay window |

## Client modules (high level)

| Module | Role |
|--------|------|
| `App.tsx` | Main layout, capture controls, live coach wiring |
| `ManualArmyBuilder.tsx` | Three-wave enemy army editor |
| `CaptureHistoryPanel.tsx` | 7-day local capture list + download |
| `captureHistory.ts` | IndexedDB storage and pruning |
| `ReplayImport.tsx` | `.SC2Replay` upload flow |
| `SuggestionsPanel.tsx` | Detected units + counter cards |
| `Overlay.tsx` | Compact overlay route |
| `useLiveCoach.ts` | Polling analyze while live |
| `useScreenCapture.ts` | `getDisplayMedia` + frame grab |
| `overlaySync.ts` | Main ↔ overlay state sync |

## How the AI is “trained”

This project does not ship a custom neural network. Instead:

1. **Knowledge base** — Counters are encoded in `data/counters.json` from the linked guides (hard vs soft counters, race-specific builds).
2. **Vision prompt** — `data/vision-system-prompt.txt` instructs the model which units to detect and how to return JSON.
3. **Runtime** — Frames go to local **Ollama** (`llava` by default) on each user’s machine, or optionally OpenAI; detected names are mapped through aliases and matched to your race’s counters.

### Learning from your corrections

The app now saves **screenshot + labels** when you fix unit tags after a capture:

1. Capture with the hotkey or **Analyze now**
2. Correct enemy waves in the builder (or click **Train from labels**)
3. Samples are stored under `data/training/` on the API server
4. The next Ollama scans inject your recent corrections as few-shot examples in the vision prompt

Export everything for external fine-tuning:

```bash
npm run export-training
```

| Variable | Default | Description |
|----------|---------|-------------|
| `VISION_USE_TRAINING_EXAMPLES` | `true` | Inject saved corrections into Ollama prompts |
| `VISION_TRAINING_EXAMPLES_MAX` | `5` | How many examples to include per scan |
| `TRAINING_RETENTION_DAYS` | `10` | Delete training images older than this (local `data/training/`) |
| `TRAINING_MAX_SAMPLES` | `500` | Max stored screenshots (oldest removed after retention) |

To improve accuracy manually, extend `counters.json`, refine `vision-system-prompt.txt`, or fine-tune a vision model using exported JSONL.

## Environment

| Variable | Description |
|----------|-------------|
| `VISION_PROVIDER` | Default `ollama` (local per user) |
| `AUTO_START_OLLAMA` | Default `true` — run `ollama serve` + pull model on startup |
| `OLLAMA_BASE_URL` | Default `http://127.0.0.1:11434` |
| `OLLAMA_VISION_MODEL` | Default `llava` |
| `SKIP_OLLAMA_PULL` | Set `true` if the model is already downloaded |
| `OPENAI_API_KEY` | Optional cloud vision instead of Ollama |
| `OPENAI_VISION_MODEL` | Default `gpt-4o-mini` |
| `PORT` | API port (default `3847`) |

Copy `server/.env.example` to `server/.env` and restart `npm run dev` after changing keys.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server + vision provider status |
| `GET` | `/api/units` | Unit names, `byRace`, `tierByUnit` |
| `POST` | `/api/analyze` | Image and/or `manualUnits` → counters |
| `POST` | `/api/replay` | Upload replay → enemy units + counters |

Capture history is stored only in the browser (IndexedDB), not on the server.

## Limitations

- Browser capture requires Chromium/Edge/Firefox with display capture support.
- Vision quality depends on resolution, UI scale, and camera angle; manual wave tags are more reliable for ranked play.
- Capture history is per-browser; clearing site data removes saved frames.
- Counters are **guide-level** heuristics — upgrades, composition, and micro still matter (see Osiris “grain of salt” notes).

## License

Use counter data respectfully; guide content belongs to the original authors linked in `data/counters.json` meta.
