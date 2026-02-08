# shellcheck shell=bash

prepare_broker_home() {
  mkdir -p "${BROKER_CONFIG_HOME}"
  mkdir -p "${BROKER_STATE_HOME}/logs"
  mkdir -p "${BROKER_DATA_HOME}"
}

ensure_broker_config() {
  mkdir -p "${BROKER_CONFIG_HOME}"
  if ! command -v python3 >/dev/null 2>&1; then
    fail "python3 is required to initialize ${BROKER_CONFIG_JSON}."
  fi

  python3 - "${BROKER_CONFIG_JSON}" <<'PY'
import json
import os
import sys
from pathlib import Path

config_path = Path(sys.argv[1]).expanduser()
config_path.parent.mkdir(parents=True, exist_ok=True)


def as_non_empty_str(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def to_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return False

loaded: dict[str, object] = {}
if config_path.exists():
    try:
        existing = json.loads(config_path.read_text(encoding="utf-8"))
        if isinstance(existing, dict):
            loaded = existing
    except Exception:
        loaded = {}

broker_cfg = loaded.get("broker")
if not isinstance(broker_cfg, dict):
    broker_cfg = {}

gateway_mode = as_non_empty_str(loaded.get("ibkrGatewayMode")).lower()
if gateway_mode not in {"paper", "live"}:
    gateway_mode = "paper"

normalized = {
    "broker": broker_cfg,
    "ibkrUsername": as_non_empty_str(loaded.get("ibkrUsername")),
    "ibkrPassword": as_non_empty_str(loaded.get("ibkrPassword")),
    "ibkrGatewayMode": gateway_mode,
    "ibkrAutoLogin": to_bool(loaded.get("ibkrAutoLogin")),
}

config_path.write_text(json.dumps(normalized, indent=2) + "\n", encoding="utf-8")
os.chmod(config_path, 0o600)
PY
}
