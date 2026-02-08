#!/usr/bin/env bash
set -euo pipefail

BROKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BROKER_BIN="${BROKER_BIN:-${BROKER_DIR}/.venv/bin/broker}"
NORTHBROOK_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}/northbrook"
BROKER_PID_FILE="${NORTHBROOK_STATE_HOME}/broker-daemon.pid"
BROKER_SOCKET_FILE="${NORTHBROOK_STATE_HOME}/broker.sock"

if [[ ! -x "${BROKER_BIN}" ]]; then
  if command -v broker >/dev/null 2>&1; then
    BROKER_BIN="$(command -v broker)"
  else
    echo "broker CLI not found. Nothing to stop." >&2
    exit 1
  fi
fi

read_daemon_pid() {
  if [[ ! -f "${BROKER_PID_FILE}" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "${BROKER_PID_FILE}" 2>/dev/null || true)"
  if [[ "${pid}" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "${pid}"
    return 0
  fi
  return 1
}

is_daemon_pid_running() {
  local pid="$1"
  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    return 1
  fi
  local cmdline
  cmdline="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  [[ "${cmdline}" == *"broker_daemon.daemon.server"* ]]
}

cleanup_runtime_files() {
  rm -f "${BROKER_SOCKET_FILE}" "${BROKER_PID_FILE}" >/dev/null 2>&1 || true
}

force_kill_pid() {
  local pid="$1"
  kill -TERM "${pid}" >/dev/null 2>&1 || true
  for _ in {1..30}; do
    if ! kill -0 "${pid}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  kill -KILL "${pid}" >/dev/null 2>&1 || true
}

collect_local_daemon_pids() {
  pgrep -f "${BROKER_DIR}/.venv/bin/python -m broker_daemon.daemon.server" || true
}

stop_local_daemons() {
  local -a pids=()
  mapfile -t pids < <(collect_local_daemon_pids)
  if (( ${#pids[@]} == 0 )); then
    return 1
  fi
  local pid
  for pid in "${pids[@]}"; do
    if [[ "${pid}" =~ ^[0-9]+$ ]]; then
      force_kill_pid "${pid}"
    fi
  done
  return 0
}

DAEMON_PID=""
if read_pid="$(read_daemon_pid)"; then
  DAEMON_PID="${read_pid}"
fi

if [[ -z "${DAEMON_PID}" ]] || ! is_daemon_pid_running "${DAEMON_PID}"; then
  stop_local_daemons >/dev/null 2>&1 || true
  cleanup_runtime_files
  echo "broker-daemon is not running."
  exit 0
fi

set +e
STOP_OUTPUT="$("${BROKER_BIN}" --json daemon stop "$@" 2>&1)"
status=$?
set -e

if [[ "${status}" -eq 0 ]]; then
  if [[ -n "${STOP_OUTPUT}" ]]; then
    echo "${STOP_OUTPUT}"
  fi
else
  force_kill_pid "${DAEMON_PID}"
fi

stop_local_daemons >/dev/null 2>&1 || true
cleanup_runtime_files
exit 0
