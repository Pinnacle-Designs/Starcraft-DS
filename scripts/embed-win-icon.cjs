/**
 * electron-builder afterPack hook — force-embed the app icon into the Windows .exe.
 * Desktop shortcuts and the taskbar read the icon from the executable resources.
 */
const fs = require("fs");
const path = require("path");
const ResEdit = require("resedit");

const root = path.join(__dirname, "..");
const iconPath = path.join(root, "build", "icon.ico");

function embedIcon(exePath) {
  if (!fs.existsSync(iconPath)) {
    throw new Error(`[embed-win-icon] missing ${iconPath} — run npm run generate-app-icon`);
  }
  if (!fs.existsSync(exePath)) {
    throw new Error(`[embed-win-icon] exe not found: ${exePath}`);
  }

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const exeData = fs.readFileSync(exePath);
  const exe = ResEdit.NtExecutable.from(exeData, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    1033,
    iconFile.icons.map((item) => item.data)
  );

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  fs.copyFileSync(iconPath, path.join(path.dirname(exePath), "icon.ico"));
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );

  console.log(`[embed-win-icon] embedding ${iconPath} -> ${exePath}`);
  embedIcon(exePath);
  console.log("[embed-win-icon] done");
};

if (require.main === module) {
  const exePath = process.argv[2];
  if (!exePath) {
    console.error("Usage: node scripts/embed-win-icon.cjs <path-to.exe>");
    process.exit(1);
  }
  try {
    embedIcon(path.resolve(exePath));
    console.log("[embed-win-icon] done");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
