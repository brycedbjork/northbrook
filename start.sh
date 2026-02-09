#!/usr/bin/env bash
set -euo pipefail

BROKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BROKER_BIN="${BROKER_BIN:-${BROKER_DIR}/.venv/bin/broker}"
BROKER_STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}/broker"
BROKER_DATA_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/broker"
BROKER_CONFIG_HOME="${XDG_CONFIG_HOME:-${HOME}/.config}/broker"
BROKER_CONFIG_JSON="${BROKER_CONFIG_JSON:-${BROKER_CONFIG_HOME}/config.json}"
BROKER_PID_FILE="${BROKER_STATE_HOME}/broker-daemon.pid"
BROKER_SOCKET_FILE="${BROKER_STATE_HOME}/broker.sock"
LAUNCH_IB="${BROKER_LAUNCH_IB:-1}"
IB_APP_PATH="${BROKER_IB_APP_PATH:-}"
IB_WAIT_SECONDS="${BROKER_IB_WAIT_SECONDS:-45}"
IB_AUTO_LOGIN="${BROKER_IB_AUTO_LOGIN:-}"
IB_LOGIN_USERNAME="${BROKER_IB_USERNAME:-}"
IB_LOGIN_PASSWORD="${BROKER_IB_PASSWORD:-}"
IBC_PATH="${BROKER_DATA_HOME}/ibc"
IBC_INI="${IBC_PATH}/config.ini"
IBC_LOG_FILE="${BROKER_STATE_HOME}/logs/ibc-launch.log"
IB_SETTINGS_DIR="${BROKER_STATE_HOME}/ib-settings"

if [[ ! -x "${BROKER_BIN}" ]]; then
  if command -v broker >/dev/null 2>&1; then
    BROKER_BIN="$(command -v broker)"
  else
    echo "broker CLI not found. Run install/main.sh first." >&2
    exit 1
  fi
fi

LIVE=0
PAPER=0
HAS_GATEWAY=0
SHOW_HELP=0
PASSTHROUGH=()
ARGS=("$@")
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  arg="${ARGS[i]}"
  case "${arg}" in
    --live)
      LIVE=1
      ;;
    --paper)
      PAPER=1
      ;;
    --launch-ib)
      LAUNCH_IB=1
      ;;
    --no-launch-ib)
      LAUNCH_IB=0
      ;;
    --ib-app-path)
      ((i += 1))
      if ((i >= ${#ARGS[@]})); then
        echo "Missing value for --ib-app-path." >&2
        exit 2
      fi
      IB_APP_PATH="${ARGS[i]}"
      ;;
    --ib-app-path=*)
      IB_APP_PATH="${arg#*=}"
      ;;
    --ib-wait)
      ((i += 1))
      if ((i >= ${#ARGS[@]})); then
        echo "Missing value for --ib-wait (seconds)." >&2
        exit 2
      fi
      IB_WAIT_SECONDS="${ARGS[i]}"
      ;;
    --ib-wait=*)
      IB_WAIT_SECONDS="${arg#*=}"
      ;;
    -h|--help)
      SHOW_HELP=1
      PASSTHROUGH+=("${arg}")
      ;;
    --gateway)
      HAS_GATEWAY=1
      PASSTHROUGH+=("${arg}")
      ((i += 1))
      if ((i >= ${#ARGS[@]})); then
        echo "Missing value for --gateway (expected HOST:PORT)." >&2
        exit 2
      fi
      PASSTHROUGH+=("${ARGS[i]}")
      ;;
    --gateway=*)
      HAS_GATEWAY=1
      PASSTHROUGH+=("${arg}")
      ;;
    *)
      PASSTHROUGH+=("${arg}")
      ;;
  esac
done

if [[ "${LIVE}" -eq 1 && "${PAPER}" -eq 1 ]]; then
  echo "Choose one mode: --live or --paper (not both)." >&2
  exit 2
fi

if [[ "${SHOW_HELP}" -eq 1 ]]; then
  echo "Wrapper options:"
  echo "  --live | --paper"
  echo "  --launch-ib | --no-launch-ib"
  echo "  --ib-app-path /path/to/App.app"
  echo "  --ib-wait <seconds>"
  echo "  (set BROKER_IB_AUTO_LOGIN=true with BROKER_IB_USERNAME/BROKER_IB_PASSWORD for IBC automated login)"
  echo "  (IBC files are expected at ${IBC_PATH}; install/main.sh provisions this automatically)"
  echo
  echo "daemon start options:"
  "${BROKER_BIN}" daemon start --help
  exit 0
fi

lowercase() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

load_ib_secrets_from_config() {
  if [[ ! -f "${BROKER_CONFIG_JSON}" ]]; then
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi

  local cfg_auto=""
  local cfg_user=""
  local cfg_pass=""
  while IFS='=' read -r key value; do
    case "${key}" in
      BROKER_IB_AUTO_LOGIN)
        cfg_auto="${value}"
        ;;
      BROKER_IB_USERNAME)
        cfg_user="${value}"
        ;;
      BROKER_IB_PASSWORD)
        cfg_pass="${value}"
        ;;
    esac
  done < <(
    python3 - "${BROKER_CONFIG_JSON}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1]).expanduser()
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    sys.exit(0)

if not isinstance(data, dict):
    sys.exit(0)

def as_non_empty_str(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""

ibkr_username = as_non_empty_str(data.get("ibkrUsername"))
ibkr_password = as_non_empty_str(data.get("ibkrPassword"))
ibkr_auto_login = data.get("ibkrAutoLogin")

if isinstance(ibkr_auto_login, bool):
    print(f"BROKER_IB_AUTO_LOGIN={'true' if ibkr_auto_login else 'false'}")
if ibkr_username:
    print(f"BROKER_IB_USERNAME={ibkr_username}")
if ibkr_password:
    print(f"BROKER_IB_PASSWORD={ibkr_password}")
PY
  )

  if [[ -z "${IB_AUTO_LOGIN}" && -n "${cfg_auto}" ]]; then
    IB_AUTO_LOGIN="${cfg_auto}"
  fi
  if [[ -z "${IB_LOGIN_USERNAME}" && -n "${cfg_user}" ]]; then
    IB_LOGIN_USERNAME="${cfg_user}"
  fi
  if [[ -z "${IB_LOGIN_PASSWORD}" && -n "${cfg_pass}" ]]; then
    IB_LOGIN_PASSWORD="${cfg_pass}"
  fi
}

