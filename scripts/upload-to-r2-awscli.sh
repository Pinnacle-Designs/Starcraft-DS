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

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
echo "Uploading ${installer} -> s3://${R2_BUCKET}/${OBJECT_KEY}"
aws s3 cp "${installer}" "s3://${R2_BUCKET}/${OBJECT_KEY}" --endpoint-url "${endpoint}"

echo "R2 upload complete"
echo "Public URL: ${PUBLIC_URL}"
