#!/usr/bin/env bash
set -euo pipefail

# nb reset — wipe config/workspace and runtime data/state, then reinitialize defaults.
# Sourced environment: ROOT_DIR, NORTHBROOK_HOME, NORTHBROOK_CONFIG_JSON,
#   NORTHBROOK_WORKSPACE, NORTHBROOK_STATE_HOME, NORTHBROOK_DATA_HOME,
#   and _lib.sh helpers.

force=0
for arg in "$@"; do
  case "${arg}" in
    -y|--yes)
      force=1
      ;;
    *)
      echo "Unknown nb reset option: ${arg}" >&2
      echo "Usage: nb reset [--yes]" >&2
      exit 2
      ;;
  esac
done

if [[ -z "${NORTHBROOK_HOME}" || "${NORTHBROOK_HOME}" == "/" || "${NORTHBROOK_HOME}" == "${HOME}" ]]; then
  echo "Refusing to reset unsafe NORTHBROOK_HOME path: ${NORTHBROOK_HOME}" >&2
  exit 1
fi
if [[ -z "${NORTHBROOK_STATE_HOME}" || "${NORTHBROOK_STATE_HOME}" == "/" || "${NORTHBROOK_STATE_HOME}" == "${HOME}" ]]; then
  echo "Refusing to reset unsafe NORTHBROOK_STATE_HOME path: ${NORTHBROOK_STATE_HOME}" >&2
  exit 1
fi
if [[ -z "${NORTHBROOK_DATA_HOME}" || "${NORTHBROOK_DATA_HOME}" == "/" || "${NORTHBROOK_DATA_HOME}" == "${HOME}" ]]; then
  echo "Refusing to reset unsafe NORTHBROOK_DATA_HOME path: ${NORTHBROOK_DATA_HOME}" >&2
  exit 1
fi

if [[ "${force}" -eq 0 ]]; then
  if [[ ! -t 0 || ! -t 1 ]]; then
    echo "nb reset requires explicit approval. Re-run with --yes for non-interactive use." >&2
    exit 1
  fi
  echo "This will permanently delete: ${NORTHBROOK_HOME}"
  echo "This will also clear runtime state: ${NORTHBROOK_STATE_HOME}"
  echo "This will also clear local runtime data: ${NORTHBROOK_DATA_HOME}"
  echo "Running broker/agents services will be stopped first."
  printf "Type RESET to confirm: "
  read -r confirm
  if [[ "${confirm}" != "RESET" ]]; then
    echo "Reset cancelled."
    exit 1
  fi
fi

run_agents_stop >/dev/null 2>&1 || true
if [[ -x "${ROOT_DIR}/broker/stop.sh" ]]; then
  "${ROOT_DIR}/broker/stop.sh" >/dev/null 2>&1 || true
fi

rm -rf "${NORTHBROOK_HOME}"
rm -rf "${NORTHBROOK_STATE_HOME}"
rm -rf "${NORTHBROOK_DATA_HOME}"

mkdir -p "${NORTHBROOK_HOME}"
mkdir -p "${NORTHBROOK_WORKSPACE}"
mkdir -p "${NORTHBROOK_STATE_HOME}/logs"
mkdir -p "${NORTHBROOK_DATA_HOME}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to reinitialize ${NORTHBROOK_WORKSPACE}." >&2
  exit 1
fi

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

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to initialize ${NORTHBROOK_CONFIG_JSON}." >&2
  exit 1
fi

python3 - "${NORTHBROOK_CONFIG_JSON}" <<'PY'
import json
import os
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
config_path.parent.mkdir(parents=True, exist_ok=True)
data = {
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
config_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
os.chmod(config_path, 0o600)
PY

echo "Reset complete."
echo "Reinitialized ${NORTHBROOK_HOME} (config/workspace), ${NORTHBROOK_STATE_HOME} (runtime), and ${NORTHBROOK_DATA_HOME} (data)."
echo "Run \`nb setup\` to configure credentials and providers."
