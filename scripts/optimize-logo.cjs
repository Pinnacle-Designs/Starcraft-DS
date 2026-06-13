const path = require("path");
const sharp = require("sharp");

const input = path.join(__dirname, "..", "client", "public", "starcraft-coach-logo.png");
const output = path.join(
  __dirname,
  "..",
  "client",
  "public",
  "starcraft-coach-logo-display.webp"
);

sharp(input)
  .resize(400)
  .webp({ quality: 82 })
  .toFile(output)
  .then((info) => {
    console.log(
      `[optimize-logo] ${path.basename(output)} ${Math.round(info.size / 1024)}KB`
    );
  })
  .catch((err) => {
    console.error("[optimize-logo] failed:", err.message);
    process.exit(1);
  });
