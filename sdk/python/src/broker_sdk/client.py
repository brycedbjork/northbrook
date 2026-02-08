"""Async Python SDK for broker-daemon."""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator, Iterable
from pathlib import Path
from typing import Any, Literal

from broker_daemon.config import load_config
from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.protocol import Request, Response, decode_event, decode_response, encode_model, frame_payload, read_framed
from broker_sdk.types import (
    AgentTopic,
    AuditSource,
    AuditTable,
    BarSize,
    ExposureGroupBy,
    HistoryPeriod,
    OptionType,
    OrderSide,
    OrderStatusFilter,
    RiskParam,
    TimeInForce,
)


class Client:
    """Async broker client over the daemon Unix socket.

    All operations route through `broker-daemon`, so risk checks and audit logging are always enforced.
    """

    def __init__(self, socket_path: str | Path | None = None, timeout_seconds: int | None = None) -> None:
        cfg = load_config()
        self._socket_path = Path(socket_path).expanduser() if socket_path else cfg.runtime.socket_path
        self._timeout = timeout_seconds or cfg.runtime.request_timeout_seconds

    async def __aenter__(self) -> "Client":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def _request(self, command: str, params: dict[str, Any] | None = None, *, source: str = "sdk") -> Any:
        req = Request(command=command, params=params or {}, source=source)
        try:
            reader, writer = await asyncio.open_unix_connection(str(self._socket_path))
        except FileNotFoundError as exc:
            raise BrokerError(
                ErrorCode.DAEMON_NOT_RUNNING,
                "broker-daemon socket not found",
                details={"socket_path": str(self._socket_path)},
                suggestion="Start the daemon with `broker daemon start`.",
            ) from exc

        writer.write(frame_payload(encode_model(req)))
        await writer.drain()

        try:
            payload = await asyncio.wait_for(read_framed(reader), timeout=self._timeout)
        except asyncio.TimeoutError as exc:
            writer.close()
            await _safe_wait_closed(writer)
            raise BrokerError(
                ErrorCode.TIMEOUT,
                "request timed out waiting for daemon response",
                details={"timeout_seconds": self._timeout},
                suggestion="Retry or increase runtime.request_timeout_seconds in config.",
            ) from exc

        writer.close()
        await _safe_wait_closed(writer)

        response = decode_response(payload)
        return _unwrap_response(response)

    async def subscribe(self, topics: Iterable[AgentTopic]) -> AsyncIterator[dict[str, Any]]:
        """Stream daemon events for the requested topic list."""
        req = Request(command="agent.subscribe", params={"topics": list(topics)}, stream=True, source="sdk")
        try:
            reader, writer = await asyncio.open_unix_connection(str(self._socket_path))
        except FileNotFoundError as exc:
            raise BrokerError(
                ErrorCode.DAEMON_NOT_RUNNING,
                "broker-daemon socket not found",
                details={"socket_path": str(self._socket_path)},
                suggestion="Start the daemon with `broker daemon start`.",
            ) from exc

        writer.write(frame_payload(encode_model(req)))
        await writer.drain()

        first = decode_response(await read_framed(reader))
        _unwrap_response(first)

        try:
            while True:
                payload = await read_framed(reader)
                event = decode_event(payload)
                yield event.model_dump(mode="json")
        except asyncio.IncompleteReadError:
            return
        finally:
            writer.close()
            await _safe_wait_closed(writer)

    async def daemon_status(self) -> dict[str, Any]:
        """Fetch daemon runtime and IB connection status."""
        return await self._request("daemon.status")

    async def daemon_stop(self) -> dict[str, Any]:
        """Request graceful daemon shutdown."""
        return await self._request("daemon.stop")

    async def quote(self, *symbols: str) -> list[dict[str, Any]]:
        """Return snapshot quotes for one or more symbols."""
        data = await self._request("quote.snapshot", {"symbols": list(symbols)})
        return data.get("quotes", [])

    async def history(self, symbol: str, period: HistoryPeriod, bar: BarSize, rth_only: bool = False) -> list[dict[str, Any]]:
        data = await self._request(
            "market.history",
            {"symbol": symbol, "period": period, "bar": bar, "rth_only": rth_only},
        )
        return data.get("bars", [])

    async def chain(
        self,
        symbol: str,
        expiry: str | None = None,
        strike_range: str | None = None,
        option_type: OptionType | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"symbol": symbol}
        if expiry:
            params["expiry"] = expiry
        if strike_range:
            params["strike_range"] = strike_range
        if option_type:
            params["type"] = option_type
        return await self._request("market.chain", params)

    async def order(
        self,
        *,
        side: OrderSide,
        symbol: str,
        qty: float,
        limit: float | None = None,
        stop: float | None = None,
        tif: TimeInForce = "DAY",
        client_order_id: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "side": side,
            "symbol": symbol,
            "qty": qty,
            "tif": tif,
        }
        if limit is not None:
            params["limit"] = limit
        if stop is not None:
            params["stop"] = stop
        if client_order_id:
            params["client_order_id"] = client_order_id
        return await self._request("order.place", params)

    async def bracket(
        self,
        *,
        side: OrderSide,
        symbol: str,
        qty: float,
        entry: float,
        tp: float,
        sl: float,
        tif: TimeInForce = "DAY",
    ) -> dict[str, Any]:
        return await self._request(
            "order.bracket",
            {
                "side": side,
                "symbol": symbol,
                "qty": qty,
                "entry": entry,
                "tp": tp,
                "sl": sl,
                "tif": tif,
            },
        )

    async def order_status(self, order_id: str) -> dict[str, Any]:
        return await self._request("order.status", {"order_id": order_id})

    async def orders(self, status: OrderStatusFilter = "all", since: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"status": status}
        if since:
            params["since"] = since
        return await self._request("orders.list", params)

    async def cancel(self, order_id: str) -> dict[str, Any]:
        return await self._request("order.cancel", {"order_id": order_id})

    async def cancel_all(self, confirm: bool = True, json_mode: bool = True) -> dict[str, Any]:
        return await self._request("orders.cancel_all", {"confirm": confirm, "json_mode": json_mode})

    async def fills(self, since: str | None = None, symbol: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if since:
            params["since"] = since
        if symbol:
            params["symbol"] = symbol
        return await self._request("fills.list", params)

    async def positions(self, symbol: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if symbol:
            params["symbol"] = symbol
        return await self._request("portfolio.positions", params)

    async def pnl(self) -> dict[str, Any]:
        return await self._request("portfolio.pnl")

    async def balance(self) -> dict[str, Any]:
        return await self._request("portfolio.balance")

    async def exposure(self, by: ExposureGroupBy = "symbol") -> dict[str, Any]:
        return await self._request("portfolio.exposure", {"by": by})

    async def risk_check(
        self,
        *,
        side: OrderSide,
        symbol: str,
        qty: float,
        limit: float | None = None,
        stop: float | None = None,
        tif: TimeInForce = "DAY",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "side": side,
            "symbol": symbol,
            "qty": qty,
            "tif": tif,
        }
        if limit is not None:
            params["limit"] = limit
        if stop is not None:
            params["stop"] = stop
        return await self._request("risk.check", params)

    async def risk_limits(self) -> dict[str, Any]:
        return await self._request("risk.limits")

    async def risk_set(self, param: RiskParam, value: Any) -> dict[str, Any]:
        return await self._request("risk.set", {"param": param, "value": value})

    async def risk_halt(self) -> dict[str, Any]:
        return await self._request("risk.halt")

    async def risk_resume(self) -> dict[str, Any]:
        return await self._request("risk.resume")

    async def risk_override(self, *, param: RiskParam, value: Any, duration: str, reason: str) -> dict[str, Any]:
        return await self._request(
            "risk.override",
            {"param": param, "value": value, "duration": duration, "reason": reason},
        )

    async def heartbeat(self) -> dict[str, Any]:
        return await self._request("agent.heartbeat", {"sent_at": time.time()})

    async def audit_commands(self, source: AuditSource | None = None, since: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if source:
            params["source"] = source
        if since:
            params["since"] = since
        return await self._request("audit.commands", params)

    async def audit_orders(self, status: OrderStatusFilter | None = None, since: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if status:
            params["status"] = status
        if since:
            params["since"] = since
        return await self._request("audit.orders", params)

    async def audit_risk(self, event_type: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if event_type:
            params["type"] = event_type
        return await self._request("audit.risk", params)

    async def audit_export(
        self,
        *,
        output: str,
        table: AuditTable = "orders",
        fmt: Literal["csv"] = "csv",
        since: str | None = None,
        status: OrderStatusFilter | None = None,
        source: AuditSource | None = None,
        event_type: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"output": output, "table": table, "format": fmt}
        if since:
            params["since"] = since
        if status:
            params["status"] = status
        if source:
            params["source"] = source
        if event_type:
            params["type"] = event_type
        return await self._request("audit.export", params)


def _unwrap_response(response: Response) -> Any:
    if response.ok:
        return response.data

    error = response.error
    if not error:
        raise BrokerError(ErrorCode.INTERNAL_ERROR, "daemon returned malformed error response")

    code = ErrorCode(error.code) if error.code in {e.value for e in ErrorCode} else ErrorCode.INTERNAL_ERROR
    raise BrokerError(code, error.message, details=error.details, suggestion=error.suggestion)


async def _safe_wait_closed(writer: asyncio.StreamWriter) -> None:
    try:
        await writer.wait_closed()
    except Exception:
        return
