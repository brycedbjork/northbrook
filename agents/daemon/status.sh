#!/usr/bin/env bash
set -euo pipefail

DAEMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo '{"ok":false,"running":false,"error":"bun_not_found"}'
  exit 1
fi

exec bun "${DAEMON_DIR}/status-cli.ts" --json
