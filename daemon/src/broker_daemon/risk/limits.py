"""Risk parameter definitions."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from broker_daemon.config import RiskConfig


def _to_float(value: Any) -> float:
    return float(value)


def _to_int(value: Any) -> int:
    return int(value)


def _to_symbol_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [item.strip().upper() for item in value.split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).upper() for item in value]
    raise ValueError(f"unsupported symbol list value: {value!r}")


RISK_PARAM_COERCERS: dict[str, Callable[[Any], Any]] = {
    "max_position_pct": _to_float,
    "max_order_value": _to_float,
    "max_daily_loss_pct": _to_float,
    "max_sector_exposure_pct": _to_float,
    "max_single_name_pct": _to_float,
    "max_open_orders": _to_int,
    "order_rate_limit": _to_int,
    "duplicate_window_seconds": _to_int,
    "symbol_allowlist": _to_symbol_list,
    "symbol_blocklist": _to_symbol_list,
}


def mutable_params() -> list[str]:
    return sorted(RISK_PARAM_COERCERS.keys())


def validate_param(name: str) -> str:
    if name not in RISK_PARAM_COERCERS:
        valid = ", ".join(mutable_params())
        raise ValueError(f"unknown risk parameter '{name}'. valid params: {valid}")
    return name


def coerce_param(name: str, value: Any) -> Any:
    return RISK_PARAM_COERCERS[validate_param(name)](value)


def config_to_dict(cfg: RiskConfig) -> dict[str, Any]:
    return cfg.model_dump(mode="python")