load_ib_secrets_from_config
if [[ -z "${IB_AUTO_LOGIN}" ]]; then
  IB_AUTO_LOGIN="0"
fi

case "$(lowercase "${LAUNCH_IB}")" in
  1|true|yes|on) LAUNCH_IB=1 ;;
  0|false|no|off) LAUNCH_IB=0 ;;
  *)
    echo "Invalid BROKER_LAUNCH_IB value '${LAUNCH_IB}', defaulting to 1."
    LAUNCH_IB=1
    ;;
esac

if ! [[ "${IB_WAIT_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "Invalid --ib-wait value '${IB_WAIT_SECONDS}' (must be integer seconds)." >&2
  exit 2
fi

detect_port() {
  local listeners="$1"
  shift
  local port
  for port in "$@"; do
    if printf '%s\n' "${listeners}" | grep -Eq "[:.]${port}[[:space:]].*LISTEN"; then
      echo "${port}"
      return 0
    fi
  done
  return 1
}

force_stop_existing_daemon() {
  local pid_file="${BROKER_PID_FILE}"
  local socket_file="${BROKER_SOCKET_FILE}"

  "${BROKER_BIN}" daemon stop >/dev/null 2>&1 || true
  sleep 0.2

  if [[ -f "${pid_file}" ]]; then
    local pid
    pid="$(cat "${pid_file}" 2>/dev/null || true)"
    if [[ "${pid}" =~ ^[0-9]+$ ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      local cmdline
      cmdline="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
      if [[ "${cmdline}" == *"broker_daemon.daemon.server"* ]]; then
        echo "Daemon stop request timed out; sending SIGTERM to pid ${pid}."
        kill -TERM "${pid}" >/dev/null 2>&1 || true
        for _ in {1..30}; do
          if ! kill -0 "${pid}" >/dev/null 2>&1; then
            break
          fi
          sleep 0.1
        done
        if kill -0 "${pid}" >/dev/null 2>&1; then
          echo "Daemon still running; sending SIGKILL to pid ${pid}."
          kill -KILL "${pid}" >/dev/null 2>&1 || true
        fi
      fi
    fi
  fi

  if [[ -S "${socket_file}" ]]; then
    rm -f "${socket_file}" || true
  fi
  if [[ -f "${pid_file}" ]]; then
    rm -f "${pid_file}" || true
  fi
}

extract_gateway_port_from_args() {
  local endpoint=""
  local arg
  for ((j = 0; j < ${#PASSTHROUGH[@]}; j++)); do
    arg="${PASSTHROUGH[j]}"
    if [[ "${arg}" == --gateway=* ]]; then
      endpoint="${arg#*=}"
    elif [[ "${arg}" == --gateway ]]; then
      ((j += 1))
      endpoint="${PASSTHROUGH[j]:-}"
    else
      continue
    fi

    local port="${endpoint##*:}"
    if [[ "${port}" =~ ^[0-9]+$ ]]; then
      printf '%s\n' "${port}"
      return 0
    fi
  done
  return 1
}

any_port_listening() {
  local listeners="$1"
  shift
  local port
  for port in "$@"; do
    if printf '%s\n' "${listeners}" | grep -Eq "[:.]${port}[[:space:]].*LISTEN"; then
      return 0
    fi
  done
  return 1
}

wait_for_any_port() {
  local timeout_seconds="$1"
  shift
  local deadline=$((SECONDS + timeout_seconds))
  while ((SECONDS < deadline)); do
    local listeners
    listeners="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null || true)"
    if any_port_listening "${listeners}" "$@"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

resolve_ibc_tws_major_version() {
  local app_path="$1"
  local name
  name="$(basename "${app_path}" .app)"
  if [[ "${name}" =~ ([0-9]+\.[0-9]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi

  local root
  root="$(dirname "${app_path}")"
  local jar
  jar="$(ls "${root}"/jars/twslaunch-*.jar 2>/dev/null | head -n 1 || true)"
  if [[ "${jar}" =~ twslaunch-([0-9]{4})\.jar$ ]]; then
    local digits="${BASH_REMATCH[1]}"
    printf '%s\n' "${digits:0:2}.${digits:2:2}"
    return 0
  fi

  return 1
}

ensure_ibc_ini() {
  local mode="$1"
  mkdir -p "$(dirname "${IBC_INI}")"
  mkdir -p "${IB_SETTINGS_DIR}"

  if [[ ! -f "${IBC_INI}" && -f "${IBC_PATH}/config.ini" ]]; then
    cp "${IBC_PATH}/config.ini" "${IBC_INI}"
  fi

  python3 - "${IBC_INI}" "${mode}" "${IB_SETTINGS_DIR}" <<'PY'
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
trading_mode = (sys.argv[2] or "paper").strip().lower()
ib_dir = sys.argv[3]

if trading_mode not in {"paper", "live"}:
    trading_mode = "paper"

if config_path.exists():
    lines = config_path.read_text(encoding="utf-8", errors="ignore").splitlines()
else:
    lines = []

updates = {
    "TradingMode": trading_mode,
    "AcceptNonBrokerageAccountWarning": "yes",
    "ReloginAfterSecondFactorAuthenticationTimeout": "restart",
    "IbDir": ib_dir,
}

seen = {key: False for key in updates}
out_lines: list[str] = []
for line in lines:
    replaced = False
    for key, value in updates.items():
        if line.startswith(f"{key}="):
            out_lines.append(f"{key}={value}")
            seen[key] = True
            replaced = True
            break
    if not replaced:
        out_lines.append(line)

for key, value in updates.items():
    if not seen[key]:
        out_lines.append(f"{key}={value}")

config_path.write_text("\n".join(out_lines).rstrip() + "\n", encoding="utf-8")
PY
  chmod 600 "${IBC_INI}" >/dev/null 2>&1 || true
}

launch_ib_with_ibc() {
  local app_path="$1"
  local mode="$2"

  if [[ ! -x "${IBC_PATH}/scripts/ibcstart.sh" ]]; then
    echo "IBC is not installed at ${IBC_PATH}; run ./install/main.sh to provision it."
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to prepare IBC configuration."
    return 1
  fi

  local tws_major
  if ! tws_major="$(resolve_ibc_tws_major_version "${app_path}")"; then
    echo "Could not determine IB Gateway major version for IBC from ${app_path}."
    return 1
  fi
  local tws_path
  tws_path="$(dirname "${app_path}")"

  local ibc_mode="paper"
  if [[ "${mode}" == "live" ]]; then
    ibc_mode="live"
  fi
  ensure_ibc_ini "${ibc_mode}"

  local -a cmd=(
    "${IBC_PATH}/scripts/ibcstart.sh"
    "${tws_major}"
    --gateway
    "--tws-path=${tws_path}"
    "--ibc-path=${IBC_PATH}"
    "--ibc-ini=${IBC_INI}"
    "--mode=${ibc_mode}"
    "--on2fatimeout=restart"
  )

  case "$(lowercase "${IB_AUTO_LOGIN}")" in
    1|true|yes|on)
      if [[ -n "${IB_LOGIN_USERNAME}" && -n "${IB_LOGIN_PASSWORD}" ]]; then
        cmd+=("--user=${IB_LOGIN_USERNAME}" "--pw=${IB_LOGIN_PASSWORD}")
      else
        echo "BROKER_IB_AUTO_LOGIN=true but credentials are missing; starting IBC without auto login credentials."
      fi
      ;;
  esac

  mkdir -p "$(dirname "${IBC_LOG_FILE}")"
  nohup "${cmd[@]}" >"${IBC_LOG_FILE}" 2>&1 &
  return 0
}

is_valid_gateway_app_bundle() {
  local app_path="$1"
  [[ -d "${app_path}" ]] || return 1
  local name
  name="$(basename "${app_path}")"
  case "${name}" in
    IB\ Gateway*.app)
      case "${name}" in
        *Installer.app|*Uninstaller.app) return 1 ;;
      esac
      return 0
      ;;
  esac
  return 1
}

resolve_ib_gateway_app_from_root() {
  local root="$1"
  [[ -d "${root}" ]] || return 1

  local install_prop="${root}/.install4j/install.prop"
  if [[ -f "${install_prop}" ]]; then
    local launcher0=""
    launcher0="$(sed -n 's/^launcher0=//p' "${install_prop}" | head -n 1)"
    if [[ -n "${launcher0}" ]]; then
      local app_path="${launcher0%/Contents/MacOS/JavaApplicationStub}"
      if is_valid_gateway_app_bundle "${app_path}"; then
        printf '%s\n' "${app_path}"
        return 0
      fi
    fi
  fi

  local response_varfile="${root}/.install4j/response.varfile"
  if [[ -f "${response_varfile}" ]]; then
    local exe_name=""
    exe_name="$(sed -n 's/^exeName=//p' "${response_varfile}" | head -n 1)"
    if [[ -n "${exe_name}" ]]; then
      local app_path="${root}/${exe_name}"
      if is_valid_gateway_app_bundle "${app_path}"; then
        printf '%s\n' "${app_path}"
        return 0
      fi
    fi
  fi

  local direct="${root}/IB Gateway.app"
  if is_valid_gateway_app_bundle "${direct}"; then
    printf '%s\n' "${direct}"
    return 0
  fi

  return 1
}

find_ib_app_path() {
  if [[ -n "${IB_APP_PATH}" ]]; then
    if is_valid_gateway_app_bundle "${IB_APP_PATH}"; then
      printf '%s\n' "${IB_APP_PATH}"
      return 0
    fi
    if app_path="$(resolve_ib_gateway_app_from_root "${IB_APP_PATH}")"; then
      printf '%s\n' "${app_path}"
      return 0
    fi
    return 1
  fi

  local app_path=""
  for app_path in "/Applications/IB Gateway.app" "${HOME}/Applications/IB Gateway.app"; do
    if is_valid_gateway_app_bundle "${app_path}"; then
      printf '%s\n' "${app_path}"
      return 0
    fi
  done

  local root=""
  for root in "/Applications/IB Gateway" "${HOME}/Applications/IB Gateway"; do
    if app_path="$(resolve_ib_gateway_app_from_root "${root}")"; then
      printf '%s\n' "${app_path}"
      return 0
    fi
  done

  return 1
}

maybe_launch_ib() {
  local -a target_ports=("$@")

  if [[ "${LAUNCH_IB}" -ne 1 ]]; then
    return 0
  fi

  local listeners
  listeners="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null || true)"
  if any_port_listening "${listeners}" "${target_ports[@]}"; then
    return 0
  fi

  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 0
  fi

  local app_path
  if ! app_path="$(find_ib_app_path)"; then
    echo "IB Gateway.app not found; unable to auto-launch Gateway."
    echo "Install IB Gateway, or pass --ib-app-path <path>."
    return 0
  fi

  local launch_mode="paper"
  if [[ "${MODE}" == "live" ]]; then
    launch_mode="live"
  fi
  echo "No IB API listener detected; launching $(basename "${app_path}") via IBC."
  if ! launch_ib_with_ibc "${app_path}" "${launch_mode}"; then
    echo "IBC launch failed; broker daemon may remain disconnected."
    return 0
  fi

  if wait_for_any_port "${IB_WAIT_SECONDS}" "${target_ports[@]}"; then
    echo "Detected IB API listener."
  else
    echo "Timed out waiting for IB API listener (${IB_WAIT_SECONDS}s)."
    echo "IBC launch log: ${IBC_LOG_FILE}"
  fi
}

read_daemon_pid() {
  local pid_file="${BROKER_PID_FILE}"
  if [[ ! -f "${pid_file}" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "${pid_file}" 2>/dev/null || true)"
  if [[ "${pid}" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "${pid}"
    return 0
  fi
  return 1
}

is_broker_daemon_pid_running() {
  local pid="$1"
  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    return 1
  fi
  local cmdline
  cmdline="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  [[ "${cmdline}" == *"broker_daemon.daemon.server"* ]]
}

MODE="auto"
if [[ "${LIVE}" -eq 1 ]]; then
  MODE="live"
elif [[ "${PAPER}" -eq 1 ]]; then
  MODE="paper"
fi

EXPLICIT_GATEWAY_PORT=""
if GATEWAY_PORT="$(extract_gateway_port_from_args)"; then
  EXPLICIT_GATEWAY_PORT="${GATEWAY_PORT}"
fi

TARGET_PORTS=()
if [[ -n "${EXPLICIT_GATEWAY_PORT}" ]]; then
  TARGET_PORTS=("${EXPLICIT_GATEWAY_PORT}")
elif [[ "${MODE}" == "paper" ]]; then
  TARGET_PORTS=(4002)
elif [[ "${MODE}" == "live" ]]; then
  TARGET_PORTS=(4001)
else
  TARGET_PORTS=(4002 4001)
fi

maybe_launch_ib "${TARGET_PORTS[@]}"

START_ARGS=()
if (( ${#PASSTHROUGH[@]} > 0 )); then
  START_ARGS=("${PASSTHROUGH[@]}")
fi
if [[ "${HAS_GATEWAY}" -eq 0 ]]; then
  LISTENERS="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null || true)"
  DETECTED_PORT=""
  case "${MODE}" in
    paper)
      DETECTED_PORT="$(detect_port "${LISTENERS}" 4002 || true)"
      ;;
    live)
      DETECTED_PORT="$(detect_port "${LISTENERS}" 4001 || true)"
      ;;
    *)
      DETECTED_PORT="$(detect_port "${LISTENERS}" 4002 4001 || true)"
      ;;
  esac

  if [[ -n "${DETECTED_PORT}" ]]; then
    START_ARGS+=(--gateway "127.0.0.1:${DETECTED_PORT}")
  elif [[ "${MODE}" == "paper" || "${MODE}" == "auto" ]]; then
    START_ARGS+=(--paper)
  fi
fi

PRE_STATUS_JSON="$("${BROKER_BIN}" --json daemon status 2>/dev/null || true)"
if [[ -n "${PRE_STATUS_JSON}" && "${PRE_STATUS_JSON}" == *'"connected":false'* ]]; then
  PRE_PORT="$(printf '%s' "${PRE_STATUS_JSON}" | sed -n 's/.*"port":\([0-9][0-9]*\).*/\1/p')"
  echo "Existing daemon is running but disconnected on localhost:${PRE_PORT}; restarting."
  force_stop_existing_daemon
elif [[ -z "${PRE_STATUS_JSON}" || "${PRE_STATUS_JSON}" == *'"code":"DAEMON_NOT_RUNNING"'* ]]; then
  if DAEMON_PID="$(read_daemon_pid)"; then
    if is_broker_daemon_pid_running "${DAEMON_PID}"; then
      echo "Found stale daemon process pid ${DAEMON_PID} without a healthy socket; restarting."
      force_stop_existing_daemon
    fi
  fi
fi

echo "Starting broker daemon with: ${BROKER_BIN} daemon start ${START_ARGS[*]}"
"${BROKER_BIN}" daemon start "${START_ARGS[@]}"

echo "Daemon status:"
STATUS_JSON="$("${BROKER_BIN}" --json daemon status 2>/dev/null || true)"
if [[ -n "${STATUS_JSON}" ]]; then
  echo "${STATUS_JSON}"
  if [[ "${STATUS_JSON}" == *'"connected":false'* ]]; then
    PORT="$(printf '%s' "${STATUS_JSON}" | sed -n 's/.*"port":\([0-9][0-9]*\).*/\1/p')"
    echo
    echo "IB is not reachable on localhost:${PORT}."
    echo "Start IB Gateway and enable API socket access, or pass --gateway HOST:PORT."
    echo "Common Gateway ports: paper/live = 4002/4001."
    echo "If risk_halted=true after reconnect, run: ${BROKER_BIN} resume"
  fi
else
  "${BROKER_BIN}" daemon status
fi
