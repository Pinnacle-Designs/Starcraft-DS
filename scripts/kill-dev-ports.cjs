/**
 * Frees ports used by Starcraft-DS dev (stale npm run dev / electron sessions).
 */
const { execSync } = require("child_process");

const PORTS = [3847, 5173, 5174, 5175];

function killPortWin(port) {
  let out = "";
  try {
    out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split("\n")) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`  stopped PID ${pid} (port ${port})`);
    } catch {
      /* already gone */
    }
  }
}

function killPortUnix(port) {
  try {
    execSync(`lsof -ti :${port} | xargs -r kill -9`, {
      stdio: "ignore",
      shell: true,
    });
    console.log(`  cleared port ${port}`);
  } catch {
    /* nothing listening */
  }
}

console.log("Checking dev ports…");
for (const port of PORTS) {
  if (process.platform === "win32") killPortWin(port);
  else killPortUnix(port);
}
