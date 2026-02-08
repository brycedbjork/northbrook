"""Risk models shared across daemon, CLI and SDK."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import BaseModel, Field


class RiskCheckResult(BaseModel):
    ok: bool
    reasons: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)
    suggestion: str | None = None


class RiskOverride(BaseModel):
    param: str
    value: float
    reason: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime

    @classmethod
    def from_duration(cls, param: str, value: float, reason: str, seconds: int) -> "RiskOverride":
        now = datetime.now(UTC)
        return cls(param=param, value=value, reason=reason, created_at=now, expires_at=now + timedelta(seconds=seconds))


class RiskConfigSnapshot(BaseModel):
    max_position_pct: float
    max_order_value: float
    max_daily_loss_pct: float
    max_sector_exposure_pct: float
    max_single_name_pct: float
    max_open_orders: int
    order_rate_limit: int
    duplicate_window_seconds: int
    symbol_allowlist: list[str]
    symbol_blocklist: list[str]
    halted: bool = False
