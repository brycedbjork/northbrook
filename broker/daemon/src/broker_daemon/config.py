"""Config loading, defaults, and environment overrides."""

from __future__ import annotations

import os
import tomllib
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


def _env_path(name: str, fallback: Path) -> Path:
    raw = os.environ.get(name, "").strip()
    return Path(raw).expanduser() if raw else fallback.expanduser()


_USER_HOME = Path.home()
DEFAULT_HOME = _env_path("NORTHBROOK_HOME", _USER_HOME / ".northbrook")
_XDG_STATE_HOME = _env_path("XDG_STATE_HOME", _USER_HOME / ".local" / "state")
DEFAULT_STATE_HOME = _XDG_STATE_HOME / "northbrook"
DEFAULT_CONFIG_PATH = DEFAULT_HOME / "config.toml"


class GatewayConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 4001
    client_id: int = 1
    auto_reconnect: bool = True
    reconnect_backoff_max: int = 30


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
    gateway: GatewayConfig = Field(default_factory=GatewayConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    agent: AgentConfig = Field(default_factory=AgentConfig)
    output: OutputConfig = Field(default_factory=OutputConfig)
    runtime: RuntimeConfig = Field(default_factory=RuntimeConfig)

    def expanded(self) -> "AppConfig":
        clone = self.model_copy(deep=True)
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


def _apply_env_overrides(data: dict[str, Any]) -> dict[str, Any]:
    result = dict(data)
    sections = {"gateway", "risk", "logging", "agent", "output", "runtime"}
    for key, raw in os.environ.items():
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


def load_config(path: Path | None = None) -> AppConfig:
    config_path = (path or DEFAULT_CONFIG_PATH).expanduser()
    data: dict[str, Any] = {}
    if config_path.exists():
        with config_path.open("rb") as f:
            loaded = tomllib.load(f)
            if isinstance(loaded, dict):
                data = loaded
    merged = _apply_env_overrides(data)
    cfg = AppConfig.model_validate(merged).expanded()
    cfg.ensure_dirs()
    return cfg
