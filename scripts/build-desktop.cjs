const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const indexHtml = path.join(root, "client", "dist", "index.html");

require("./copy-data-for-client.cjs");

function run(label, args, env = {}) {
  const result = spawnSync("npm", args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`[desktop] ${label} failed`);
    process.exit(result.status ?? 1);
  }
}

run("server build", ["run", "build", "--prefix", "server"]);
run("client build", ["run", "build", "--prefix", "client"], {
  DESKTOP_BUILD: "true",
});

if (!fs.existsSync(indexHtml)) {
  console.error("[desktop] client/dist/index.html missing after build");
  process.exit(1);
}

const html = fs.readFileSync(indexHtml, "utf8");
if (/\ssrc="\/assets\//.test(html) || /\shref="\/assets\//.test(html)) {
  console.error(
    "[desktop] client build still uses absolute /assets paths — Electron will show a blank window"
  );
  process.exit(1);
}

console.log("[desktop] build ready for electron-builder");
