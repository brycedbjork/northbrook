#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible wrapper.
# Main CLI implementation lives in terminal/cli/nb.ts.

SCRIPT_SOURCE="${BASH_SOURCE[0]}"
while [[ -L "${SCRIPT_SOURCE}" ]]; do
  SCRIPT_DIR="$(cd -P "$(dirname "${SCRIPT_SOURCE}")" && pwd)"
  SCRIPT_SOURCE="$(readlink "${SCRIPT_SOURCE}")"
  if [[ "${SCRIPT_SOURCE}" != /* ]]; then
    SCRIPT_SOURCE="${SCRIPT_DIR}/${SCRIPT_SOURCE}"
  fi
done
CLI_DIR="$(cd -P "$(dirname "${SCRIPT_SOURCE}")" && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to run nb. Run ./install/main.sh first." >&2
  exit 1
fi

exec bun "${CLI_DIR}/nb.ts" "$@"
