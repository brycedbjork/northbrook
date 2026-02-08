from __future__ import annotations

import asyncio
from typing import Any

import pytest

from broker_daemon.config import RiskConfig
from broker_daemon.daemon.order_manager import OrderManager
from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.models.orders import OrderRequest
from broker_daemon.models.portfolio import Balance, PnLSummary
from broker_daemon.risk.engine import RiskEngine


class _FakeConnection:
    def __init__(self) -> None:
        self.place_calls = 0
        self._order_id = 1000

    async def balance(self) -> Balance:
        return Balance(net_liquidation=1_000_000)

    async def positions(self) -> list[Any]:
        return []

    async def quote(self, _symbols: list[str]) -> list[Any]:
        return []

    async def pnl(self) -> PnLSummary:
        return PnLSummary(total=0.0)

    async def place_order(self, _request: OrderRequest, _client_order_id: str) -> dict[str, Any]:
        self.place_calls += 1
        self._order_id += 1
        return {"ib_order_id": self._order_id, "status": "Submitted"}

    async def trades(self) -> list[dict[str, Any]]:
        return []

    async def fills(self) -> list[Any]:
        return []

    async def cancel_order(self, client_order_id: str | None = None, ib_order_id: int | None = None) -> dict[str, Any]:
        return {"cancelled": True, "client_order_id": client_order_id, "ib_order_id": ib_order_id}

    async def cancel_all(self) -> dict[str, Any]:
        return {"cancelled": True}


class _FakeAudit:
    async def upsert_order(self, _record: Any) -> None:
        return None

    async def log_risk_event(self, _event_type: str, _details: dict[str, Any]) -> None:
        return None

    async def log_fill(self, _fill: Any) -> None:
        return None


async def _new_manager(order_rate_limit: int = 500) -> tuple[OrderManager, _FakeConnection]:
    conn = _FakeConnection()
    risk = RiskEngine(
        RiskConfig(
            max_position_pct=100,
            max_single_name_pct=100,
            max_order_value=1_000_000,
            max_open_orders=10_000,
            order_rate_limit=order_rate_limit,
            duplicate_window_seconds=1,
        )
    )
    manager = OrderManager(connection=conn, risk=risk, audit=_FakeAudit(), event_cb=None)
    return manager, conn


@pytest.mark.asyncio
async def test_rapid_order_submission_accepts_large_burst() -> None:
    manager, conn = await _new_manager(order_rate_limit=500)

    async def _submit(i: int) -> None:
        req = OrderRequest(
            side="buy",
            symbol="AAPL",
            qty=float(i + 1),
            limit=100.0,
            client_order_id=f"load-{i}",
        )
        await manager.place_order(req)

    await asyncio.gather(*[_submit(i) for i in range(120)])

    rows = await manager.list_orders(status="all")
    assert conn.place_calls == 120
    assert len(rows) == 120


@pytest.mark.asyncio
async def test_rapid_order_submission_triggers_rate_limit() -> None:
    manager, _ = await _new_manager(order_rate_limit=5)

    async def _submit(i: int) -> Exception | None:
        req = OrderRequest(
            side="buy",
            symbol="AAPL",
            qty=float(i + 1),
            limit=100.0,
            client_order_id=f"rl-{i}",
        )
        try:
            await manager.place_order(req)
            return None
        except Exception as exc:  # noqa: BLE001
            return exc

    outcomes = await asyncio.gather(*[_submit(i) for i in range(30)])
    failures = [out for out in outcomes if isinstance(out, Exception)]
    assert failures, "expected rate limiting failures under burst load"
    assert any(isinstance(err, BrokerError) and err.code == ErrorCode.RATE_LIMITED for err in failures)
