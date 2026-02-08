"""Order and execution domain models."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class Side(str, Enum):
    BUY = "buy"
    SELL = "sell"


class TIF(str, Enum):
    DAY = "DAY"
    GTC = "GTC"
    IOC = "IOC"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"
    BRACKET = "bracket"


class OrderStatus(str, Enum):
    SUBMITTED = "Submitted"
    ACKNOWLEDGED = "Acknowledged"
    PENDING_SUBMIT = "PendingSubmit"
    PRE_SUBMITTED = "PreSubmitted"
    FILLED = "Filled"
    CANCELLED = "Cancelled"
    REJECTED = "Rejected"
    INACTIVE = "Inactive"


class OrderRequest(BaseModel):
    side: Side
    symbol: str
    qty: float
    limit: float | None = None
    stop: float | None = None
    tif: TIF = TIF.DAY
    client_order_id: str | None = None
    tags: dict[str, Any] = Field(default_factory=dict)

    @field_validator("symbol")
    @classmethod
    def _normalize_symbol(cls, value: str) -> str:
        return value.upper().strip()


class OrderRecord(BaseModel):
    client_order_id: str
    ib_order_id: int | None = None
    symbol: str
    side: Side
    qty: float
    order_type: OrderType
    limit_price: float | None = None
    stop_price: float | None = None
    tif: TIF = TIF.DAY
    status: OrderStatus = OrderStatus.PENDING_SUBMIT
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    filled_at: datetime | None = None
    fill_price: float | None = None
    fill_qty: float = 0
    commission: float | None = None
    risk_check_result: dict[str, Any] = Field(default_factory=dict)


class FillRecord(BaseModel):
    fill_id: str
    client_order_id: str
    ib_order_id: int | None
    symbol: str
    qty: float
    price: float
    commission: float | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
