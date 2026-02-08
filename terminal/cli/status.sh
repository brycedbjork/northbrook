#!/usr/bin/env bash
set -euo pipefail

# nb status — show gateway, broker daemon, and agents daemon status.
# Sourced environment: ROOT_DIR, NORTHBROOK_CONFIG_JSON, and _lib.sh helpers.

load_northbrook_secrets
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for nb status rendering." >&2
  exit 1
fi

broker_bin="${ROOT_DIR}/broker/.venv/bin/broker"
if [[ ! -x "${broker_bin}" ]] && command -v broker >/dev/null 2>&1; then
  broker_bin="$(command -v broker)"
fi

daemon_status_json=""
if [[ -x "${broker_bin}" ]]; then
  daemon_status_json="$("${broker_bin}" --json daemon status 2>/dev/null || true)"
fi

agents_status_json=""
agents_status_json="$(run_agents_status 2>/dev/null || true)"

python3 - "${NORTHBROOK_CONFIG_JSON}" "${daemon_status_json}" "${agents_status_json}" <<'PY'
import json
import sys
from pathlib import Path
import os

cfg_path = Path(sys.argv[1])
broker_raw = sys.argv[2] if len(sys.argv) > 2 else ""
agents_raw = sys.argv[3] if len(sys.argv) > 3 else ""

cfg = {}
try:
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
except Exception:
    cfg = {}
if not isinstance(cfg, dict):
    cfg = {}

broker = None
if broker_raw:
    try:
        parsed = json.loads(broker_raw)
        if isinstance(parsed, dict) and parsed.get("connection"):
            broker = parsed
    except Exception:
        broker = None

agents = None
if agents_raw:
    try:
        parsed = json.loads(agents_raw)
        if isinstance(parsed, dict):
            agents = parsed
    except Exception:
        agents = None

def configured(key: str) -> str:
    value = cfg.get(key)
    return "yes" if isinstance(value, str) and value.strip() else "no"

def configured_ai_provider_key() -> str:
    ai_cfg = cfg.get("aiProvider")
    if isinstance(ai_cfg, dict):
        value = ai_cfg.get("apiKey")
        if isinstance(value, str) and value.strip():
            return "yes"
    return "no"

def configured_skill_key(skill_name: str) -> str:
    skills = cfg.get("skills")
    if isinstance(skills, dict):
        skill_cfg = skills.get(skill_name)
        if isinstance(skill_cfg, dict):
            value = skill_cfg.get("apiKey")
            if isinstance(value, str) and value.strip():
                return "yes"
    return "no"

def configured_sec_user_agent() -> str:
    sec = cfg.get("sec")
    if not isinstance(sec, dict):
        return "no"
    value = sec.get("userAgent")
    if isinstance(value, str) and value.strip():
        return "yes"
    return "no"

def symbol(ok: bool) -> str:
    return "●" if ok else "○"

print("Northbrook Platform Status")
print("────────────────────────────────────────────────────────")

if broker is None:
    print(f"{symbol(False)} Gateway        disconnected")
    print(f"{symbol(False)} Broker daemon  stopped")
else:
    conn = broker.get("connection", {})
    connected = bool(conn.get("connected"))
    host = conn.get("host", "127.0.0.1")
    port = conn.get("port", "n/a")
    uptime = broker.get("uptime_seconds")
    uptime_text = f"{int(uptime)}s" if isinstance(uptime, (int, float)) else "-"
    print(f"{symbol(connected)} Gateway        {'connected' if connected else 'disconnected'} ({host}:{port})")
    print(f"{symbol(True)} Broker daemon  running (uptime {uptime_text})")
    print(f"  risk_halted: {broker.get('risk_halted', False)}")

if agents is None:
    print(f"{symbol(False)} Agents daemon  stopped")
else:
    running = bool(agents.get("running"))
    jobs = agents.get("jobs") if isinstance(agents.get("jobs"), dict) else {}
    scheduled = jobs.get("scheduled", 0)
    queued = jobs.get("queued_for_pi_dev", 0)
    uptime = agents.get("uptime_seconds")
    uptime_text = f"{int(uptime)}s" if running and isinstance(uptime, (int, float)) else "-"
    print(f"{symbol(running)} Agents daemon  {'running' if running else 'stopped'} (uptime {uptime_text})")
    print(f"  jobs: scheduled={scheduled} queued_for_pi_dev={queued}")
    print(f"  framework: {agents.get('framework', 'pi.dev')} ({agents.get('mode', 'stub')})")

provider = "not set"
ai_cfg = cfg.get("aiProvider")
if isinstance(ai_cfg, dict):
    ai_provider = ai_cfg.get("provider")
    if isinstance(ai_provider, str) and ai_provider.strip():
        provider = ai_provider

mode = cfg.get("ibkrGatewayMode") or "paper"
print("────────────────────────────────────────────────────────")
print(f"AI provider : {provider}")
print(f"IB mode     : {mode}")
workspace = os.environ.get("NORTHBROOK_WORKSPACE") or str(Path.home() / ".northbrook" / "workspace")
print(f"Workspace   : {workspace}")
print("Configured keys")
print(f"- aiProvider.apiKey: {configured_ai_provider_key()}")
print(f"- skills.xApi: {configured_skill_key('xApi')}")
print(f"- skills.braveSearchApi: {configured_skill_key('braveSearchApi')}")
print(f"- sec.userAgent: {configured_sec_user_agent()}")
PY
