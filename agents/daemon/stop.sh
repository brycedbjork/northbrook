#!/usr/bin/env bash
set -euo pipefail

DAEMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NORTHBROOK_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}/northbrook"
AGENTS_HOME="${NORTHBROOK_STATE_HOME}/agents"
PID_FILE="${AGENTS_HOME}/agents-daemon.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo '{"ok":true,"running":false}'
  exit 0
fi

pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
if [[ ! "${pid}" =~ ^[0-9]+$ ]]; then
  rm -f "${PID_FILE}"
  echo '{"ok":true,"running":false}'
  exit 0
fi

if ! kill -0 "${pid}" >/dev/null 2>&1; then
  rm -f "${PID_FILE}"
  echo '{"ok":true,"running":false}'
  exit 0
fi

kill -TERM "${pid}" >/dev/null 2>&1 || true
for _ in {1..40}; do
  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if kill -0 "${pid}" >/dev/null 2>&1; then
  kill -KILL "${pid}" >/dev/null 2>&1 || true
fi

rm -f "${PID_FILE}"

if command -v bun >/dev/null 2>&1; then
  exec bun "${DAEMON_DIR}/status-cli.ts" --json
fi

echo '{"ok":true,"running":false}'
