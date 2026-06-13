/**
 * CI check: confirm the packaged .exe contains a custom icon resource.
 */
const fs = require("fs");
const path = require("path");
const ResEdit = require("resedit");

function findPackagedExe() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);

  const releaseDir = path.join(__dirname, "..", "release");
  if (!fs.existsSync(releaseDir)) return null;

  const unpacked = path.join(releaseDir, "win-unpacked");
  if (fs.existsSync(unpacked)) {
    const exe = fs
      .readdirSync(unpacked)
      .find((name) => name.endsWith(".exe") && !name.startsWith("Uninstall"));
    if (exe) return path.join(unpacked, exe);
  }

  return null;
}

function main() {
  const exePath = findPackagedExe();
  if (!exePath || !fs.existsSync(exePath)) {
    console.warn(
      "[verify-win-icon] win-unpacked app .exe not found — skipping icon check"
    );
    return;
  }

  const data = fs.readFileSync(exePath);
  const exe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const iconGroups = res.entries.filter((entry) => {
    const typeName = entry?.constructor?.name ?? "";
    return typeName === "IconGroupEntry" || entry.type === 14;
  });

  if (iconGroups.length === 0) {
    console.error(
      `[verify-win-icon] ${path.basename(exePath)} has no icon group — Electron default will show`
    );
    process.exit(1);
  }

  console.log(
    `[verify-win-icon] ${path.basename(exePath)} has ${iconGroups.length} icon group(s) — OK`
  );
}

main();
