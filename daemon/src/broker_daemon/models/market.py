"""Market-data domain models."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, Field


class Quote(BaseModel):
    symbol: str
    bid: float | None = None
    ask: float | None = None
    last: float | None = None
    volume: float | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    exchange: str | None = None
    currency: str = "USD"


class Bar(BaseModel):
    symbol: str
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class OptionChainEntry(BaseModel):
    symbol: str
    right: str
    strike: float
    expiry: str
    bid: float | None = None
    ask: float | None = None
    implied_vol: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    vega: float | None = None


class OptionChain(BaseModel):
    symbol: str
    underlying_price: float | None = None
    entries: list[OptionChainEntry] = Field(default_factory=list)
