import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { checkOllamaAvailable } from "./vision/ollamaVision.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ensureScript = join(__dirname, "../../scripts/ensure-ollama.cjs");

let ensureStarted = false;

/** Start Ollama locally for this user if AUTO_START_OLLAMA is enabled (default on). */
export function startOllamaForUser(): void {
  if (process.env.AUTO_START_OLLAMA === "false") return;
  if (ensureStarted) return;
  ensureStarted = true;

  void (async () => {
    const already = await checkOllamaAvailable();
    if (already) return;

    const child = spawn(process.execPath, [ensureScript, "--quiet"], {
      cwd: join(__dirname, "../.."),
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  })();
}
