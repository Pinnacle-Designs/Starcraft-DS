const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "client", "dist");
const index = path.join(dist, "index.html");
const notFound = path.join(dist, "404.html");

if (!fs.existsSync(index)) {
  console.error("[pages] client/dist/index.html not found — run client build first");
  process.exit(1);
}

fs.copyFileSync(index, notFound);
console.log("[pages] wrote 404.html for GitHub Pages SPA routing");
