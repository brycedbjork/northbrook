#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BROKER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${1:-${BROKER_ROOT}/completions}"

if [[ -n "${BROKER_BIN:-}" ]]; then
  BROKER_CMD="${BROKER_BIN}"
elif [[ -x "${BROKER_ROOT}/.venv/bin/broker" ]]; then
  BROKER_CMD="${BROKER_ROOT}/.venv/bin/broker"
else
  BROKER_CMD="broker"
fi

mkdir -p "${OUT_DIR}"

echo "Generating broker shell completion scripts into ${OUT_DIR}"

for shell in bash zsh fish; do
  env "_BROKER_COMPLETE=${shell}_source" "${BROKER_CMD}" > "${OUT_DIR}/broker.${shell}"
  echo "  wrote ${OUT_DIR}/broker.${shell}"
done

echo "Done."
