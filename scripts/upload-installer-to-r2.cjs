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

function findInstaller() {
  if (!fs.existsSync(releaseDir)) {
    console.error("[r2] release/ not found");
    process.exit(1);
  }
  const files = fs.readdirSync(releaseDir);
  let installer =
    files.find((name) => /^Starcraft-Coach-Setup-.+\.exe$/i.test(name)) ??
    files.find((name) => name.endsWith(".exe"));
  if (!installer) {
    const nested = path.join(releaseDir, "release");
    if (fs.existsSync(nested)) {
      const nestedFiles = fs.readdirSync(nested);
      installer =
        nestedFiles.find((name) => /^Starcraft-Coach-Setup-.+\.exe$/i.test(name)) ??
        nestedFiles.find((name) => name.endsWith(".exe"));
      if (installer) return path.join(nested, installer);
    }
    console.error("[r2] no .exe in release/");
    process.exit(1);
  }
  return path.join(releaseDir, installer);
}

async function main() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKey = requireEnv("R2_ACCESS_KEY_ID");
  const secretKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET");
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
