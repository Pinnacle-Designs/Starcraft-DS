const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "client", "public", "data");
const files = [
  "counters.json",
  "unit-tiers.json",
  "unit-costs.json",
  "unit-platform.json",
  "unit-supply.json",
];

fs.mkdirSync(dest, { recursive: true });
for (const file of files) {
  const src = path.join(root, "data", file);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-data] skipping missing ${file}`);
    continue;
  }
  fs.copyFileSync(src, path.join(dest, file));
  console.log(`[copy-data] ${file}`);
}
