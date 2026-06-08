const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

require("./copy-data-for-client.cjs");

const result = spawnSync("npm", ["run", "build", "--prefix", "client"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    GITHUB_PAGES: "true",
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

require("./postprocess-pages.cjs");
