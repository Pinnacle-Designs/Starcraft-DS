/**
 * Strip packages that must not ship inside the desktop installer.
 * server/node_modules/starcraft-ds is a file:.. link to the repo root (~800MB+).
 */
const fs = require("fs");
const path = require("path");

const serverNm = path.join(__dirname, "..", "server", "node_modules");

function removeIfExists(target, label) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[pack] removed ${label}`);
}

removeIfExists(path.join(serverNm, "starcraft-ds"), "server/node_modules/starcraft-ds");
removeIfExists(path.join(serverNm, "typescript"), "server/node_modules/typescript");
removeIfExists(path.join(serverNm, "@types"), "server/node_modules/@types");
