from __future__ import annotations

from broker_daemon.config import RiskConfig
from broker_daemon.models.orders import OrderRequest
from broker_daemon.risk.engine import RiskContext, RiskEngine


def test_order_value_limit_blocks_large_order() -> None:
    engine = RiskEngine(RiskConfig(max_order_value=5000))
    order = OrderRequest(side="buy", symbol="AAPL", qty=100, limit=100)
    result = engine.check_order(order, RiskContext(nlv=100_000, daily_pnl=0))

    assert result.ok is False
    assert any("max_order_value" in reason for reason in result.reasons)


def test_rate_limit_and_duplicate_detection() -> None:
    engine = RiskEngine(RiskConfig(order_rate_limit=1, duplicate_window_seconds=60))
    ctx = RiskContext(nlv=100_000)
    first = OrderRequest(side="buy", symbol="MSFT", qty=10, limit=100)
    second = OrderRequest(side="buy", symbol="MSFT", qty=10, limit=100)

    first_result = engine.check_order(first, ctx)
    second_result = engine.check_order(second, ctx)

    assert first_result.ok is True
    assert second_result.ok is False
    assert any("rate limit" in reason or "duplicate" in reason for reason in second_result.reasons)


def test_override_changes_effective_limit() -> None:
    engine = RiskEngine(RiskConfig(max_order_value=1000))
    engine.override_limit("max_order_value", 5000, duration_seconds=3600, reason="manual")
    snapshot = engine.snapshot()

    assert snapshot.max_order_value == 5000
