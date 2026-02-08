# shellcheck shell=bash

prepare_northbrook_home() {
  mkdir -p "${NORTHBROOK_HOME}"
  mkdir -p "${NORTHBROOK_WORKSPACE}"
  mkdir -p "${NORTHBROOK_STATE_HOME}/logs"
  mkdir -p "${NORTHBROOK_DATA_HOME}"
}

init_workspace_repo() {
  if [[ ! -d "${NORTHBROOK_WORKSPACE}/.git" ]]; then
    git init -b main "${NORTHBROOK_WORKSPACE}" >/dev/null 2>&1 || {
      git init "${NORTHBROOK_WORKSPACE}" >/dev/null 2>&1
      git -C "${NORTHBROOK_WORKSPACE}" checkout -b main >/dev/null 2>&1 || true
    }
  fi

  if [[ ! -f "${NORTHBROOK_WORKSPACE}/risk.json" ]]; then
    cat > "${NORTHBROOK_WORKSPACE}/risk.json" <<'RISK'
{
  "max_position_pct": 10.0,
  "max_order_value": 50000,
  "max_daily_loss_pct": 2.0
}
RISK
  fi

  if [[ ! -f "${NORTHBROOK_WORKSPACE}/README.md" ]]; then
    cat > "${NORTHBROOK_WORKSPACE}/README.md" <<'README'
# Northbrook Workspace

Instance-specific files belong here (for example `risk.json`).
This directory is a git repository so you can commit/push your local policy and strategy files.
README
  fi
}

ensure_northbrook_secrets_config() {
  mkdir -p "${NORTHBROOK_HOME}"
  if ! command -v python3 >/dev/null 2>&1; then
    fail "python3 is required to initialize ${NORTHBROOK_CONFIG_JSON}."
  fi

  python3 - "${NORTHBROOK_CONFIG_JSON}" <<'PY'
import json
import os
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
config_path.parent.mkdir(parents=True, exist_ok=True)

defaults = {
    "aiProvider": {
        "provider": "anthropic",
        "apiKey": "",
        "model": "claude-opus-4-6",
    },
    "heartbeat": {
        "enabled": True,
        "intervalMinutes": 30,
    },
    "skills": {},
    "broker": {},
    "sec": {
        "appName": "Northbrook",
        "name": "",
        "email": "",
        "company": "",
        "userAgent": "Northbrook/1.0",
    },
    "ibkrUsername": "",
    "ibkrPassword": "",
    "ibkrGatewayMode": "paper",
    "ibkrAutoLogin": False,
}
provider_defaults = {
    "anthropic": "claude-opus-4-6",
    "openai": "gpt-5",
    "google": "gemini-2.5-pro",
}

def as_non_empty_str(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""

data: dict[str, object] = defaults
if config_path.exists():
    try:
        loaded = json.loads(config_path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            data = loaded
    except Exception:
        data = defaults

ai_provider = data.get("aiProvider")
if not isinstance(ai_provider, dict):
    ai_provider = {}
provider = as_non_empty_str(ai_provider.get("provider")).lower()
if provider not in provider_defaults:
    provider = "anthropic"
api_key = as_non_empty_str(ai_provider.get("apiKey"))
model = as_non_empty_str(ai_provider.get("model")) or provider_defaults[provider]

skills = data.get("skills")
if not isinstance(skills, dict):
    skills = {}
normalized_skills: dict[str, dict[str, str]] = {}
for skill_name in ("xApi", "braveSearchApi"):
    raw_skill = skills.get(skill_name)
    if isinstance(raw_skill, dict):
        normalized_skills[skill_name] = {"apiKey": as_non_empty_str(raw_skill.get("apiKey"))}

broker_cfg = data.get("broker")
if not isinstance(broker_cfg, dict):
    broker_cfg = {}

gateway_mode = as_non_empty_str(data.get("ibkrGatewayMode"))
if gateway_mode not in {"paper", "live"}:
    gateway_mode = "paper"

heartbeat_cfg = data.get("heartbeat")
heartbeat_enabled = True
heartbeat_interval = 30
if isinstance(heartbeat_cfg, dict):
    if isinstance(heartbeat_cfg.get("enabled"), bool):
        heartbeat_enabled = heartbeat_cfg.get("enabled")
    raw_interval = heartbeat_cfg.get("intervalMinutes")
    if isinstance(raw_interval, (int, float)) and raw_interval > 0:
        heartbeat_interval = int(raw_interval) if float(raw_interval).is_integer() else float(raw_interval)

sec_cfg = data.get("sec")
if isinstance(sec_cfg, dict):
    sec_app_name = as_non_empty_str(sec_cfg.get("appName")) or "Northbrook"
    sec_name = as_non_empty_str(sec_cfg.get("name"))
    sec_email = as_non_empty_str(sec_cfg.get("email"))
    sec_company = as_non_empty_str(sec_cfg.get("company"))
    sec_user_agent = as_non_empty_str(sec_cfg.get("userAgent"))
else:
    sec_app_name = "Northbrook"
    sec_name = ""
    sec_email = ""
    sec_company = ""
    sec_user_agent = ""

if not sec_user_agent:
    contact_parts = [part for part in (sec_name, sec_company, sec_email) if part]
    sec_user_agent = f"{sec_app_name}/1.0"
    if contact_parts:
        sec_user_agent = f"{sec_user_agent} ({', '.join(contact_parts)})"

data = {
    "aiProvider": {"provider": provider, "apiKey": api_key, "model": model},
    "heartbeat": {"enabled": heartbeat_enabled, "intervalMinutes": heartbeat_interval},
    "skills": normalized_skills,
    "broker": broker_cfg,
    "sec": {
        "appName": sec_app_name,
        "name": sec_name,
        "email": sec_email,
        "company": sec_company,
        "userAgent": sec_user_agent,
    },
    "ibkrUsername": as_non_empty_str(data.get("ibkrUsername")),
    "ibkrPassword": as_non_empty_str(data.get("ibkrPassword")),
    "ibkrGatewayMode": gateway_mode,
    "ibkrAutoLogin": bool(data.get("ibkrAutoLogin")),
}

config_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
os.chmod(config_path, 0o600)
PY
}

bind_nb_command() {
  local cli_script="${ROOT_DIR}/terminal/cli/nb.ts"
  local nb_path="${NB_BIN_DIR}/nb"

  [[ -f "${cli_script}" ]] || fail "CLI entry point not found at ${cli_script}"

  chmod +x "${cli_script}"
  mkdir -p "${NB_BIN_DIR}"
  ln -sfn "${cli_script}" "${nb_path}"
}
