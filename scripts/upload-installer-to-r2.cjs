/**
 * Upload the Windows installer to Cloudflare R2 (S3-compatible API).
 *
 * Required env:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *
 * Optional:
 *   R2_OBJECT_KEY (default: Starcraft-Coach-Setup.exe)
 *   R2_PUBLIC_URL (printed after upload; for deploy-pages.yml)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

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
  const installer =
    files.find((name) => /^Starcraft-Coach-Setup-.+\.exe$/i.test(name)) ??
    files.find((name) => name.endsWith(".exe"));
  if (!installer) {
    console.error("[r2] no .exe in release/");
    process.exit(1);
  }
  return path.join(releaseDir, installer);
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function signRequest({
  method,
  url,
  headers,
  payloadHash,
  accessKey,
  secretKey,
  region,
}) {
  const parsed = new URL(url);
  const amzDate = headers["x-amz-date"];
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders = `host:${parsed.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    parsed.pathname,
    parsed.search.slice(1),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, "utf8")),
  ].join("\n");

  const hmac = (key, data) =>
    crypto.createHmac("sha256", key).update(data).digest();
  const kDate = hmac(Buffer.from(`AWS4${secretKey}`, "utf8"), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function putObject({ endpoint, bucket, key, body, accessKey, secretKey }) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const url = `${endpoint}/${bucket}/${encodedKey}`;
  const payloadHash = sha256Hex(body);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const headers = {
    "content-length": body.length,
    "content-type": "application/octet-stream",
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  signRequest({
    method: "PUT",
    url,
    headers,
    payloadHash,
    accessKey,
    secretKey,
    region: "auto",
  });

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        method: "PUT",
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers,
      },
      (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
          return;
        }
        reject(new Error(`R2 upload failed with status ${res.statusCode}`));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
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

  console.log(`[r2] uploading ${path.basename(installerPath)} -> ${bucket}/${objectKey}`);
  await putObject({
    endpoint,
    bucket,
    key: objectKey,
    body,
    accessKey,
    secretKey,
  });

  console.log("[r2] upload complete");
  console.log(`[r2] public URL (bind in Cloudflare R2 custom domain): ${publicUrl}`);
  console.log(`[r2] set VITE_WINDOWS_INSTALLER_URL: "${publicUrl}"`);
}

void main().catch((err) => {
  console.error("[r2]", err instanceof Error ? err.message : err);
  process.exit(1);
});
