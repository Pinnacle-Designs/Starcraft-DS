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

const siteUrl = "https://starcraftcoach.com";
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap);
console.log(`[pages] updated sitemap.xml (lastmod ${today})`);
