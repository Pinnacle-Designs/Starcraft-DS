/**
 * Ensures each user has a local Ollama instance for vision AI:
 * - Starts `ollama serve` if the API is not reachable
 * - Pulls the vision model on first run (if missing)
 *
 * Requires Ollama installed: https://ollama.com/download
 */
const { spawn, spawnSync } = require("child_process");

const QUIET = process.argv.includes("--quiet");
const BASE = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(
  /\/$/,
  ""
);
const MODEL = process.env.OLLAMA_VISION_MODEL || "llava";
const SKIP_PULL = process.env.SKIP_OLLAMA_PULL === "true";
const WAIT_MS = Number(process.env.OLLAMA_STARTUP_WAIT_MS || 45000);

function log(...args) {
  if (!QUIET) console.log("[ollama]", ...args);
}

function warn(...args) {
  console.warn("[ollama]", ...args);
}

function ollamaInstalled() {
  try {
    const cmd = process.platform === "win32" ? "where ollama" : "which ollama";
    const result = spawnSync(cmd, { shell: true, encoding: "utf8" });
    return result.status === 0 && Boolean(result.stdout?.trim());
  } catch {
    return false;
  }
}

async function fetchTags() {
  const res = await fetch(`${BASE}/api/tags`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  return res.json();
}

function startOllamaServe() {
  log("Starting local Ollama (ollama serve)…");
  const child = spawn("ollama", ["serve"], {
    detached: true,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  child.unref();
}

function modelInstalled(tags, model) {
  const models = tags?.models ?? [];
  const key = model.toLowerCase();
  return models.some((m) => {
    const name = (m.name || "").toLowerCase();
    return name === key || name.startsWith(`${key}:`);
  });
}

function pullModel(model) {
  log(
    `Downloading vision model "${model}" for this machine (first time only; can take a few minutes)…`
  );
  const result = spawnSync("ollama", ["pull", model], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForOllama() {
  const start = Date.now();
  while (Date.now() - start < WAIT_MS) {
    try {
      const tags = await fetchTags();
      if (tags) return tags;
    } catch {
      /* not ready */
    }
    await sleep(800);
  }
  return null;
}

async function main() {
  if (!ollamaInstalled()) {
    warn(
      "Ollama is not installed on this PC. Install it once per user/machine:"
    );
    warn("  https://ollama.com/download");
    warn("Live vision AI will be off until Ollama is installed.");
    process.exit(0);
  }

  let tags = null;
  try {
    tags = await fetchTags();
  } catch {
    tags = null;
  }

  if (!tags) {
    startOllamaServe();
    tags = await waitForOllama();
  }

  if (!tags) {
    warn(`Ollama did not respond at ${BASE} within ${WAIT_MS / 1000}s.`);
    warn("Try running `ollama serve` in a terminal, then restart the app.");
    process.exit(0);
  }

  log(`Ollama API ready at ${BASE}`);

  if (SKIP_PULL) {
    if (modelInstalled(tags, MODEL)) {
      log(`Vision model "${MODEL}" is available.`);
    } else {
      warn(`Model "${MODEL}" not found. Run: ollama pull ${MODEL}`);
    }
    process.exit(0);
  }

  if (!modelInstalled(tags, MODEL)) {
    const ok = pullModel(MODEL);
    if (!ok) {
      warn(`Could not pull "${MODEL}". Run manually: ollama pull ${MODEL}`);
      process.exit(0);
    }
    tags = await fetchTags();
  }

  if (modelInstalled(tags, MODEL)) {
    log(`Vision model "${MODEL}" is ready for this user.`);
  }

  process.exit(0);
}

main().catch((err) => {
  warn(err instanceof Error ? err.message : String(err));
  process.exit(0);
});
