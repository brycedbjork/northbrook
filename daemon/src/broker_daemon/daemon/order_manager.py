"""Order state machine and risk-enforced order entry."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable

from broker_daemon.audit.logger import AuditLogger
from broker_daemon.daemon.connection import IBConnectionManager
from broker_daemon.models.events import Event, EventTopic
from broker_daemon.models.orders import FillRecord, OrderRecord, OrderRequest, OrderStatus, OrderType
from broker_daemon.risk.engine import RiskContext, RiskEngine

ACTIVE_STATUSES = {
    OrderStatus.SUBMITTED,
    OrderStatus.ACKNOWLEDGED,
    OrderStatus.PENDING_SUBMIT,
    OrderStatus.PRE_SUBMITTED,
}


class OrderManager:
    def __init__(
        self,
        *,
        connection: IBConnectionManager,
        risk: RiskEngine,
        audit: AuditLogger,
        event_cb: Callable[[Event], Awaitable[None]] | None = None,
    ) -> None:
        self._connection = connection
        self._risk = risk
        self._audit = audit
        self._event_cb = event_cb
        self._orders: dict[str, OrderRecord] = {}
        self._fills: list[FillRecord] = []

    def _infer_order_type(self, req: OrderRequest) -> OrderType:
        if req.limit is not None and req.stop is not None:
            return OrderType.STOP_LIMIT
        if req.limit is not None:
            return OrderType.LIMIT
        if req.stop is not None:
            return OrderType.STOP
        return OrderType.MARKET

    async def _risk_context(self) -> RiskContext:
        balance = await self._connection.balance()
        nlv = float(balance.net_liquidation or 0.0)
        positions = await self._connection.positions()

        symbols = [p.symbol for p in positions]
        quotes = await self._connection.quote(symbols) if symbols else []
        marks = {
            q.symbol: (q.last if q.last is not None else q.bid if q.bid is not None else q.ask if q.ask is not None else 0.0)
            for q in quotes
        }

        position_values: dict[str, float] = {}
        for p in positions:
            mark = marks.get(p.symbol)
            if mark is None:
                mark = p.market_price if p.market_price is not None else p.avg_cost
            position_values[p.symbol] = float(mark) * p.qty

        pnl = await self._connection.pnl()
        open_orders = len([o for o in self._orders.values() if o.status in ACTIVE_STATUSES])

        return RiskContext(
            nlv=nlv,
            daily_pnl=pnl.total,
            open_orders=open_orders,
            mark_prices=marks,
            position_values=position_values,
        )

    async def place_order(self, request: OrderRequest) -> OrderRecord:
        client_order_id = request.client_order_id or str(uuid.uuid4())
        if client_order_id in self._orders:
            return self._orders[client_order_id]

        context = await self._risk_context()
        risk_result = self._risk.assert_order(request, context)

        record = OrderRecord(
            client_order_id=client_order_id,
            symbol=request.symbol,
            side=request.side,
            qty=request.qty,
            order_type=self._infer_order_type(request),
            limit_price=request.limit,
            stop_price=request.stop,
            tif=request.tif,
            status=OrderStatus.PENDING_SUBMIT,
            risk_check_result=risk_result.model_dump(mode="json"),
        )

        broker_res = await self._connection.place_order(request, client_order_id)
        record.ib_order_id = broker_res.get("ib_order_id")
        broker_status = str(broker_res.get("status") or "Submitted")
        record.status = _status_from_ib(broker_status)

        self._orders[client_order_id] = record
        await self._audit.upsert_order(record)
        await self._audit.log_risk_event("check_passed", {"client_order_id": client_order_id})

        await self._emit(
            Event(
                topic=EventTopic.ORDERS,
                payload={
                    "client_order_id": client_order_id,
                    "ib_order_id": record.ib_order_id,
                    "status": record.status.value,
                },
            )
        )
        return record

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
    ) -> dict[str, Any]:
        request = OrderRequest(side=side, symbol=symbol, qty=qty, limit=entry, tif=tif)
        context = await self._risk_context()
        self._risk.assert_order(request, context)

        client_order_id = str(uuid.uuid4())
        result = await self._connection.place_bracket(
            side=side,
            symbol=symbol,
            qty=qty,
            entry=entry,
            tp=tp,
            sl=sl,
            tif=tif,
            client_order_id=client_order_id,
        )
        await self._audit.log_risk_event("check_passed", {"client_order_id": client_order_id, "type": "bracket"})
        await self._emit(
            Event(
                topic=EventTopic.ORDERS,
                payload={
                    "client_order_id": client_order_id,
                    "ib_order_ids": result.get("ib_order_ids", []),
                    "status": result.get("status", "Submitted"),
                },
            )
        )
        return {"client_order_id": client_order_id, **result}

    async def update_order_status(
        self,
        *,
        client_order_id: str,
        status: str,
        filled: float | None = None,
        avg_fill_price: float | None = None,
    ) -> None:
        if client_order_id not in self._orders:
            return
        record = self._orders[client_order_id]
        record.status = _status_from_ib(status)
        if record.status == OrderStatus.FILLED:
            record.filled_at = datetime.now(UTC)
            record.fill_qty = float(filled or record.qty)
            record.fill_price = float(avg_fill_price or record.fill_price or 0)
        await self._audit.upsert_order(record)

    async def add_fill(self, fill: FillRecord) -> None:
        self._fills.append(fill)
        await self._audit.log_fill(fill)
        await self._emit(Event(topic=EventTopic.FILLS, payload=fill.model_dump(mode="json")))

    async def cancel_order(self, order_id: str) -> dict[str, Any]:
        record = self._orders.get(order_id)
        if record:
            res = await self._connection.cancel_order(client_order_id=order_id, ib_order_id=record.ib_order_id)
            if res.get("cancelled"):
                record.status = OrderStatus.CANCELLED
                await self._audit.upsert_order(record)
            return {"client_order_id": order_id, **res}
        return await self._connection.cancel_order(client_order_id=order_id)

    async def cancel_all(self) -> dict[str, Any]:
        res = await self._connection.cancel_all()
        if res.get("cancelled"):
            for record in self._orders.values():
                if record.status in ACTIVE_STATUSES:
                    record.status = OrderStatus.CANCELLED
                    await self._audit.upsert_order(record)
        return res

    async def order_status(self, order_id: str) -> dict[str, Any] | None:
        if order_id in self._orders:
            return self._orders[order_id].model_dump(mode="json")
        trades = await self._connection.trades()
        for trade in trades:
            if trade.get("client_order_id") == order_id:
                return trade
        return None

    async def list_orders(self, status: str = "all") -> list[dict[str, Any]]:
        items = [o.model_dump(mode="json") for o in self._orders.values()]
        if status == "all":
            return sorted(items, key=lambda i: i["submitted_at"], reverse=True)
        status_l = status.lower()
        if status_l == "active":
            return [i for i in items if i["status"] in {s.value for s in ACTIVE_STATUSES}]
        return [i for i in items if i["status"].lower() == status_l]

    async def list_fills(self, symbol: str | None = None) -> list[dict[str, Any]]:
        broker_fills = await self._connection.fills()
        for fill in broker_fills:
            await self._audit.log_fill(fill)
        combined = [*self._fills, *broker_fills]
        if symbol:
            combined = [f for f in combined if f.symbol.upper() == symbol.upper()]
        return [f.model_dump(mode="json") for f in combined]

    async def _emit(self, event: Event) -> None:
        if self._event_cb:
            await self._event_cb(event)


def _status_from_ib(raw: str) -> OrderStatus:
    normalized = (raw or "").strip().lower()
    mapping = {
        "submitted": OrderStatus.SUBMITTED,
        "acknowledged": OrderStatus.ACKNOWLEDGED,
        "pendingsubmit": OrderStatus.PENDING_SUBMIT,
        "presubmitted": OrderStatus.PRE_SUBMITTED,
        "filled": OrderStatus.FILLED,
        "cancelled": OrderStatus.CANCELLED,
        "inactive": OrderStatus.INACTIVE,
        "api cancelled": OrderStatus.CANCELLED,
        "rejected": OrderStatus.REJECTED,
    }
    return mapping.get(normalized, OrderStatus.SUBMITTED)
