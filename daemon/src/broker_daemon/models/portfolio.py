"""Portfolio and account domain models."""

from __future__ import annotations

from datetime import UTC, date as dt_date, datetime

from pydantic import BaseModel, Field


class Position(BaseModel):
    symbol: str
    qty: float
    avg_cost: float
    market_price: float | None = None
    market_value: float | None = None
    unrealized_pnl: float | None = None
    realized_pnl: float | None = None
    currency: str = "USD"


class Balance(BaseModel):
    account_id: str | None = None
    net_liquidation: float | None = None
    cash: float | None = None
    buying_power: float | None = None
    margin_used: float | None = None
    margin_available: float | None = None
    currency: str = "USD"


class PnLSummary(BaseModel):
    date: dt_date = Field(default_factory=lambda: datetime.now(UTC).date())
    realized: float = 0.0
    unrealized: float = 0.0
    total: float = 0.0


class ExposureEntry(BaseModel):
    key: str
    exposure_value: float
    exposure_pct: float
