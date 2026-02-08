"""Interactive Brokers connection manager built on ib_async."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable

from pydantic import BaseModel

from broker_daemon.audit.logger import AuditLogger
from broker_daemon.config import GatewayConfig
from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.models.events import Event, EventTopic
from broker_daemon.models.market import Bar, OptionChain, OptionChainEntry, Quote
from broker_daemon.models.orders import FillRecord, OrderRequest
from broker_daemon.models.portfolio import Balance, ExposureEntry, PnLSummary, Position

logger = logging.getLogger(__name__)

CONNECTIVITY_ERROR_TOKENS = ("not connected", "disconnect", "connection", "socket", "transport")
VALID_EXPOSURE_GROUPS = {"symbol", "currency", "sector", "asset_class"}


class ConnectionStatus(BaseModel):
    connected: bool
    host: str
    port: int
    client_id: int
    connected_at: datetime | None = None
    server_version: int | None = None
    account_id: str | None = None
    last_error: str | None = None


class IBConnectionManager:
    """Thin async wrapper around ib_async that adds reconnect/event hooks."""

    def __init__(
        self,
        cfg: GatewayConfig,
        *,
        audit: AuditLogger | None = None,
        event_cb: Callable[[Event], Awaitable[None]] | None = None,
    ) -> None:
        self._cfg = cfg
        self._audit = audit
        self._event_cb = event_cb
        self._ib: Any | None = None
        self._connect_lock = asyncio.Lock()
        self._connected_at: datetime | None = None
        self._last_error: str | None = None
        self._reconnect_task: asyncio.Task[None] | None = None
        self._listeners_registered = False

    async def start(self) -> None:
        await self.connect()

    async def stop(self) -> None:
        if self._reconnect_task:
            self._reconnect_task.cancel()
            self._reconnect_task = None
        if self._ib is not None:
            self._ib.disconnect()
            self._ib = None
        self._listeners_registered = False
        self._connected_at = None

    async def connect(self) -> bool:
        async with self._connect_lock:
            if self.is_connected:
                return True
            try:
                ib_module = __import__("ib_async", fromlist=["IB"])
            except Exception as exc:
                self._last_error = f"ib_async import failed: {exc}"
                await self._log_connection("error", {"message": self._last_error})
                return False

            try:
                self._listeners_registered = False
                self._ib = ib_module.IB()
                await self._ib.connectAsync(
                    self._cfg.host,
                    self._cfg.port,
                    clientId=self._cfg.client_id,
                    timeout=10,
                )
            except Exception as exc:
                self._last_error = f"connect failed: {exc}"
                await self._log_connection(
                    "disconnected",
                    {"host": self._cfg.host, "port": self._cfg.port, "error": self._last_error},
                )
                self._schedule_reconnect()
                return False

            self._connected_at = datetime.now(UTC)
            self._last_error = None
            self._register_event_handlers()
            await self._log_connection(
                "connected",
                {
                    "host": self._cfg.host,
                    "port": self._cfg.port,
                    "client_id": self._cfg.client_id,
                },
            )
            return True

    @property
    def is_connected(self) -> bool:
        return bool(self._ib and self._ib.isConnected())

    def status(self) -> ConnectionStatus:
        server_version: int | None = None
        if self._ib and self._ib.client:
            try:
                server_version = int(self._ib.client.serverVersion())
            except Exception:
                server_version = None

        account_id = None
        if self._ib and self.is_connected:
            try:
                accounts = self._ib.managedAccounts()
                if accounts:
                    account_id = accounts[0]
            except Exception:
                account_id = None

        return ConnectionStatus(
            connected=self.is_connected,
            host=self._cfg.host,
            port=self._cfg.port,
            client_id=self._cfg.client_id,
            connected_at=self._connected_at,
            server_version=server_version,
            account_id=account_id,
            last_error=self._last_error,
        )

    async def ensure_connected(self) -> None:
        if self.is_connected:
            return
        ok = await self.connect()
        if not ok:
            raise BrokerError(
                ErrorCode.IB_DISCONNECTED,
                "daemon is not connected to IB Gateway",
                details={"host": self._cfg.host, "port": self._cfg.port, "last_error": self._last_error},
                suggestion="Verify IB Gateway/TWS is running and check [gateway] config host/port/client_id.",
            )

    def _register_event_handlers(self) -> None:
        if not self._ib or self._listeners_registered:
            return

        if hasattr(self._ib, "disconnectedEvent"):
            self._ib.disconnectedEvent += self._on_disconnected
        if hasattr(self._ib, "orderStatusEvent"):
            self._ib.orderStatusEvent += self._on_order_status
        if hasattr(self._ib, "execDetailsEvent"):
            self._ib.execDetailsEvent += self._on_exec_details
        self._listeners_registered = True

    def _schedule_reconnect(self) -> None:
        if not self._cfg.auto_reconnect:
            return
        if self._reconnect_task and not self._reconnect_task.done():
            return
        self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self) -> None:
        delay = 1
        while not self.is_connected:
            await asyncio.sleep(delay)
            ok = await self.connect()
            if ok:
                return
            delay = min(delay * 2, self._cfg.reconnect_backoff_max)

    def _on_disconnected(self, *_: Any) -> None:
        self._connected_at = None
        self._listeners_registered = False
        self._schedule_reconnect()
        asyncio.create_task(self._log_connection("disconnected", {"host": self._cfg.host, "port": self._cfg.port}))

    def _on_order_status(self, *args: Any) -> None:
        if not self._event_cb:
            return
        trade = args[0] if args else None
        if trade is None:
            return

        payload = {
            "ib_order_id": getattr(getattr(trade, "order", None), "orderId", None),
            "client_order_id": getattr(getattr(trade, "order", None), "orderRef", None),
            "status": getattr(getattr(trade, "orderStatus", None), "status", None),
            "filled": getattr(getattr(trade, "orderStatus", None), "filled", None),
            "remaining": getattr(getattr(trade, "orderStatus", None), "remaining", None),
        }
        asyncio.create_task(self._event_cb(Event(topic=EventTopic.ORDERS, payload=payload)))

    def _on_exec_details(self, *args: Any) -> None:
        if not self._event_cb:
            return
        if len(args) < 2:
            return
        trade, fill = args[0], args[1]
        payload = {
            "ib_order_id": getattr(getattr(trade, "order", None), "orderId", None),
            "client_order_id": getattr(getattr(trade, "order", None), "orderRef", None),
            "symbol": getattr(getattr(fill, "contract", None), "symbol", None),
            "qty": getattr(getattr(fill, "execution", None), "shares", None),
            "price": getattr(getattr(fill, "execution", None), "price", None),
            "fill_id": getattr(getattr(fill, "execution", None), "execId", None),
        }
        asyncio.create_task(self._event_cb(Event(topic=EventTopic.FILLS, payload=payload)))

    async def _log_connection(self, event: str, details: dict[str, Any]) -> None:
        logger.info("connection_event=%s details=%s", event, details)
        if self._audit:
            await self._audit.log_connection_event(event, details)
        if self._event_cb:
            await self._event_cb(Event(topic=EventTopic.CONNECTION, payload={"event": event, **details}))

    def _raise_mapped_error(
        self,
        operation: str,
        exc: Exception,
        *,
        default_code: ErrorCode = ErrorCode.IB_REJECTED,
        suggestion: str | None = None,
    ) -> None:
        if isinstance(exc, BrokerError):
            raise exc

        code = default_code
        if isinstance(exc, asyncio.TimeoutError):
            code = ErrorCode.TIMEOUT
        else:
            text = str(exc).lower()
            if any(token in text for token in CONNECTIVITY_ERROR_TOKENS):
                code = ErrorCode.IB_DISCONNECTED
            elif default_code == ErrorCode.INVALID_SYMBOL and any(token in text for token in ("symbol", "contract")):
                code = ErrorCode.INVALID_SYMBOL

        raise BrokerError(
            code,
            f"{operation} failed: {exc}",
            details={
                "operation": operation,
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
            suggestion=suggestion or _suggestion_for_error_code(code),
        ) from exc

    async def quote(self, symbols: list[str]) -> list[Quote]:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            ib_mod = __import__("ib_async", fromlist=["Stock"])
            Stock = getattr(ib_mod, "Stock")
            contracts = [Stock(sym.upper(), "SMART", "USD") for sym in symbols]
            try:
                await self._ib.qualifyContractsAsync(*contracts)
            except Exception:
                # Some symbols qualify directly via reqTickers.
                pass

            tickers = await self._ib.reqTickersAsync(*contracts)
            out: list[Quote] = []
            for ticker in tickers:
                ts = getattr(ticker, "time", None) or datetime.now(UTC)
                out.append(
                    Quote(
                        symbol=ticker.contract.symbol,
                        bid=_to_float_or_none(getattr(ticker, "bid", None)),
                        ask=_to_float_or_none(getattr(ticker, "ask", None)),
                        last=_to_float_or_none(getattr(ticker, "last", None)),
                        volume=_to_float_or_none(getattr(ticker, "volume", None)),
                        timestamp=ts,
                        exchange=getattr(ticker.contract, "exchange", None),
                        currency=getattr(ticker.contract, "currency", "USD") or "USD",
                    )
                )
            return out
        except Exception as exc:
            self._raise_mapped_error("quote", exc, suggestion="Confirm market data permissions and symbol validity.")

    async def history(self, symbol: str, period: str, bar: str, rth_only: bool) -> list[Bar]:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            duration_map = {
                "1d": "1 D",
                "5d": "5 D",
                "30d": "30 D",
                "90d": "90 D",
                "1y": "1 Y",
            }
            bar_map = {
                "1m": "1 min",
                "5m": "5 mins",
                "15m": "15 mins",
                "1h": "1 hour",
                "1d": "1 day",
            }
            if period not in duration_map:
                raise BrokerError(ErrorCode.INVALID_ARGS, f"unsupported period '{period}'")
            if bar not in bar_map:
                raise BrokerError(ErrorCode.INVALID_ARGS, f"unsupported bar size '{bar}'")

            ib_mod = __import__("ib_async", fromlist=["Stock"])
            Stock = getattr(ib_mod, "Stock")
            contract = Stock(symbol.upper(), "SMART", "USD")
            await self._ib.qualifyContractsAsync(contract)
            bars = await self._ib.reqHistoricalDataAsync(
                contract,
                endDateTime="",
                durationStr=duration_map[period],
                barSizeSetting=bar_map[bar],
                whatToShow="TRADES",
                useRTH=rth_only,
                formatDate=1,
                keepUpToDate=False,
            )
            result: list[Bar] = []
            for row in bars:
                result.append(
                    Bar(
                        symbol=symbol.upper(),
                        time=getattr(row, "date", datetime.now(UTC)),
                        open=float(row.open),
                        high=float(row.high),
                        low=float(row.low),
                        close=float(row.close),
                        volume=float(row.volume),
                    )
                )
            return result
        except Exception as exc:
            self._raise_mapped_error("history", exc, suggestion="Validate period/bar and confirm historical data permissions.")

    async def option_chain(
        self,
        symbol: str,
        expiry_prefix: str | None,
        strike_range: tuple[float, float] | None,
        option_type: str | None,
    ) -> OptionChain:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            ib_mod = __import__("ib_async", fromlist=["Stock"])
            Stock = getattr(ib_mod, "Stock")
            contract = Stock(symbol.upper(), "SMART", "USD")
            qualified = await self._ib.qualifyContractsAsync(contract)
            if not qualified:
                raise BrokerError(ErrorCode.INVALID_SYMBOL, f"unable to qualify symbol {symbol}")

            ticker = (await self._ib.reqTickersAsync(contract))[0]
            market_price_attr = getattr(ticker, "marketPrice", None)
            if callable(market_price_attr):
                underlying = _to_float_or_none(market_price_attr())
            else:
                underlying = _to_float_or_none(market_price_attr)
            if underlying is None:
                underlying = _to_float_or_none(getattr(ticker, "last", None))
            chain_rows = await self._ib.reqSecDefOptParamsAsync(symbol.upper(), "", contract.secType, contract.conId)
            if not chain_rows:
                return OptionChain(symbol=symbol.upper(), underlying_price=underlying, entries=[])

            row = next((r for r in chain_rows if getattr(r, "exchange", "") == "SMART"), chain_rows[0])
            expirations = sorted(getattr(row, "expirations", []))
            strikes = sorted(float(s) for s in getattr(row, "strikes", []))

            if expiry_prefix:
                expirations = [exp for exp in expirations if str(exp).startswith(expiry_prefix.replace("-", ""))]
            if strike_range and underlying:
                lo, hi = strike_range
                strikes = [s for s in strikes if underlying * lo <= s <= underlying * hi]

            rights: list[str]
            if option_type is None:
                rights = ["C", "P"]
            else:
                rights = ["C" if option_type == "call" else "P"]

            entries: list[OptionChainEntry] = []
            for exp in expirations[:8]:
                for strike in strikes[:80]:
                    for right in rights:
                        entries.append(
                            OptionChainEntry(
                                symbol=symbol.upper(),
                                right=right,
                                strike=strike,
                                expiry=f"{exp[:4]}-{exp[4:6]}-{exp[6:8]}",
                            )
                        )
            return OptionChain(symbol=symbol.upper(), underlying_price=underlying, entries=entries)
        except Exception as exc:
            self._raise_mapped_error(
                "option_chain",
                exc,
                default_code=ErrorCode.INVALID_SYMBOL,
                suggestion="Check symbol validity and options market-data permissions.",
            )

    async def positions(self) -> list[Position]:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            positions_raw = list(self._ib.positions())
            quotes = await self.quote(sorted({p.contract.symbol for p in positions_raw if getattr(p, "contract", None)}))
            by_symbol = {q.symbol: q for q in quotes}

            out: list[Position] = []
            for row in positions_raw:
                symbol = row.contract.symbol
                avg_cost = float(getattr(row, "avgCost", 0.0))
                qty = float(getattr(row, "position", 0.0))
                q = by_symbol.get(symbol)
                market_price = q.last if q and q.last is not None else q.bid if q and q.bid is not None else None
                market_value = market_price * qty if market_price is not None else None
                unrealized = (market_price - avg_cost) * qty if market_price is not None else None
                out.append(
                    Position(
                        symbol=symbol,
                        qty=qty,
                        avg_cost=avg_cost,
                        market_price=market_price,
                        market_value=market_value,
                        unrealized_pnl=unrealized,
                        currency=getattr(row.contract, "currency", "USD") or "USD",
                    )
                )
            return out
        except Exception as exc:
            self._raise_mapped_error("positions", exc)

    async def balance(self) -> Balance:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            values = await self._ib.accountSummaryAsync()
            by_tag = {f"{v.tag}:{v.currency}": v.value for v in values}
            account = values[0].account if values else None

            net_liq = _read_account_value(by_tag, "NetLiquidation")
            cash = _read_account_value(by_tag, "TotalCashValue")
            buying_power = _read_account_value(by_tag, "BuyingPower")
            margin_used = _read_account_value(by_tag, "MaintMarginReq")
            margin_available = _read_account_value(by_tag, "AvailableFunds")

            return Balance(
                account_id=account,
                net_liquidation=net_liq,
                cash=cash,
                buying_power=buying_power,
                margin_used=margin_used,
                margin_available=margin_available,
            )
        except Exception as exc:
            self._raise_mapped_error("balance", exc, suggestion="Verify account permissions and IB connectivity.")

    async def pnl(self) -> PnLSummary:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            values = await self._ib.accountSummaryAsync()
            by_tag = {f"{v.tag}:{v.currency}": v.value for v in values}
            realized = _read_account_value(by_tag, "RealizedPnL") or 0.0
            unrealized = _read_account_value(by_tag, "UnrealizedPnL") or 0.0
            return PnLSummary(realized=realized, unrealized=unrealized, total=realized + unrealized)
        except Exception as exc:
            self._raise_mapped_error("pnl", exc)

    async def exposure(self, by: str) -> list[ExposureEntry]:
        if by not in VALID_EXPOSURE_GROUPS:
            allowed = ", ".join(sorted(VALID_EXPOSURE_GROUPS))
            raise BrokerError(
                ErrorCode.INVALID_ARGS,
                f"unsupported exposure group '{by}'",
                details={"allowed": sorted(VALID_EXPOSURE_GROUPS)},
                suggestion=f"Use one of: {allowed}",
            )

        positions = await self.positions()
        balance = await self.balance()
        nlv = float(balance.net_liquidation or 0.0)
        if nlv <= 0:
            nlv = sum(abs(p.market_value or 0.0) for p in positions) or 1.0

        buckets: dict[str, float] = {}
        for pos in positions:
            if by == "symbol":
                key = pos.symbol
            elif by == "currency":
                key = pos.currency
            else:
                key = "portfolio"
            buckets[key] = buckets.get(key, 0.0) + abs(pos.market_value or pos.avg_cost * pos.qty)

        return [
            ExposureEntry(key=key, exposure_value=value, exposure_pct=(value / nlv) * 100.0)
            for key, value in sorted(buckets.items())
        ]

    async def place_order(self, order: OrderRequest, client_order_id: str) -> dict[str, Any]:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            ib_mod = __import__(
                "ib_async",
                fromlist=["Stock", "MarketOrder", "LimitOrder", "StopOrder", "StopLimitOrder"],
            )
            Stock = getattr(ib_mod, "Stock")
            MarketOrder = getattr(ib_mod, "MarketOrder")
            LimitOrder = getattr(ib_mod, "LimitOrder")
            StopOrder = getattr(ib_mod, "StopOrder")
            StopLimitOrder = getattr(ib_mod, "StopLimitOrder")

            contract = Stock(order.symbol.upper(), "SMART", "USD")
            await self._ib.qualifyContractsAsync(contract)
            action = order.side.value.upper()
            qty = abs(order.qty)

            if order.limit is not None and order.stop is not None:
                ib_order = StopLimitOrder(action, qty, order.stop, order.limit, tif=order.tif.value)
            elif order.limit is not None:
                ib_order = LimitOrder(action, qty, order.limit, tif=order.tif.value)
            elif order.stop is not None:
                ib_order = StopOrder(action, qty, order.stop, tif=order.tif.value)
            else:
                ib_order = MarketOrder(action, qty, tif=order.tif.value)

            ib_order.orderRef = client_order_id
            trade = self._ib.placeOrder(contract, ib_order)

            # IB sends multiple status events; capture the first available status quickly.
            status = None
            for _ in range(20):
                status = getattr(getattr(trade, "orderStatus", None), "status", None)
                if status:
                    break
                await asyncio.sleep(0.05)

            return {
                "ib_order_id": getattr(getattr(trade, "order", None), "orderId", None),
                "status": status or "Submitted",
            }
        except Exception as exc:
            self._raise_mapped_error("place_order", exc, suggestion="Validate contract details and verify trading permissions.")

    async def place_bracket(
        self,
        *,
        side: str,
        symbol: str,
        qty: float,
        entry: float,
        tp: float,
        sl: float,
        tif: str,
        client_order_id: str,
    ) -> dict[str, Any]:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            ib_mod = __import__("ib_async", fromlist=["Stock"])
            Stock = getattr(ib_mod, "Stock")
            contract = Stock(symbol.upper(), "SMART", "USD")
            await self._ib.qualifyContractsAsync(contract)

            bracket_orders = self._ib.bracketOrder(side.upper(), qty, entry, tp, sl)
            order_ids: list[int] = []
            for idx, ib_order in enumerate(bracket_orders):
                ib_order.tif = tif
                ib_order.orderRef = f"{client_order_id}:{idx}"
                trade = self._ib.placeOrder(contract, ib_order)
                oid = getattr(getattr(trade, "order", None), "orderId", None)
                if oid is not None:
                    order_ids.append(int(oid))

            return {"ib_order_ids": order_ids, "status": "Submitted"}
        except Exception as exc:
            self._raise_mapped_error("place_bracket", exc, suggestion="Verify bracket prices and order permissions.")

    async def cancel_order(self, client_order_id: str | None = None, ib_order_id: int | None = None) -> dict[str, Any]:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            for trade in list(self._ib.openTrades()):
                order = getattr(trade, "order", None)
                if order is None:
                    continue
                if client_order_id and getattr(order, "orderRef", None) == client_order_id:
                    self._ib.cancelOrder(order)
                    return {"cancelled": True, "ib_order_id": getattr(order, "orderId", None)}
                if ib_order_id is not None and getattr(order, "orderId", None) == ib_order_id:
                    self._ib.cancelOrder(order)
                    return {"cancelled": True, "ib_order_id": ib_order_id}
            return {"cancelled": False}
        except Exception as exc:
            self._raise_mapped_error("cancel_order", exc)

    async def cancel_all(self) -> dict[str, Any]:
        try:
            await self.ensure_connected()
            assert self._ib is not None
            self._ib.reqGlobalCancel()
            return {"cancelled": True}
        except Exception as exc:
            self._raise_mapped_error("cancel_all", exc)

    async def trades(self) -> list[dict[str, Any]]:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            out: list[dict[str, Any]] = []
            for trade in list(self._ib.trades()):
                order = getattr(trade, "order", None)
                status = getattr(getattr(trade, "orderStatus", None), "status", None)
                out.append(
                    {
                        "ib_order_id": getattr(order, "orderId", None),
                        "client_order_id": getattr(order, "orderRef", None),
                        "symbol": getattr(getattr(trade, "contract", None), "symbol", None),
                        "status": status,
                        "action": getattr(order, "action", None),
                        "qty": getattr(order, "totalQuantity", None),
                        "filled": getattr(getattr(trade, "orderStatus", None), "filled", None),
                        "remaining": getattr(getattr(trade, "orderStatus", None), "remaining", None),
                        "avg_fill_price": getattr(getattr(trade, "orderStatus", None), "avgFillPrice", None),
                    }
                )
            return out
        except Exception as exc:
            self._raise_mapped_error("trades", exc)

    async def fills(self) -> list[FillRecord]:
        try:
            await self.ensure_connected()
            assert self._ib is not None

            out: list[FillRecord] = []
            for fill in list(self._ib.fills()):
                execution = getattr(fill, "execution", None)
                commission_report = getattr(fill, "commissionReport", None)
                contract = getattr(fill, "contract", None)
                out.append(
                    FillRecord(
                        fill_id=getattr(execution, "execId", ""),
                        client_order_id=getattr(execution, "orderRef", ""),
                        ib_order_id=getattr(execution, "orderId", None),
                        symbol=getattr(contract, "symbol", ""),
                        qty=float(getattr(execution, "shares", 0.0)),
                        price=float(getattr(execution, "price", 0.0)),
                        commission=_to_float_or_none(getattr(commission_report, "commission", None)),
                        timestamp=getattr(fill, "time", datetime.now(UTC)),
                    )
                )
            return out
        except Exception as exc:
            self._raise_mapped_error("fills", exc)


def _to_float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _read_account_value(by_tag: dict[str, str], tag: str) -> float | None:
    keys = [f"{tag}:USD", f"{tag}:BASE", tag]
    for key in keys:
        if key in by_tag:
            try:
                return float(by_tag[key])
            except Exception:
                return None
    return None


def _suggestion_for_error_code(code: ErrorCode) -> str | None:
    suggestions = {
        ErrorCode.IB_DISCONNECTED: "Ensure IB Gateway/TWS is running and credentials/session are valid.",
        ErrorCode.INVALID_SYMBOL: "Confirm the symbol is tradeable in your IB account and market.",
        ErrorCode.TIMEOUT: "Retry and consider increasing timeout settings if the gateway is slow.",
        ErrorCode.IB_REJECTED: "Review order parameters and account permissions, then retry.",
    }
    return suggestions.get(code)
