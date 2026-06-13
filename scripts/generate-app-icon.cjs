/**
 * Build Electron / NSIS icons from the site logo.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");

const root = path.join(__dirname, "..");
const src = path.join(root, "client", "public", "starcraft-coach-logo.png");
const buildDir = path.join(root, "build");
const electronIcon = path.join(root, "electron", "app-icon.png");
const electronIconIco = path.join(root, "electron", "app-icon.ico");

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

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    icoSizes.map((size) =>
      sharp(src)
        .resize(size, size, { fit: "contain", background: bg })
        .png()
        .toBuffer()
    )
  );
  fs.writeFileSync(path.join(buildDir, "icon.ico"), await toIco(pngBuffers));
  fs.copyFileSync(path.join(buildDir, "icon.ico"), electronIconIco);

  console.log(
    "[icon] wrote build/icon.png, build/icon.ico, electron/app-icon.png, electron/app-icon.ico"
  );
}

if (require.main === module) {
  void main().catch((err) => {
    console.error("[icon]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  module.exports = { main };
}
