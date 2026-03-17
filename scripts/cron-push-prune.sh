#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required" >&2
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$DIR"

npm run --silent push:prune-tokens
