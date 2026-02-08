#!/usr/bin/env bash
# Shared helpers for the nb CLI.
# Sourced by nb.sh and subcommand scripts — not executed directly.

: "${NORTHBROOK_HOME:=${HOME}/.northbrook}"
: "${NORTHBROOK_CONFIG_JSON:=${NORTHBROOK_HOME}/northbrook.json}"
: "${NORTHBROOK_WORKSPACE:=${NORTHBROOK_HOME}/workspace}"
: "${NORTHBROOK_SESSIONS_DIR:=${NORTHBROOK_WORKSPACE}/sessions}"

: "${XDG_STATE_HOME:=${HOME}/.local/state}"
: "${XDG_DATA_HOME:=${HOME}/.local/share}"
NORTHBROOK_STATE_HOME="${XDG_STATE_HOME}/northbrook"
NORTHBROOK_DATA_HOME="${XDG_DATA_HOME}/northbrook"

NORTHBROOK_AGENTS_HOME="${NORTHBROOK_STATE_HOME}/agents"
NORTHBROOK_AGENTS_PID_FILE="${NORTHBROOK_AGENTS_HOME}/agents-daemon.pid"
NORTHBROOK_AGENTS_STATUS_FILE="${NORTHBROOK_AGENTS_HOME}/agents-daemon.status.json"
NORTHBROOK_AGENTS_LOG_FILE="${NORTHBROOK_AGENTS_HOME}/agents-daemon.log"
NORTHBROOK_AGENTS_EXECUTIONS_LOG_FILE="${NORTHBROOK_AGENTS_HOME}/scheduled-job-executions.jsonl"

BROKER_RUNTIME_PID_FILE="${NORTHBROOK_STATE_HOME}/broker-daemon.pid"
BROKER_RUNTIME_SOCKET_PATH="${NORTHBROOK_STATE_HOME}/broker.sock"
BROKER_LOGGING_AUDIT_DB="${NORTHBROOK_STATE_HOME}/audit.db"
BROKER_LOGGING_LOG_FILE="${NORTHBROOK_STATE_HOME}/broker.log"
BROKER_IBC_PATH="${NORTHBROOK_DATA_HOME}/ibc"
BROKER_IBC_INI="${BROKER_IBC_PATH}/config.ini"
BROKER_IBC_LOG_FILE="${NORTHBROOK_STATE_HOME}/logs/ibc-launch.log"
BROKER_IB_SETTINGS_DIR="${NORTHBROOK_STATE_HOME}/ib-settings"

export NORTHBROOK_HOME NORTHBROOK_CONFIG_JSON NORTHBROOK_WORKSPACE
export NORTHBROOK_SESSIONS_DIR
export NORTHBROOK_STATE_HOME NORTHBROOK_DATA_HOME
export NORTHBROOK_AGENTS_HOME NORTHBROOK_AGENTS_PID_FILE NORTHBROOK_AGENTS_STATUS_FILE
export NORTHBROOK_AGENTS_LOG_FILE NORTHBROOK_AGENTS_EXECUTIONS_LOG_FILE
export BROKER_RUNTIME_PID_FILE BROKER_RUNTIME_SOCKET_PATH BROKER_LOGGING_AUDIT_DB BROKER_LOGGING_LOG_FILE
export BROKER_IBC_PATH BROKER_IBC_INI BROKER_IBC_LOG_FILE BROKER_IB_SETTINGS_DIR

load_northbrook_secrets() {
  local cfg="${NORTHBROOK_CONFIG_JSON}"
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

ai_provider_cfg = data.get("aiProvider")
if isinstance(ai_provider_cfg, dict):
    provider = as_non_empty_str(ai_provider_cfg.get("provider")).lower()
    api_key = as_non_empty_str(ai_provider_cfg.get("apiKey"))
    model = as_non_empty_str(ai_provider_cfg.get("model"))
else:
    provider = ""
    api_key = ""
    model = ""

if provider in {"anthropic", "openai", "google"}:
    print(f"NORTHBROOK_AI_PROVIDER={provider}")
if model:
    print(f"NORTHBROOK_AI_MODEL={model}")
if provider in {"anthropic", "openai", "google"} and api_key:
    provider_env_map = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "google": "GEMINI_API_KEY",
    }
    provider_env = provider_env_map.get(provider)
    if provider_env:
        print(f"{provider_env}={api_key}")

skills = data.get("skills")
x_api_key = ""
brave_search_api_key = ""
if isinstance(skills, dict):
    x_cfg = skills.get("xApi")
    if isinstance(x_cfg, dict):
        x_api_key = as_non_empty_str(x_cfg.get("apiKey"))
    brave_cfg = skills.get("braveSearchApi")
    if isinstance(brave_cfg, dict):
        brave_search_api_key = as_non_empty_str(brave_cfg.get("apiKey"))

if x_api_key:
    print(f"X_API_KEY={x_api_key}")
if brave_search_api_key:
    print(f"BRAVE_SEARCH_API_KEY={brave_search_api_key}")
    print(f"BRAVE_API_KEY={brave_search_api_key}")

sec_cfg = data.get("sec")
if isinstance(sec_cfg, dict):
    sec_user_agent = as_non_empty_str(sec_cfg.get("userAgent"))
    sec_app_name = as_non_empty_str(sec_cfg.get("appName")) or "Northbrook"
    sec_name = as_non_empty_str(sec_cfg.get("name"))
    sec_email = as_non_empty_str(sec_cfg.get("email"))
    sec_company = as_non_empty_str(sec_cfg.get("company"))
else:
    sec_user_agent = ""
    sec_app_name = "Northbrook"
    sec_name = ""
    sec_email = ""
    sec_company = ""

if not sec_user_agent:
    contact_parts = [part for part in (sec_name, sec_company, sec_email) if part]
    sec_user_agent = f"{sec_app_name}/1.0"
    if contact_parts:
        sec_user_agent = f"{sec_user_agent} ({', '.join(contact_parts)})"

if sec_user_agent:
    print(f"SEC_USER_AGENT={sec_user_agent}")

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

read_northbrook_config_value() {
  local key="$1"
  if [[ ! -f "${NORTHBROOK_CONFIG_JSON}" ]]; then
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi
  python3 - "${NORTHBROOK_CONFIG_JSON}" "${key}" <<'PY'
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

if value is None and key == "aiProvider.provider":
    ai_provider = data.get("aiProvider")
    if isinstance(ai_provider, dict):
        value = ai_provider.get("provider")

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
  mode="$(read_northbrook_config_value "ibkrGatewayMode" | tr '[:upper:]' '[:lower:]' || true)"
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

  "${ROOT_DIR}/broker/start.sh" "${daemon_args[@]}"
}

run_agents_start() {
  if [[ ! -x "${ROOT_DIR}/agents/daemon/start.sh" ]]; then
    echo "agents/daemon/start.sh not found or not executable at ${ROOT_DIR}/agents/daemon/start.sh" >&2
    return 1
  fi
  "${ROOT_DIR}/agents/daemon/start.sh"
}

run_agents_stop() {
  if [[ ! -x "${ROOT_DIR}/agents/daemon/stop.sh" ]]; then
    echo "agents/daemon/stop.sh not found or not executable at ${ROOT_DIR}/agents/daemon/stop.sh" >&2
    return 1
  fi
  "${ROOT_DIR}/agents/daemon/stop.sh"
}

run_agents_status() {
  if [[ ! -x "${ROOT_DIR}/agents/daemon/status.sh" ]]; then
    return 1
  fi
  "${ROOT_DIR}/agents/daemon/status.sh"
}
