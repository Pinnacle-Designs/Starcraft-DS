#!/usr/bin/env bash
# Upload release/Starcraft-Coach-Setup*.exe to Cloudflare R2 via AWS CLI.
set -euo pipefail

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "::error::Missing env ${name}"
    exit 1
  fi
  echo "Env present: ${name}"
}

require_var R2_ACCOUNT_ID
require_var R2_ACCESS_KEY_ID
require_var R2_SECRET_ACCESS_KEY
require_var R2_BUCKET
# Bucket name only — strip accidental path suffix (e.g. bucket/key.exe)
if [[ "${R2_BUCKET}" == */* ]]; then
  echo "R2_BUCKET should be the bucket name only; using ${R2_BUCKET%%/*}"
  R2_BUCKET="${R2_BUCKET%%/*}"
fi

OBJECT_KEY="${R2_OBJECT_KEY:-Starcraft-Coach-Setup.exe}"
PUBLIC_URL="${R2_PUBLIC_URL:-https://downloads.starcraftcoach.com/${OBJECT_KEY}}"

installer=""
if [ -d release ]; then
  installer=$(find release -maxdepth 2 -type f -name '*.exe' | head -1 || true)
fi
if [ -z "$installer" ]; then
  echo "::error::No .exe found under release/"
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "::error::AWS CLI not found on runner"
  exit 1
fi
aws --version

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="auto"
export AWS_REGION="auto"
export AWS_EC2_METADATA_DISABLED="true"

endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
echo "Uploading ${installer} (${installer##*/}) -> s3://${R2_BUCKET}/${OBJECT_KEY}"

# R2 requires CRC32; newer AWS CLI defaults can break uploads (exit 255 / InternalError).
aws s3 cp "${installer}" "s3://${R2_BUCKET}/${OBJECT_KEY}" \
  --endpoint-url "${endpoint}" \
  --region auto \
  --checksum-algorithm CRC32 \
  --only-show-errors

echo "R2 upload complete"
echo "Public URL: ${PUBLIC_URL}"
