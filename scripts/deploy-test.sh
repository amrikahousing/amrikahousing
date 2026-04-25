#!/bin/zsh

set -euo pipefail

ROOT="/Users/rayansh/Documents/amrikahousing"
NODE_BIN="${AMRIKA_DEPLOY_NODE:-/opt/homebrew/opt/node@22/bin/node}"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Healthy Node runtime not found at $NODE_BIN" >&2
  echo "Set AMRIKA_DEPLOY_NODE to a working node binary and retry." >&2
  exit 1
fi

cd "$ROOT"
exec "$NODE_BIN" "$ROOT/scripts/release-test.mjs" "$@"
