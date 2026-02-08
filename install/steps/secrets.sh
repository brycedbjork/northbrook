# shellcheck shell=bash

load_broker_secrets() {
  local cfg="${BROKER_CONFIG_JSON}"
  if [[ ! -f "${cfg}" ]]; then
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi

  while IFS='=' read -r key value; do
    if [[ -z "${key}" ]]; then
      continue
    fi
    export "${key}=${value}"
  done < <(
    python3 - "${cfg}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
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

if ibkr_username:
    print(f"BROKER_IB_USERNAME={ibkr_username}")
if ibkr_password:
    print(f"BROKER_IB_PASSWORD={ibkr_password}")
if isinstance(ibkr_auto_login, bool):
    print(f"BROKER_IB_AUTO_LOGIN={'true' if ibkr_auto_login else 'false'}")
PY
  )
}

read_broker_config_value() {
  local key="$1"
  if [[ ! -f "${BROKER_CONFIG_JSON}" ]]; then
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi

  python3 - "${BROKER_CONFIG_JSON}" "${key}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    sys.exit(0)

if not isinstance(data, dict):
    sys.exit(0)

value = data.get(key)
if value is None:
    sys.exit(0)

if isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, (str, int, float)):
    print(value)
PY
}

default_daemon_mode_arg() {
  local mode
  mode="$(read_broker_config_value "ibkrGatewayMode" | tr '[:upper:]' '[:lower:]' || true)"
  case "${mode}" in
    live) printf '%s\n' "--live" ;;
    paper|"") printf '%s\n' "--paper" ;;
    *) printf '%s\n' "--paper" ;;
  esac
}

has_explicit_gateway_or_mode() {
  local args=("$@")
  local arg=""
  for arg in "${args[@]}"; do
    case "${arg}" in
      --paper|--live|--gateway|--gateway=*)
        return 0
        ;;
    esac
  done
  return 1
}

run_broker_start() {
  local daemon_args=("$@")
  if ! has_explicit_gateway_or_mode "${daemon_args[@]}"; then
    daemon_args+=("$(default_daemon_mode_arg)")
  fi

  "${ROOT_DIR}/start.sh" "${daemon_args[@]}"
}
