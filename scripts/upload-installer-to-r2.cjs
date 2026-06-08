/**
 * Upload the Windows installer to Cloudflare R2 (S3-compatible API).
 * Uses @aws-sdk/client-s3 — see https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
 */
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[r2] missing env ${name}`);
    process.exit(1);
  }
  return value;
}

/** R2_BUCKET must be the bucket name only, e.g. starcraft-coach-downloads */
function normalizeBucket(raw) {
  let bucket = raw.trim();
  if (bucket.startsWith("s3://")) {
    bucket = bucket.slice(5);
  }
  if (bucket.includes("://")) {
    try {
      bucket = new URL(bucket).pathname.replace(/^\/+/, "");
    } catch {
      // fall through
    }
  }
  if (bucket.includes("/")) {
    const [name, ...rest] = bucket.split("/").filter(Boolean);
    console.warn(
      `[r2] R2_BUCKET should be the bucket name only; using "${name}" (ignored: ${rest.join("/")})`
    );
    bucket = name;
  }
  if (!bucket || bucket.includes("/")) {
    console.error(
      "[r2] invalid R2_BUCKET — set the secret to your bucket name only, e.g. starcraft-coach-downloads"
    );
    process.exit(1);
  }
  return bucket;
}

function findInstaller() {
  const roots = [releaseDir, root];
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    const direct = findExeInDir(dir);
    if (direct) return direct;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const nested = findExeInDir(path.join(dir, entry.name));
      if (nested) return nested;
    }
  }
  console.error("[r2] no .exe in release/ (searched subfolders too)");
  process.exit(1);
}

function findExeInDir(dir) {
  const files = fs.readdirSync(dir);
  const installer =
    files.find((name) => /^Starcraft-Coach-Setup-.+\.exe$/i.test(name)) ??
    files.find((name) => name.endsWith(".exe") && !name.endsWith(".blockmap"));
  return installer ? path.join(dir, installer) : null;
}

async function main() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKey = requireEnv("R2_ACCESS_KEY_ID");
  const secretKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = normalizeBucket(requireEnv("R2_BUCKET"));
  const objectKey = process.env.R2_OBJECT_KEY?.trim() || "Starcraft-Coach-Setup.exe";
  const publicUrl =
    process.env.R2_PUBLIC_URL?.trim() ||
    `https://downloads.starcraftcoach.com/${objectKey}`;

  const installerPath = findInstaller();
  const body = fs.readFileSync(installerPath);
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });

  console.log(
    `[r2] uploading ${path.basename(installerPath)} (${body.length} bytes) -> ${bucket}/${objectKey}`
  );

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
      ContentType: "application/octet-stream",
      ContentDisposition: `attachment; filename="${objectKey}"`,
      CacheControl: "public, max-age=3600",
    })
  );

  console.log("[r2] upload complete");
  console.log(`[r2] public URL: ${publicUrl}`);
}

void main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" && "$metadata" in err
    ? err.$metadata?.httpStatusCode
    : undefined;
  console.error(`[r2] upload failed${code ? ` (HTTP ${code})` : ""}: ${message}`);
  process.exit(1);
});
