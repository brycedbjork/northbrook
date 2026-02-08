#!/usr/bin/env bash
set -euo pipefail

DAEMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="$(cd "${DAEMON_DIR}/.." && pwd)"

NORTHBROOK_HOME="${NORTHBROOK_HOME:-${HOME}/.northbrook}"
NORTHBROOK_WORKSPACE="${NORTHBROOK_WORKSPACE:-${NORTHBROOK_HOME}/workspace}"
NORTHBROOK_SESSIONS_DIR="${NORTHBROOK_SESSIONS_DIR:-${NORTHBROOK_WORKSPACE}/sessions}"
NORTHBROOK_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}/northbrook"
AGENTS_HOME="${NORTHBROOK_STATE_HOME}/agents"
PID_FILE="${AGENTS_HOME}/agents-daemon.pid"
LOG_FILE="${AGENTS_HOME}/agents-daemon.log"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to start agents-daemon. Run ./install/main.sh first." >&2
  exit 1
fi

mkdir -p "${AGENTS_HOME}"
mkdir -p "${NORTHBROOK_WORKSPACE}"
mkdir -p "${NORTHBROOK_SESSIONS_DIR}"

if [[ -f "${PID_FILE}" ]]; then
  pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ "${pid}" =~ ^[0-9]+$ ]] && kill -0 "${pid}" >/dev/null 2>&1; then
    exec bun "${DAEMON_DIR}/status-cli.ts" --json
  fi
fi

nohup bun "${DAEMON_DIR}/daemon.ts" >>"${LOG_FILE}" 2>&1 &

for _ in {1..40}; do
  if [[ -f "${PID_FILE}" ]]; then
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [[ "${pid}" =~ ^[0-9]+$ ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      exec bun "${DAEMON_DIR}/status-cli.ts" --json
    fi
  fi
  sleep 0.1
done

echo "failed to start agents-daemon" >&2
tail -n 40 "${LOG_FILE}" >&2 || true
exit 1
