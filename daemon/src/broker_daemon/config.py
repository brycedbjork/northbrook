"""Broker config loading from config.json plus env overrides."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator


def _env_path(name: str, fallback: Path) -> Path:
    raw = os.environ.get(name, "").strip()
    return Path(raw).expanduser() if raw else fallback.expanduser()


_USER_HOME = Path.home()
_XDG_CONFIG_HOME = _env_path("XDG_CONFIG_HOME", _USER_HOME / ".config")
_XDG_STATE_HOME = _env_path("XDG_STATE_HOME", _USER_HOME / ".local" / "state")
DEFAULT_CONFIG_HOME = _XDG_CONFIG_HOME / "broker"
DEFAULT_STATE_HOME = _XDG_STATE_HOME / "broker"
DEFAULT_BROKER_CONFIG_JSON = _env_path("BROKER_CONFIG_JSON", DEFAULT_CONFIG_HOME / "config.json")


class GatewayConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 4001
    client_id: int = 1
    auto_reconnect: bool = True
    reconnect_backoff_max: int = 30


class ETradeConfig(BaseModel):
    consumer_key: str = ""
    consumer_secret: str = ""
    sandbox: bool = False
    account_id_key: str = ""
    token_path: Path = DEFAULT_CONFIG_HOME / "etrade-tokens.json"
    username: str = ""
    password: str = ""
    auto_reauth: bool = False


class RiskConfig(BaseModel):
    max_position_pct: float = 10.0
    max_order_value: float = 50_000.0
    max_daily_loss_pct: float = 2.0
    max_sector_exposure_pct: float = 30.0
    max_single_name_pct: float = 10.0
    max_open_orders: int = 20
    order_rate_limit: int = 10
    duplicate_window_seconds: int = 60
    symbol_allowlist: list[str] = Field(default_factory=list)
    symbol_blocklist: list[str] = Field(default_factory=list)


class LoggingConfig(BaseModel):
    level: str = "INFO"
    audit_db: Path = DEFAULT_STATE_HOME / "audit.db"
    log_file: Path = DEFAULT_STATE_HOME / "broker.log"
    max_log_size_mb: int = 100


class AgentConfig(BaseModel):
    heartbeat_timeout_seconds: int = 300
    on_heartbeat_timeout: str = "warn"
    default_output: str = "json"


class OutputConfig(BaseModel):
    default_format: str = "json"
    timezone: str = "America/New_York"


class RuntimeConfig(BaseModel):
    socket_path: Path = DEFAULT_STATE_HOME / "broker.sock"
    pid_file: Path = DEFAULT_STATE_HOME / "broker-daemon.pid"
    request_timeout_seconds: int = 15


class AppConfig(BaseModel):
    provider: str = "ib"
    gateway: GatewayConfig = Field(default_factory=GatewayConfig)
    etrade: ETradeConfig = Field(default_factory=ETradeConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    agent: AgentConfig = Field(default_factory=AgentConfig)
    output: OutputConfig = Field(default_factory=OutputConfig)
    runtime: RuntimeConfig = Field(default_factory=RuntimeConfig)

    @field_validator("provider")
    @classmethod
    def _validate_provider(cls, value: str) -> str:
        provider = value.strip().lower()
        if provider not in {"ib", "etrade"}:
            raise ValueError("provider must be ib or etrade")
        return provider

    def expanded(self) -> "AppConfig":
        clone = self.model_copy(deep=True)
        clone.etrade.token_path = clone.etrade.token_path.expanduser()
        clone.logging.audit_db = clone.logging.audit_db.expanduser()
        clone.logging.log_file = clone.logging.log_file.expanduser()
        clone.runtime.socket_path = clone.runtime.socket_path.expanduser()
        clone.runtime.pid_file = clone.runtime.pid_file.expanduser()
        return clone

    def ensure_dirs(self) -> None:
        expanded = self.expanded()
        expanded.runtime.socket_path.parent.mkdir(parents=True, exist_ok=True)
        expanded.runtime.pid_file.parent.mkdir(parents=True, exist_ok=True)
        expanded.logging.audit_db.parent.mkdir(parents=True, exist_ok=True)
        expanded.logging.log_file.parent.mkdir(parents=True, exist_ok=True)
        expanded.etrade.token_path.parent.mkdir(parents=True, exist_ok=True)


def _coerce_env_value(value: str) -> Any:
    lower = value.lower()
    if lower in {"true", "false"}:
        return lower == "true"
    if "," in value:
        return [part.strip() for part in value.split(",") if part.strip()]
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value


def _as_non_empty_string(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _read_broker_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

    if isinstance(loaded, dict):
        return loaded
    return {}


def _extract_broker_config(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    raw_broker = data.get("broker")
    sections = {"gateway", "etrade", "risk", "logging", "agent", "output", "runtime"}

    if isinstance(raw_broker, dict):
        provider = raw_broker.get("provider")
        if isinstance(provider, str) and provider.strip():
            out["provider"] = provider
        for section in sections:
            value = raw_broker.get(section)
            if isinstance(value, dict):
                out[section] = value

    mode = _as_non_empty_string(data.get("ibkrGatewayMode")).lower()
    if mode in {"paper", "live"}:
        gateway = dict(out.get("gateway", {}))
        if "port" not in gateway:
            gateway["port"] = 4002 if mode == "paper" else 4001
        out["gateway"] = gateway

    return out


def _apply_env_overrides(data: dict[str, Any]) -> dict[str, Any]:
    result = dict(data)
    sections = {"gateway", "etrade", "risk", "logging", "agent", "output", "runtime"}
    for key, raw in os.environ.items():
        if key == "BROKER_PROVIDER":
            result["provider"] = raw.strip()
            continue
        if not key.startswith("BROKER_"):
            continue
        tokens = key[len("BROKER_") :].lower().split("_")
        if not tokens:
            continue
        section = tokens[0]
        if section not in sections or len(tokens) == 1:
            continue
        field = "_".join(tokens[1:])
        section_obj = dict(result.get(section, {}))
        section_obj[field] = _coerce_env_value(raw)
        result[section] = section_obj
    return result


def load_config() -> AppConfig:
    raw = _read_broker_json(DEFAULT_BROKER_CONFIG_JSON)
    from_file = _extract_broker_config(raw)
    merged = _apply_env_overrides(from_file)
    cfg = AppConfig.model_validate(merged).expanded()
    cfg.ensure_dirs()
    return cfg
