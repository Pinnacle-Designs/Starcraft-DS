/**
 * Prints installer paths and Cloudflare R2 hosting steps after a release build.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);

if (!fs.existsSync(releaseDir)) {
  console.error("[publish] release/ folder not found — run npm run dist:win first");
  process.exit(1);
}

const files = fs.readdirSync(releaseDir);
const installer =
  files.find((name) => /^Starcraft-Coach-Setup-.+\.exe$/i.test(name)) ??
  files.find((name) => name.endsWith(".exe"));

if (!installer) {
  console.error("[publish] no .exe installer found in release/");
  process.exit(1);
}

const stableName = "Starcraft-Coach-Setup.exe";
const hostedUrl =
  process.env.INSTALLER_HOSTED_URL ??
  `https://downloads.starcraftcoach.com/${stableName}`;

console.log("");
console.log("Installer built:");
console.log(`  ${path.join(releaseDir, installer)}`);
console.log("");
console.log("Cloudflare (recommended):");
console.log("  1. R2 → create bucket (e.g. starcraft-coach-downloads)");
console.log("  2. R2 → bucket → Settings → Public access → Custom domain");
console.log("     downloads.starcraftcoach.com");
console.log(`  3. Upload as ${stableName}:`);
console.log("       npm run upload-installer:r2");
console.log("     (needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)");
console.log("");
console.log("Public download URL for the website button:");
console.log(`  ${hostedUrl}`);
console.log("");
console.log("Set in .github/workflows/deploy-pages.yml:");
console.log(`  VITE_WINDOWS_INSTALLER_URL: "${hostedUrl}"`);
console.log("");
