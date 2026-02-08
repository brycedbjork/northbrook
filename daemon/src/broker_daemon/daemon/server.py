"""Unix-domain socket daemon exposing broker command protocol."""

from __future__ import annotations

import argparse
import asyncio
from difflib import get_close_matches
import logging
import os
import signal
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from broker_daemon.audit.logger import AuditLogger
from broker_daemon.audit.query import export_rows_to_csv, query_commands, query_orders, query_risk_events
from broker_daemon.config import AppConfig, load_config
from broker_daemon.daemon.connection import IBConnectionManager
from broker_daemon.daemon.market_data import MarketDataService
from broker_daemon.daemon.order_manager import OrderManager
from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.models.events import Event, EventTopic
from broker_daemon.models.orders import FillRecord, OrderRequest
from broker_daemon.protocol import ErrorResponse, EventEnvelope, Request, Response, decode_request, encode_model, frame_payload, read_framed
from broker_daemon.risk.engine import RiskEngine
from broker_daemon.risk.monitor import ConnectionLossMonitor, HeartbeatMonitor

logger = logging.getLogger(__name__)

KNOWN_COMMANDS: tuple[str, ...] = (
    "daemon.status",
    "daemon.stop",
    "quote.snapshot",
    "market.history",
    "market.chain",
    "portfolio.positions",
    "portfolio.balance",
    "portfolio.pnl",
    "portfolio.exposure",
    "order.place",
    "order.bracket",
    "order.status",
    "orders.list",
    "order.cancel",
    "orders.cancel_all",
    "fills.list",
    "risk.check",
    "risk.limits",
    "risk.set",
    "risk.halt",
    "risk.resume",
    "risk.override",
    "agent.heartbeat",
    "agent.subscribe",
    "audit.commands",
    "audit.orders",
    "audit.risk",
    "audit.export",
)
ORDER_STATUSES = {"active", "filled", "cancelled", "all"}
OPTION_TYPES = {"call", "put"}


@dataclass
class Subscriber:
    writer: asyncio.StreamWriter
    topics: set[str]


