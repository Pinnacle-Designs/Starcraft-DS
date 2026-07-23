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

let html = fs.readFileSync(index, "utf8");
html = html.replace(
  /"dateModified":\s*"[^"]*"/,
  `"dateModified": "${today}"`
);
if (!html.includes('"dateModified"')) {
  html = html.replace(
    '"inLanguage": "en-US",\n            "isAccessibleForFree": true',
    `"inLanguage": "en-US",\n            "isAccessibleForFree": true,\n            "dateModified": "${today}"`
  );
}
fs.writeFileSync(index, html);
fs.writeFileSync(notFound, html);
console.log(`[pages] set WebPage dateModified to ${today}`);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/guide.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${siteUrl}/privacy.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
`;
fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap);
console.log(`[pages] updated sitemap.xml (lastmod ${today})`);

for (const file of ["robots.txt", "CNAME", "privacy.html", "guide.html"]) {
  const filePath = path.join(dist, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[pages] warning: ${file} missing from dist`);
  }
}
