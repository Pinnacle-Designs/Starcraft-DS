/**
 * Build Electron / NSIS icons from the site logo.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const src = path.join(root, "client", "public", "starcraft-coach-logo.png");
const buildDir = path.join(root, "build");
const electronIcon = path.join(root, "electron", "app-icon.png");

async function main() {
  if (!fs.existsSync(src)) {
    console.error("[icon] missing client/public/starcraft-coach-logo.png");
    process.exit(1);
  }

  fs.mkdirSync(buildDir, { recursive: true });
  const bg = { r: 10, g: 12, b: 15, alpha: 1 };

  await sharp(src)
    .resize(512, 512, { fit: "contain", background: bg })
    .png()
    .toFile(path.join(buildDir, "icon.png"));
  await sharp(src)
    .resize(256, 256, { fit: "contain", background: bg })
    .png()
    .toFile(electronIcon);
  console.log("[icon] wrote build/icon.png and electron/app-icon.png");
}

if (require.main === module) {
  void main().catch((err) => {
    console.error("[icon]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  module.exports = { main };
}