class DaemonServer:
    def __init__(self, cfg: AppConfig) -> None:
        self._cfg = cfg
        self._start_monotonic = time.monotonic()
        self._shutdown = asyncio.Event()

        self._audit = AuditLogger(cfg.logging.audit_db)
        self._risk = RiskEngine(cfg.risk)
        self._heartbeat = HeartbeatMonitor(cfg.agent.heartbeat_timeout_seconds)
        self._connection_loss = ConnectionLossMonitor(threshold_seconds=30)

        self._connection = IBConnectionManager(cfg.gateway, audit=self._audit, event_cb=self._on_broker_event)
        self._market_data = MarketDataService(self._connection)
        self._orders = OrderManager(
            connection=self._connection,
            risk=self._risk,
            audit=self._audit,
            event_cb=self._broadcast_event,
        )

        self._server: asyncio.AbstractServer | None = None
        self._subscribers: list[Subscriber] = []
        self._monitor_task: asyncio.Task[None] | None = None

    @property
    def socket_path(self) -> Path:
        return self._cfg.runtime.socket_path

    async def start(self) -> None:
        self._cfg.ensure_dirs()
        await self._audit.start()
        await self._connection.start()

        if self.socket_path.exists():
            self.socket_path.unlink()

        self._server = await asyncio.start_unix_server(self._handle_client, path=str(self.socket_path))
        os.chmod(self.socket_path, 0o600)
        self._cfg.runtime.pid_file.write_text(str(os.getpid()), encoding="utf-8")

        self._monitor_task = asyncio.create_task(self._monitor_loop())
        await self._audit.log_connection_event("daemon_started", {"socket": str(self.socket_path)})

    async def serve(self) -> None:
        if not self._server:
            raise RuntimeError("server not started")

        async with self._server:
            await self._shutdown.wait()

    async def stop(self) -> None:
        if self._shutdown.is_set():
            return

        self._shutdown.set()

        if self._monitor_task:
            self._monitor_task.cancel()
            self._monitor_task = None

        for sub in list(self._subscribers):
            sub.writer.close()
            await _safe_wait_closed(sub.writer)
        self._subscribers.clear()

        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

        await self._connection.stop()
        await self._audit.log_connection_event("daemon_stopped", {})
        await self._audit.close()

        if self.socket_path.exists():
            self.socket_path.unlink()
        if self._cfg.runtime.pid_file.exists():
            self._cfg.runtime.pid_file.unlink()

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        request: Request | None = None
        result_code = 0

        try:
            payload = await read_framed(reader)
            request = decode_request(payload)

            if request.stream and request.command == "agent.subscribe":
                await self._register_subscriber(request, reader, writer)
                return

            data = await self._dispatch(request)
            response = Response(request_id=request.request_id, ok=True, data=data)
        except asyncio.IncompleteReadError:
            writer.close()
            await _safe_wait_closed(writer)
            return
        except (ValidationError, KeyError, TypeError, ValueError) as exc:
            req_id = request.request_id if request else ""
            err = _invalid_args_error(exc)
            result_code = err.exit_code
            response = Response(
                request_id=req_id,
                ok=False,
                error=ErrorResponse.model_validate(err.to_error_payload()),
            )
        except BrokerError as exc:
            result_code = exc.exit_code
            req_id = request.request_id if request else ""
            response = Response(
                request_id=req_id,
                ok=False,
                error=ErrorResponse.model_validate(exc.to_error_payload()),
            )
        except Exception as exc:
            logger.exception("unhandled daemon error")
            result_code = 1
            req_id = request.request_id if request else ""
            response = Response(
                request_id=req_id,
                ok=False,
                error=ErrorResponse(
                    code=ErrorCode.INTERNAL_ERROR.value,
                    message=str(exc),
                ),
            )

        writer.write(frame_payload(encode_model(response)))
        await writer.drain()
        writer.close()
        await _safe_wait_closed(writer)

        if request:
            await self._audit.log_command(request.source, request.command, request.params, result_code)

    async def _register_subscriber(
        self,
        request: Request,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        topics = set(str(v).lower() for v in request.params.get("topics", []))
        if not topics:
            topics = {e.value for e in EventTopic}
        invalid_topics = sorted(topics - {e.value for e in EventTopic})
        if invalid_topics:
            valid = sorted(e.value for e in EventTopic)
            raise BrokerError(
                ErrorCode.INVALID_ARGS,
                f"unsupported subscription topic(s): {', '.join(invalid_topics)}",
                details={"invalid_topics": invalid_topics, "valid_topics": valid},
                suggestion=f"Use topics from: {', '.join(valid)}",
            )

        sub = Subscriber(writer=writer, topics=topics)
        self._subscribers.append(sub)
        await self._audit.log_command(request.source, request.command, request.params, 0)

        response = Response(request_id=request.request_id, ok=True, data={"subscribed": sorted(topics)})
        writer.write(frame_payload(encode_model(response)))
        await writer.drain()

        try:
            while not reader.at_eof() and not self._shutdown.is_set():
                await asyncio.sleep(1)
        finally:
            if sub in self._subscribers:
                self._subscribers.remove(sub)
            writer.close()
            await _safe_wait_closed(writer)

    async def _dispatch(self, request: Request) -> dict[str, Any]:
        cmd = request.command
        p = request.params

        if cmd == "daemon.status":
            return await self._cmd_daemon_status()
        if cmd == "daemon.stop":
            asyncio.create_task(self.stop())
            return {"stopping": True}

        if cmd == "quote.snapshot":
            symbols = [str(s).upper() for s in p.get("symbols", [])]
            if not symbols:
                raise BrokerError(
                    ErrorCode.INVALID_ARGS,
                    "symbols is required and must contain at least one item",
                    suggestion="Example: broker quote AAPL MSFT",
                )
            quotes = await self._market_data.quote(symbols, force_refresh=bool(p.get("force", False)))
            return {"quotes": [q.model_dump(mode="json") for q in quotes]}

        if cmd == "market.history":
            bars = await self._connection.history(
                symbol=str(p["symbol"]),
                period=str(p.get("period", "30d")),
                bar=str(p.get("bar", "1h")),
                rth_only=bool(p.get("rth_only", False)),
            )
            return {"bars": [b.model_dump(mode="json") for b in bars]}

        if cmd == "market.chain":
            strike_range = _parse_strike_range(p.get("strike_range"))
            option_type = p.get("type")
            if option_type is not None and str(option_type).lower() not in OPTION_TYPES:
                raise BrokerError(
                    ErrorCode.INVALID_ARGS,
                    f"unsupported option type '{option_type}'",
                    details={"valid_types": sorted(OPTION_TYPES)},
                    suggestion="Use --type call or --type put",
                )
            chain = await self._connection.option_chain(
                symbol=str(p["symbol"]),
                expiry_prefix=p.get("expiry"),
                strike_range=strike_range,
                option_type=str(option_type).lower() if option_type is not None else None,
            )
            return chain.model_dump(mode="json")

        if cmd == "portfolio.positions":
            positions = await self._connection.positions()
            symbol = p.get("symbol")
            if symbol:
                positions = [x for x in positions if x.symbol.upper() == str(symbol).upper()]
            return {"positions": [x.model_dump(mode="json") for x in positions]}

        if cmd == "portfolio.balance":
            return {"balance": (await self._connection.balance()).model_dump(mode="json")}

        if cmd == "portfolio.pnl":
            return {"pnl": (await self._connection.pnl()).model_dump(mode="json")}

        if cmd == "portfolio.exposure":
            by = str(p.get("by", "symbol"))
            rows = await self._connection.exposure(by)
            return {"exposure": [r.model_dump(mode="json") for r in rows], "by": by}

        if cmd == "order.place":
            req = OrderRequest.model_validate(p)
            record = await self._orders.place_order(req)
            return {"order": record.model_dump(mode="json")}

        if cmd == "order.bracket":
            res = await self._orders.place_bracket(
                side=str(p.get("side", "buy")),
                symbol=str(p["symbol"]),
                qty=float(p["qty"]),
                entry=float(p["entry"]),
                tp=float(p["tp"]),
                sl=float(p["sl"]),
                tif=str(p.get("tif", "DAY")),
            )
            return res

        if cmd == "order.status":
            order_id = str(p["order_id"])
            item = await self._orders.order_status(order_id)
            if item is None:
                raise BrokerError(ErrorCode.INVALID_ARGS, f"unknown order_id '{order_id}'")
            return {"order": item}

        if cmd == "orders.list":
            status = str(p.get("status", "all"))
            if status.lower() not in ORDER_STATUSES:
                valid = ", ".join(sorted(ORDER_STATUSES))
                raise BrokerError(
                    ErrorCode.INVALID_ARGS,
                    f"unsupported orders status '{status}'",
                    details={"valid_statuses": sorted(ORDER_STATUSES)},
                    suggestion=f"Use --status one of: {valid}",
                )
            rows = await self._orders.list_orders(status=status)
            if since := p.get("since"):
                rows = [r for r in rows if str(r.get("submitted_at", "")) >= str(since)]
            return {"orders": rows}

        if cmd == "order.cancel":
            order_id = str(p["order_id"])
            return await self._orders.cancel_order(order_id)

        if cmd == "orders.cancel_all":
            if not bool(p.get("confirm", False)) and not bool(p.get("json_mode", False)):
                raise BrokerError(
                    ErrorCode.INVALID_ARGS,
                    "cancel --all requires --confirm (unless JSON mode)",
                )
            return await self._orders.cancel_all()

        if cmd == "fills.list":
            symbol = p.get("symbol")
            rows = await self._orders.list_fills(symbol=symbol)
            if since := p.get("since"):
                rows = [r for r in rows if str(r.get("timestamp", "")) >= str(since)]
            return {"fills": rows}

        if cmd == "risk.check":
            req = OrderRequest.model_validate(p)
            context = await self._orders._risk_context()  # noqa: SLF001
            result = self._risk.check_order(req, context)
            event_type = "check_passed" if result.ok else "check_failed"
            await self._audit.log_risk_event(event_type, result.model_dump(mode="json"))
            return result.model_dump(mode="json")

        if cmd == "risk.limits":
            return {"limits": self._risk.snapshot().model_dump(mode="json")}

        if cmd == "risk.set":
            try:
                snapshot = self._risk.set_limit(str(p["param"]), p["value"])
            except ValueError as exc:
                raise BrokerError(ErrorCode.INVALID_ARGS, str(exc)) from exc
            await self._audit.log_risk_event("set", {"param": p["param"], "value": p["value"]})
            return {"limits": snapshot.model_dump(mode="json")}

        if cmd == "risk.halt":
            self._risk.halt()
            await self._orders.cancel_all()
            await self._audit.log_risk_event("halt", {"source": request.source})
            await self._broadcast_event(Event(topic=EventTopic.RISK, payload={"event": "halt"}))
            return {"halted": True}

        if cmd == "risk.resume":
            self._risk.resume()
            await self._audit.log_risk_event("resume", {"source": request.source})
            await self._broadcast_event(Event(topic=EventTopic.RISK, payload={"event": "resume"}))
            return {"halted": False}

        if cmd == "risk.override":
            try:
                duration = str(p.get("duration", "1h"))
                seconds = self._risk.parse_duration(duration)
                override = self._risk.override_limit(
                    param=str(p["param"]),
                    value=p["value"],
                    duration_seconds=seconds,
                    reason=str(p.get("reason", "manual override")),
                )
            except ValueError as exc:
                raise BrokerError(ErrorCode.INVALID_ARGS, str(exc)) from exc
            await self._audit.log_risk_event("override", override.model_dump(mode="json"))
            return {"override": override.model_dump(mode="json")}

        if cmd == "agent.heartbeat":
            self._heartbeat.beat()
            sent_at = p.get("sent_at")
            latency_ms = None
            if sent_at is not None:
                try:
                    latency_ms = max(0.0, (time.time() - float(sent_at)) * 1000.0)
                except Exception:
                    latency_ms = None
            return {
                "ok": True,
                "latency_ms": latency_ms,
                "connected": self._connection.is_connected,
                "halted": self._risk.halted,
            }

        if cmd == "audit.commands":
            rows = await query_commands(self._audit, source=p.get("source"), since=p.get("since"))
            return {"commands": rows}

        if cmd == "audit.orders":
            rows = await query_orders(self._audit, status=p.get("status"), since=p.get("since"))
            return {"orders": rows}

        if cmd == "audit.risk":
            rows = await query_risk_events(self._audit, event_type=p.get("type"))
            return {"risk_events": rows}

        if cmd == "audit.export":
            target = Path(str(p["output"])).expanduser()
            fmt = str(p.get("format", "csv"))
            if fmt != "csv":
                raise BrokerError(ErrorCode.INVALID_ARGS, "only csv export is currently supported")

            table = str(p.get("table", "orders"))
            if table == "commands":
                rows = await query_commands(self._audit, source=p.get("source"), since=p.get("since"))
            elif table == "risk":
                rows = await query_risk_events(self._audit, event_type=p.get("type"))
            else:
                rows = await query_orders(self._audit, status=p.get("status"), since=p.get("since"))
            export_rows_to_csv(rows, target)
            return {"output": str(target), "rows": len(rows)}

        raise _unknown_command_error(cmd)

    async def _cmd_daemon_status(self) -> dict[str, Any]:
        status = self._connection.status()
        return {
            "uptime_seconds": round(time.monotonic() - self._start_monotonic, 3),
            "connection": status.model_dump(mode="json"),
            "risk_halted": self._risk.halted,
            "time_sync_delta_ms": None,
            "socket": str(self.socket_path),
        }

    async def _on_broker_event(self, event: Event) -> None:
        if event.topic == EventTopic.CONNECTION:
            label = str(event.payload.get("event", ""))
            if label == "connected":
                self._connection_loss.on_connected()
            if label == "disconnected":
                self._connection_loss.on_disconnected()

        if event.topic == EventTopic.ORDERS:
            client_order_id = event.payload.get("client_order_id")
            status = event.payload.get("status")
            if client_order_id and status:
                await self._orders.update_order_status(
                    client_order_id=str(client_order_id),
                    status=str(status),
                    filled=_maybe_float(event.payload.get("filled")),
                    avg_fill_price=_maybe_float(event.payload.get("avg_fill_price")),
                )

        if event.topic == EventTopic.FILLS:
            fill_id = event.payload.get("fill_id")
            symbol = event.payload.get("symbol")
            if fill_id and symbol:
                fill = FillRecord(
                    fill_id=str(fill_id),
                    client_order_id=str(event.payload.get("client_order_id") or ""),
                    ib_order_id=_maybe_int(event.payload.get("ib_order_id")),
                    symbol=str(symbol),
                    qty=float(event.payload.get("qty") or 0.0),
                    price=float(event.payload.get("price") or 0.0),
                )
                await self._orders.add_fill(fill)

        await self._broadcast_event(event)

    async def _broadcast_event(self, event: Event) -> None:
        if not self._subscribers:
            return

        envelope = EventEnvelope(topic=event.topic.value, data=event.model_dump(mode="json"))
        payload = frame_payload(encode_model(envelope))

        stale: list[Subscriber] = []
        for sub in self._subscribers:
            if event.topic.value not in sub.topics:
                continue
            try:
                sub.writer.write(payload)
                await sub.writer.drain()
            except Exception:
                stale.append(sub)
        for sub in stale:
            if sub in self._subscribers:
                self._subscribers.remove(sub)

    async def _monitor_loop(self) -> None:
        while not self._shutdown.is_set():
            await asyncio.sleep(5)

            if self._connection_loss.breached() and not self._risk.halted:
                self._risk.halt()
                await self._audit.log_risk_event("halt", {"reason": "connection_loss"})
                await self._broadcast_event(Event(topic=EventTopic.RISK, payload={"event": "halt", "reason": "connection_loss"}))

            if self._heartbeat.is_timed_out():
                seconds = self._heartbeat.seconds_since_last()
                await self._audit.log_risk_event("heartbeat_timeout", {"seconds_since_last": seconds})
                if self._cfg.agent.on_heartbeat_timeout == "halt" and not self._risk.halted:
                    self._risk.halt()
                    await self._broadcast_event(
                        Event(topic=EventTopic.RISK, payload={"event": "halt", "reason": "heartbeat_timeout"})
                    )

            if self._connection.is_connected:
                try:
                    balance = await self._connection.balance()
                    pnl = await self._connection.pnl()
                    nlv = float(balance.net_liquidation or 0.0)
                    breached, loss_pct = self._risk.check_drawdown_breaker(pnl.total, nlv)
                    if breached and not self._risk.halted:
                        self._risk.halt()
                        await self._audit.log_risk_event(
                            "halt",
                            {
                                "reason": "drawdown_breaker",
                                "daily_pnl": pnl.total,
                                "loss_pct": loss_pct,
                            },
                        )
                        await self._broadcast_event(
                            Event(topic=EventTopic.RISK, payload={"event": "halt", "reason": "drawdown_breaker"})
                        )
                except Exception:
                    logger.debug("drawdown monitor skipped due to transient error", exc_info=True)


def _parse_strike_range(raw: Any) -> tuple[float, float] | None:
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)) and len(raw) == 2:
        try:
            return float(raw[0]), float(raw[1])
        except (TypeError, ValueError) as exc:
            raise BrokerError(
                ErrorCode.INVALID_ARGS,
                "strike-range must be numeric",
                suggestion="Use --strike-range values like 0.8:1.2",
            ) from exc
    text = str(raw)
    if ":" not in text:
        raise BrokerError(
            ErrorCode.INVALID_ARGS,
            "strike-range must be like 0.8:1.2",
            suggestion="Example: broker chain AAPL --strike-range 0.8:1.2",
        )
    left, right = text.split(":", maxsplit=1)
    try:
        return float(left), float(right)
    except ValueError as exc:
        raise BrokerError(
            ErrorCode.INVALID_ARGS,
            "strike-range must be numeric, like 0.8:1.2",
            suggestion="Example: broker chain AAPL --strike-range 0.8:1.2",
        ) from exc


