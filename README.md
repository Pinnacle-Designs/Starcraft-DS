# Starcraft-DS

Live counter coach for **StarCraft II**. Capture your game screen in the browser, use vision AI to spot enemy units, and get real-time build suggestions based on community counter charts.

## Features

- **Screen capture** — Share your SC2 window or monitor via the browser (`getDisplayMedia`).
- **Local vision (Ollama)** — Each user runs Ollama on their own PC (auto-started by `npm run dev`; no shared API key).
- **Cloud vision (OpenAI)** — Optional `OPENAI_API_KEY` if you prefer cloud over local Ollama.
- **Overlay mode** — Pop out a compact coach window to place over the game (syncs with the main app).
- **Replay import** — Upload `.SC2Replay` files; extracts enemy units from tracker events.
- **Counter database** — Structured counters from [Osiris SC2 Guide](https://www.osirissc2guide.com/starcraft-2-counters-list.html), [Vaughn Royko charts](https://vaughnroyko.com/sciicounters/), and [Direct Strike guides](https://log.havrlant.cz/) (`data/counters.json`).
- **Manual mode** — Type enemy units (e.g. `Mutalisk, Roach`) without any vision provider.
- **Live coach** — Auto-analyzes every ~4.5 seconds while you play.

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

1. Start **Ollama** (`ollama serve`) if it is not already running  
2. Download the **llava** vision model on first run (`ollama pull llava`)  
3. Start the web app and API  

No OpenAI key required for live vision.

Your browser should open **http://localhost:5173** automatically.

> Do **not** open `client/index.html` directly in the browser — Vite must serve the app.

### Site won’t load?

1. From the repo root, run `npm run kill-ports` then `npm run dev`.
2. Use the URL Vite prints (should be **http://localhost:5173**).
3. If the API failed, check the terminal for `Port 3847 is already in use`.

1. Choose your race (Protoss / Terran / Zerg).
2. **Overlay:** click **Open overlay** and position the small window over SC2 (pin always-on-top with your OS if available).
3. **Replay:** upload a `.SC2Replay`, pick your player slot, click **Analyze replay**.
4. **Live play:** **Capture game screen** → **Live coach** (scans every ~4s). Needs **Ollama** or **OpenAI**, OR type enemy units in the manual field for live manual mode.
5. **No AI:** enter enemy units manually → **Get counters**.
6. **Picture-in-Picture:** while capturing, click **Pop out PiP** (Chrome/Edge) for a floating preview + live counters.
7. **Electron desktop:** `npm run electron:dev` — native always-on-top overlay with click-through.

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
| `client/` | React + Vite UI |
| `server/` | Express API, vision + counter lookup |
| `data/counters.json` | Unit weakness / counter matrix |
| `data/vision-system-prompt.txt` | AI training / inference prompt |

## How the AI is “trained”

This project does not ship a custom neural network. Instead:

1. **Knowledge base** — Counters are encoded in `data/counters.json` from the linked guides (hard vs soft counters, race-specific builds).
2. **Vision prompt** — `data/vision-system-prompt.txt` instructs the model which units to detect and how to return JSON.
3. **Runtime** — Frames go to local **Ollama** (`llava` by default) on each user’s machine, or optionally OpenAI; detected names are mapped through aliases and matched to your race’s counters.

To improve accuracy over time, extend `counters.json`, refine the vision prompt, or swap in a fine-tuned vision model using the same JSON schema.

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

## Limitations

- Browser capture requires Chromium/Edge/Firefox with display capture support.
- Vision quality depends on resolution, UI scale, and camera angle; manual tags are more reliable for ranked play.
- Counters are **guide-level** heuristics — upgrades, composition, and micro still matter (see Osiris “grain of salt” notes).

## License

Use counter data respectfully; guide content belongs to the original authors linked in `data/counters.json` meta.
