/**
 * electron-builder can create multiple GitHub releases for one tag (e.g. blockmap-only).
 * The GitHub "latest" API then points at a release without latest.yml and auto-update breaks.
 */
const path = require("path");
const pkg = require(path.join(__dirname, "..", "package.json"));
const publish = pkg.build?.publish;
const REPO =
  publish?.owner && publish?.repo
    ? `${publish.owner}/${publish.repo}`
    : "Pinnacle-Designs/Starcraft-DS";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("[release-cleanup] GH_TOKEN or GITHUB_TOKEN is required");
  process.exit(1);
}

async function github(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${path} failed (${res.status}): ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function hasLatestYml(release) {
  return (release.assets || []).some((asset) => asset.name === "latest.yml");
}

function hasInstallerExe(release) {
  return (release.assets || []).some(
    (asset) =>
      asset.name.endsWith(".exe") && !asset.name.endsWith(".exe.blockmap")
  );
}

function isBrokenRelease(release) {
  return !hasLatestYml(release) && !hasInstallerExe(release);
}

async function main() {
  const releases = await github(
    `/repos/${REPO}/releases?per_page=20`
  );
  const byTag = new Map();
  for (const release of releases) {
    if (!release.tag_name) continue;
    const list = byTag.get(release.tag_name) || [];
    list.push(release);
    byTag.set(release.tag_name, list);
  }

  let deleted = 0;
  for (const release of releases) {
    if (!isBrokenRelease(release)) continue;
    const names = (release.assets || []).map((asset) => asset.name).join(", ");
    console.log(
      `[release-cleanup] deleting broken ${release.tag_name} release ${release.id} (${names || "no assets"})`
    );
    await github(`/repos/${REPO}/releases/${release.id}`, {
      method: "DELETE",
    });
    deleted += 1;
  }

  for (const [tag, group] of byTag.entries()) {
    if (group.length < 2) continue;
    const keeper =
      group.find((release) => hasLatestYml(release)) ||
      group.find((release) =>
        (release.assets || []).some((asset) => asset.name.endsWith(".exe"))
      );
    if (!keeper) {
      console.warn(`[release-cleanup] ${tag}: no keeper found, skipping`);
      continue;
    }
    for (const release of group) {
      if (release.id === keeper.id) continue;
      const names = (release.assets || []).map((asset) => asset.name).join(", ");
      console.log(
        `[release-cleanup] deleting duplicate ${tag} release ${release.id} (${names || "no assets"})`
      );
      await github(`/repos/${REPO}/releases/${release.id}`, {
        method: "DELETE",
      });
      deleted += 1;
    }
  }

  if (!process.argv.includes("--skip-latest-check")) {
    const tag = `v${pkg.version}`;
    const tagRelease = await github(`/repos/${REPO}/releases/tags/${tag}`);
    if (hasLatestYml(tagRelease) && hasInstallerExe(tagRelease)) {
      console.log(
        `[release-cleanup] ok — ${tag} has latest.yml and installer (deleted ${deleted} release(s))`
      );
      return;
    }

    const latest = await github(`/repos/${REPO}/releases/latest`);
    if (!hasLatestYml(latest)) {
      console.error(
        `[release-cleanup] ${tag} and /releases/latest (${latest.id}) are missing latest.yml`
      );
      process.exit(1);
    }
    console.log(
      `[release-cleanup] ok — latest is ${latest.tag_name} with latest.yml (deleted ${deleted} release(s))`
    );
  } else {
    console.log(
      `[release-cleanup] pre-publish cleanup done (deleted ${deleted} release(s))`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