def _unknown_command_error(command: str) -> BrokerError:
    matches = get_close_matches(command, KNOWN_COMMANDS, n=3, cutoff=0.45)
    suggestion = None
    if matches:
        suggestion = f"Did you mean: {', '.join(matches)}"
    return BrokerError(
        ErrorCode.INVALID_ARGS,
        f"unknown command '{command}'",
        details={"known_commands": sorted(KNOWN_COMMANDS)},
        suggestion=suggestion,
    )


def _invalid_args_error(exc: Exception) -> BrokerError:
    details = {"exception": type(exc).__name__}
    message = str(exc)
    suggestion = "Run `broker --help` or `<command> --help` for expected parameters."
    if isinstance(exc, KeyError):
        missing = str(exc).strip("'")
        details["missing_param"] = missing
        message = f"missing required parameter '{missing}'"
        suggestion = f"Include required parameter `{missing}` and retry."
    elif isinstance(exc, ValidationError):
        details["validation"] = exc.errors()
        message = "request validation failed"
    return BrokerError(ErrorCode.INVALID_ARGS, message, details=details, suggestion=suggestion)


def _maybe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _maybe_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except Exception:
        return None


async def _safe_wait_closed(writer: asyncio.StreamWriter) -> None:
    try:
        await writer.wait_closed()
    except Exception:
        return


async def run_daemon() -> None:
    cfg = load_config()

    logging.basicConfig(
        level=getattr(logging, cfg.logging.level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[logging.FileHandler(cfg.logging.log_file), logging.StreamHandler()],
    )

    daemon = DaemonServer(cfg)
    await daemon.start()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: asyncio.create_task(daemon.stop()))
        except NotImplementedError:
            pass

    await daemon.serve()


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="broker daemon")
    return parser.parse_args(argv)


def main() -> None:
    _parse_args()
    try:
        asyncio.run(run_daemon())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
