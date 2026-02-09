# shellcheck shell=bash

run_onboarding_wizard() {
  if [[ ! -t 0 || ! -t 1 ]]; then
    warn "No interactive TTY available. Skipping Interactive Brokers onboarding."
    return 0
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    fail "python3 is required for onboarding."
  fi

  local current_username
  current_username="$(read_broker_config_value "ibkrUsername" || true)"
  local current_mode
  current_mode="$(read_broker_config_value "ibkrGatewayMode" | tr '[:upper:]' '[:lower:]' || true)"
  if [[ "${current_mode}" != "paper" && "${current_mode}" != "live" ]]; then
    current_mode="paper"
  fi
  local current_auto
  current_auto="$(read_broker_config_value "ibkrAutoLogin" | tr '[:upper:]' '[:lower:]' || true)"
  if [[ "${current_auto}" != "true" && "${current_auto}" != "false" ]]; then
    current_auto="false"
  fi
  local current_password
  current_password="$(read_broker_config_value "ibkrPassword" || true)"

  local username_input
  if [[ -n "${current_username}" ]]; then
    read -r -p "IBKR username [${current_username}]: " username_input
  else
    read -r -p "IBKR username: " username_input
  fi
  local final_username="${current_username}"
  if [[ -n "${username_input}" ]]; then
    final_username="${username_input}"
  fi

  local final_password="${current_password}"
  local password_set="0"
  local password_input=""
  if [[ -n "${current_password}" ]]; then
    printf "IBKR password [press Enter to keep existing]: "
  else
    printf "IBKR password: "
  fi
  stty -echo
  IFS= read -r password_input || true
  stty echo
  printf "\n"
  if [[ -n "${password_input}" ]]; then
    final_password="${password_input}"
    password_set="1"
  fi

  local final_mode="${current_mode}"
  while true; do
    local mode_input=""
    read -r -p "Default gateway mode (paper/live) [${current_mode}]: " mode_input
    mode_input="$(printf '%s' "${mode_input}" | tr '[:upper:]' '[:lower:]')"
    if [[ -z "${mode_input}" ]]; then
      final_mode="${current_mode}"
      break
    fi
    if [[ "${mode_input}" == "paper" || "${mode_input}" == "live" ]]; then
      final_mode="${mode_input}"
      break
    fi
    echo "Please enter 'paper' or 'live'."
  done

  local auto_prompt="y/N"
  if [[ "${current_auto}" == "true" ]]; then
    auto_prompt="Y/n"
  fi

  local final_auto="${current_auto}"
  while true; do
    local auto_input=""
    read -r -p "Enable IBC auto login? [${auto_prompt}]: " auto_input
    auto_input="$(printf '%s' "${auto_input}" | tr '[:upper:]' '[:lower:]')"
    if [[ -z "${auto_input}" ]]; then
      final_auto="${current_auto}"
      break
    fi
    case "${auto_input}" in
      y|yes|1|true|on)
        final_auto="true"
        break
        ;;
      n|no|0|false|off)
        final_auto="false"
        break
        ;;
      *)
        echo "Please answer yes or no."
        ;;
    esac
  done

  if [[ "${final_auto}" == "true" ]]; then
    if [[ -z "${final_username}" || -z "${final_password}" ]]; then
      fail "IBC auto login requires both IBKR username and password. Rerun onboarding and provide both values."
    fi
  fi

  BROKER_ONBOARD_USERNAME="${final_username}" \
  BROKER_ONBOARD_PASSWORD="${final_password}" \
  BROKER_ONBOARD_PASSWORD_SET="${password_set}" \
  BROKER_ONBOARD_GATEWAY_MODE="${final_mode}" \
  BROKER_ONBOARD_AUTO_LOGIN="${final_auto}" \
  python3 - "${BROKER_CONFIG_JSON}" <<'PY'
import json
import os
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
config_path.parent.mkdir(parents=True, exist_ok=True)

try:
    data = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}
except Exception:
    data = {}
if not isinstance(data, dict):
    data = {}


def as_non_empty_str(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        return lowered in {"1", "true", "yes", "on"}
    return False

broker_cfg = data.get("broker")
if not isinstance(broker_cfg, dict):
    broker_cfg = {}

username = as_non_empty_str(os.environ.get("BROKER_ONBOARD_USERNAME", ""))
password = os.environ.get("BROKER_ONBOARD_PASSWORD", "")
password_set = os.environ.get("BROKER_ONBOARD_PASSWORD_SET", "0") == "1"
gateway_mode = as_non_empty_str(os.environ.get("BROKER_ONBOARD_GATEWAY_MODE", "paper")).lower()
auto_login = as_bool(os.environ.get("BROKER_ONBOARD_AUTO_LOGIN", "false"))

if gateway_mode not in {"paper", "live"}:
    gateway_mode = "paper"

existing_password = as_non_empty_str(data.get("ibkrPassword"))
if password_set:
    next_password = password
else:
    next_password = existing_password

normalized = {
    "broker": broker_cfg,
    "ibkrUsername": username,
    "ibkrPassword": next_password,
    "ibkrGatewayMode": gateway_mode,
    "ibkrAutoLogin": auto_login,
}

config_path.write_text(json.dumps(normalized, indent=2) + "\n", encoding="utf-8")
os.chmod(config_path, 0o600)
PY
}
