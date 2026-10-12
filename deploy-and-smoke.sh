#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

command -v pnpm >/dev/null || { echo "pnpm was not found. Install pnpm 11.25.0 before deploying." >&2; exit 1; }

export APP_D1_DATABASE_ID
APP_D1_DATABASE_ID="$(node scripts/read-deployment-id.mjs)"

for task in test:logic test:diagnosis test:search test:interview-hypotheses test:materials test:records test:panel test:markdown test:deploy-config; do
  pnpm run "$task"
done
pnpm run build

built_database_id="$(node scripts/read-deployment-id.mjs --built-only)"
if [[ "$built_database_id" != "$APP_D1_DATABASE_ID" ]]; then
  echo "D1 database ID changed during build. No deployment was performed." >&2
  exit 1
fi

pnpm run db:migrate:remote
pnpm exec wrangler deploy --config dist/server/wrangler.json --keep-vars

public_url="$(node -p "JSON.parse(require('node:fs').readFileSync('config/deployment.json', 'utf8')).publicUrl")"
if ! command -v curl >/dev/null; then
  echo "Deployment completed. Open ${public_url} to verify the public page."
elif ! http_status="$(curl --silent --show-error --location --output /dev/null --write-out '%{http_code}' --max-time 20 "$public_url")" || [[ "$http_status" != "200" ]]; then
  echo "Deployment completed, but this computer could not verify the public page. Test ${public_url} from an accessible network."
else
  echo "Deployment completed and the public page returned HTTP 200."
fi
echo "Sign in with your existing test code, then check an AI reply, automatic record updates, and persistence after refresh."
