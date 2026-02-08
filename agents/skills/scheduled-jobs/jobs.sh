#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to run scheduled-jobs CLI. Run ./install/main.sh first." >&2
  exit 1
fi

exec bun "${SKILL_DIR}/cli.ts" "$@"
