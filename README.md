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

The web UI is published at **https://starcraftcoach.com** (and **https://pinnacle-designs.github.io/Starcraft-DS/**) on every push to `main`.

- **Browser site:** manual wave tagging and counter lookups (static data bundled with the site).
- **Desktop app:** always-on-top overlays and a dedicated coach window.

To enable Pages the first time: GitHub repo → **Settings** → **Pages** → **Build and deployment** → Source: **GitHub Actions**.

### Cloudflare setup (starcraftcoach.com)

The site and installer use Cloudflare in front of GitHub Pages and R2.

**Website (GitHub Pages + custom domain)**

1. **Cloudflare DNS** → add a `CNAME` for `@` or `www` pointing to `pinnacle-designs.github.io` (or the GitHub Pages host shown in repo Settings → Pages).
2. **SSL/TLS** → **Full** (GitHub Pages provides HTTPS; Cloudflare proxies it).
3. Keep the `CNAME` file in `client/public/CNAME` as `starcraftcoach.com`.

**Installer downloads (Cloudflare R2)**

GitHub Pages is for the web app only — host the `.exe` on **R2**, not in the Pages artifact.

1. **R2** → Create bucket (e.g. `starcraft-coach-downloads`).
2. **R2** → bucket → **Settings** → **Public access** → **Custom domain** → `downloads.starcraftcoach.com` (Cloudflare adds DNS automatically).
3. **R2** → **Manage R2 API tokens** → create token with Object Read & Write on that bucket.
4. Add GitHub repo **Secrets** (for CI upload after each release):

   | Secret | Value |
   |--------|--------|
   | `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → account ID |
   | `R2_ACCESS_KEY_ID` | R2 API token access key |
   | `R2_SECRET_ACCESS_KEY` | R2 API token secret |
   | `R2_BUCKET` | Bucket name |

5. After tagging a release, CI uploads `Starcraft-Coach-Setup.exe` to R2. Locally: `npm run upload-installer:r2` after `npm run dist:win`.

The download button uses `https://downloads.starcraftcoach.com/Starcraft-Coach-Setup.exe` (`VITE_WINDOWS_INSTALLER_URL` in the Pages workflow).

### Download the Windows app

Click **Download for Windows** on [starcraftcoach.com](https://starcraftcoach.com) or get the latest build from [GitHub Releases](https://github.com/pinnacle-designs/Starcraft-DS/releases/latest).

Run the installer — it adds Starcraft Coach under Program Files, starts the local API, and opens the coach window. Installed apps also check for updates automatically.

### Shipping a new desktop build (maintainers)

This project already packages with **electron-builder** (NSIS `.exe` on Windows, `.dmg` on macOS) — the same role as Inno Setup or Advanced Installer.

**Step 1 — Package**

```bash
npm run dist:win    # Windows: release/Starcraft-Coach-Setup-<version>.exe
npm run dist:mac    # macOS: release/Starcraft-Coach-<version>.dmg
```

Or tag a release and let CI build:

```bash
# bump version in package.json first
git tag v1.0.1
git push origin v1.0.1
```

**Step 2 — Sign (strongly recommended)**

Unsigned installers trigger Windows SmartScreen / macOS Gatekeeper warnings.

| OS | What you need |
|----|----------------|
| **Windows** | Code signing certificate (DigiCert, Sectigo, Azure Trusted Signing). Add GitHub secrets `WIN_CSC_LINK` (base64 `.pfx`) and `WIN_CSC_KEY_PASSWORD`. CI passes them as `CSC_LINK` / `CSC_KEY_PASSWORD` to electron-builder. |
| **macOS** | Apple Developer ID + notarization (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). |

**Step 3 — Host on Cloudflare R2**

Upload the signed `.exe` to R2 as `Starcraft-Coach-Setup.exe` on custom domain `downloads.starcraftcoach.com`. CI does this automatically when R2 secrets are set; or run `npm run upload-installer:r2` locally.

(GitHub Releases remains the fallback and powers in-app auto-update.)

**Step 4 — Website download button**

`VITE_WINDOWS_INSTALLER_URL` in `.github/workflows/deploy-pages.yml` points at the R2 URL. The button uses the HTML `download` attribute so browsers save the file instead of opening it.

**Step 5 — Auto-update**

Tagged CI releases publish `latest.yml` so installed apps show an **Update available** banner. Run `npm run print-installer-url` after a local build to see upload paths and env vars.

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
