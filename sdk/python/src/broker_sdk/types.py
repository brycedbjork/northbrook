"""Shared Python SDK type aliases and discoverable constants."""

from __future__ import annotations

from typing import Literal, TypeAlias

ORDER_SIDES = ("buy", "sell")
TIME_IN_FORCE_VALUES = ("DAY", "GTC", "IOC")
HISTORY_PERIODS = ("1d", "5d", "30d", "90d", "1y")
BAR_SIZES = ("1m", "5m", "15m", "1h", "1d")
OPTION_TYPES = ("call", "put")
ORDER_STATUS_FILTERS = ("active", "filled", "cancelled", "all")
EXPOSURE_GROUPS = ("sector", "asset_class", "currency", "symbol")
AGENT_TOPICS = ("orders", "fills", "positions", "pnl", "risk", "connection")
AUDIT_TABLES = ("orders", "commands", "risk")
AUDIT_SOURCES = ("cli", "sdk", "agent", "ts_sdk")
RISK_PARAMS = (
    "max_position_pct",
    "max_order_value",
    "max_daily_loss_pct",
    "max_sector_exposure_pct",
    "max_single_name_pct",
    "max_open_orders",
    "order_rate_limit",
    "duplicate_window_seconds",
    "symbol_allowlist",
    "symbol_blocklist",
)

OrderSide: TypeAlias = Literal["buy", "sell"]
TimeInForce: TypeAlias = Literal["DAY", "GTC", "IOC"]
HistoryPeriod: TypeAlias = Literal["1d", "5d", "30d", "90d", "1y"]
BarSize: TypeAlias = Literal["1m", "5m", "15m", "1h", "1d"]
OptionType: TypeAlias = Literal["call", "put"]
OrderStatusFilter: TypeAlias = Literal["active", "filled", "cancelled", "all"]
ExposureGroupBy: TypeAlias = Literal["sector", "asset_class", "currency", "symbol"]
AgentTopic: TypeAlias = Literal["orders", "fills", "positions", "pnl", "risk", "connection"]
AuditTable: TypeAlias = Literal["orders", "commands", "risk"]
AuditSource: TypeAlias = Literal["cli", "sdk", "agent", "ts_sdk"]
RiskParam: TypeAlias = Literal[
    "max_position_pct",
    "max_order_value",
    "max_daily_loss_pct",
    "max_sector_exposure_pct",
    "max_single_name_pct",
    "max_open_orders",
    "order_rate_limit",
    "duplicate_window_seconds",
    "symbol_allowlist",
    "symbol_blocklist",
]
