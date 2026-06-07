/**
 * Download SC2 unit portrait reference images from SC2Mapster CDN and build
 * a labeled collage for Ollama vision. Run: npm run fetch-unit-images
 *
 * Assets: https://dist.sc2arcade.com/star-assets/ (Blizzard game files)
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const COUNTERS_PATH = path.join(ROOT, "data", "counters.json");
const SOURCES_PATH = path.join(ROOT, "data", "unit-image-sources.json");
const OUT_DIR = path.join(ROOT, "data", "unit-reference");
const ICONS_DIR = path.join(OUT_DIR, "portraits");
const CDN = "https://dist.sc2arcade.com/star-assets";

function log(...args) {
  console.log("[fetch-unit-images]", ...args);
}

function unitPortraitSlug(name, overrides) {
  if (overrides[name]) return overrides[name];
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${key}portrait_static`;
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "StarcraftDS/1.0" } }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          download(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function buildCollage(entries) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    log(
      "sharp not installed — skipping collage. Run: npm install --save-dev sharp"
    );
    return false;
  }

  const cols = 8;
  const cellW = 100;
  const cellH = 118;
  const iconSize = 84;
  const rows = Math.ceil(entries.length / cols);
  const width = cols * cellW;
  const height = rows * cellH;

  const composites = [];
  for (let i = 0; i < entries.length; i++) {
    const { name, filePath } = entries[i];
    if (!fs.existsSync(filePath)) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * cellW + Math.floor((cellW - iconSize) / 2);
    const top = row * cellH + 4;

    const icon = await sharp(filePath)
      .resize(iconSize, iconSize, { fit: "contain", background: "#0d1117" })
      .png()
      .toBuffer();
    composites.push({ input: icon, left, top });

    const label = name.length > 14 ? `${name.slice(0, 13)}…` : name;
    const esc = label
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
    const svg = Buffer.from(
      `<svg width="${cellW}" height="22">
        <text x="50%" y="14" dominant-baseline="middle" text-anchor="middle"
          fill="#e6edf3" font-size="9" font-family="Arial,sans-serif">${esc}</text>
      </svg>`
    );
    composites.push({
      input: svg,
      left: col * cellW,
      top: row * cellH + iconSize + 6,
    });
  }

  const base = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#0d1117",
    },
  })
    .jpeg({ quality: 88 })
    .toBuffer();

  const collage = await sharp(base).composite(composites).jpeg({ quality: 88 }).toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, "collage.jpg"), collage);
  return true;
}

async function main() {
  const counters = JSON.parse(fs.readFileSync(COUNTERS_PATH, "utf8"));
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  const units = Object.keys(counters.units).sort();
  const portraitOverrides = sources.portraitOverrides ?? {};

  fs.mkdirSync(ICONS_DIR, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    cdn: CDN,
    units: {},
  };

  const downloaded = [];

  for (const name of units) {
    const slug = unitPortraitSlug(name, portraitOverrides);
    const rel = `portraits-png/${slug}.png`;
    const url = `${CDN}/${rel}`;
    const safeFile = `${name.replace(/[^a-zA-Z0-9]+/g, "_")}.png`;
    const filePath = path.join(ICONS_DIR, safeFile);

    try {
      const buf = await download(url);
      fs.writeFileSync(filePath, buf);
      manifest.units[name] = { portrait: slug, url: rel, file: `portraits/${safeFile}` };
      downloaded.push({ name, filePath });
      log(`OK ${name} ← ${slug}`);
    } catch (err) {
      manifest.units[name] = {
        portrait: slug,
        url: rel,
        error: err instanceof Error ? err.message : String(err),
      };
      log(`MISS ${name} (${slug}): ${err instanceof Error ? err.message : err}`);
    }
  }

  const collageBuilt = await buildCollage(downloaded);
  manifest.collage = collageBuilt ? "collage.jpg" : null;
  manifest.downloaded = downloaded.length;
  manifest.total = units.length;

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  log(
    `Done: ${downloaded.length}/${units.length} portraits` +
      (collageBuilt ? ", collage.jpg ready for Ollama vision." : ".")
  );

  if (downloaded.length < units.length * 0.8) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
