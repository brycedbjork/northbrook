"""Streaming event schema."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventTopic(str, Enum):
    ORDERS = "orders"
    FILLS = "fills"
    POSITIONS = "positions"
    PNL = "pnl"
    RISK = "risk"
    CONNECTION = "connection"


class Event(BaseModel):
    topic: EventTopic
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, Any] = Field(default_factory=dict)
