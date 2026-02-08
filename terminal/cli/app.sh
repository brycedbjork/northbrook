#!/usr/bin/env bash
set -euo pipefail

# nb run / nb (default) — TUI launcher.
# Parses daemon vs terminal args, starts broker + agents in background,
# then immediately exec's bun.
# Sourced environment: ROOT_DIR, and _lib.sh helpers.

if [[ ! -x "${ROOT_DIR}/broker/start.sh" ]]; then
  echo "broker/start.sh not found or not executable at ${ROOT_DIR}/broker/start.sh" >&2
  exit 1
fi
if [[ ! -f "${ROOT_DIR}/terminal/app/main.tsx" ]]; then
  echo "terminal entrypoint not found at ${ROOT_DIR}/terminal/app/main.tsx" >&2
  exit 1
fi
if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to launch the terminal. Run ./install/main.sh first." >&2
  exit 1
fi

load_northbrook_secrets

daemon_args=()
terminal_args=()
has_ib_wait=0
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  arg="${args[i]}"
  case "${arg}" in
    --live|--paper|--launch-ib|--no-launch-ib)
      daemon_args+=("${arg}")
      ;;
    --gateway|--ib-app-path|--ib-wait)
      if [[ "${arg}" == "--ib-wait" ]]; then
        has_ib_wait=1
      fi
      daemon_args+=("${arg}")
      ((i += 1))
      if ((i >= ${#args[@]})); then
        echo "Missing value for ${arg}." >&2
        exit 2
      fi
      daemon_args+=("${args[i]}")
      ;;
    --gateway=*|--ib-app-path=*|--ib-wait=*)
      if [[ "${arg}" == --ib-wait=* ]]; then
        has_ib_wait=1
      fi
      daemon_args+=("${arg}")
      ;;
    --daemon-help)
      exec "${ROOT_DIR}/broker/start.sh" --help
      ;;
    *)
      terminal_args+=("${arg}")
      ;;
  esac
done

if ! has_explicit_gateway_or_mode "${daemon_args[@]}"; then
  daemon_args+=("$(default_daemon_mode_arg)")
fi

# Keep TUI startup responsive by default; callers can still override via --ib-wait.
if [[ "${has_ib_wait}" -eq 0 ]]; then
  daemon_args+=("--ib-wait=0")
fi

for arg in "${terminal_args[@]}"; do
  if [[ "${arg}" == "-h" || "${arg}" == "--help" ]]; then
    cd "${ROOT_DIR}/terminal"
    exec bun app/main.tsx "${terminal_args[@]}"
  fi
done

mkdir -p "${NORTHBROOK_STATE_HOME}/logs"
mkdir -p "${NORTHBROOK_SESSIONS_DIR}"
bootstrap_id="$(date +%s)-$$-${RANDOM}"
NORTHBROOK_BOOTSTRAP_STATE_FILE="${NORTHBROOK_STATE_HOME}/logs/nb-bootstrap-${bootstrap_id}.state"
NORTHBROOK_BOOTSTRAP_LOG_FILE="${NORTHBROOK_STATE_HOME}/logs/nb-bootstrap-${bootstrap_id}.log"
export NORTHBROOK_BOOTSTRAP_STATE_FILE
export NORTHBROOK_BOOTSTRAP_LOG_FILE

printf 'running\n' > "${NORTHBROOK_BOOTSTRAP_STATE_FILE}"
: > "${NORTHBROOK_BOOTSTRAP_LOG_FILE}"
(
  if run_broker_start "${daemon_args[@]}" >>"${NORTHBROOK_BOOTSTRAP_LOG_FILE}" 2>&1 && \
    run_agents_start >>"${NORTHBROOK_BOOTSTRAP_LOG_FILE}" 2>&1; then
    printf 'ok\n' > "${NORTHBROOK_BOOTSTRAP_STATE_FILE}"
  else
    rc=$?
    printf 'error\n' > "${NORTHBROOK_BOOTSTRAP_STATE_FILE}"
    printf '\nstartup failed (exit %s)\n' "${rc}" >> "${NORTHBROOK_BOOTSTRAP_LOG_FILE}"
  fi
) &

cd "${ROOT_DIR}/terminal"
exec bun app/main.tsx "${terminal_args[@]}"
