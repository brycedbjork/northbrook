from __future__ import annotations

import pytest

from broker_daemon.config import RiskConfig
from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.models.orders import OrderRequest
from broker_daemon.risk.engine import RiskContext, RiskEngine


def test_assert_order_raises_rate_limited_code() -> None:
    engine = RiskEngine(RiskConfig(order_rate_limit=1, duplicate_window_seconds=1))
    ctx = RiskContext(nlv=100_000)
    first = OrderRequest(side="buy", symbol="AAPL", qty=1, limit=100)
    second = OrderRequest(side="buy", symbol="MSFT", qty=1, limit=100)

    engine.assert_order(first, ctx)
    with pytest.raises(BrokerError) as exc:
        engine.assert_order(second, ctx)

    assert exc.value.code == ErrorCode.RATE_LIMITED
    assert ErrorCode.RATE_LIMITED.value in exc.value.details.get("violation_codes", [])


def test_assert_order_raises_duplicate_code() -> None:
    engine = RiskEngine(RiskConfig(order_rate_limit=100, duplicate_window_seconds=60))
    ctx = RiskContext(nlv=100_000)
    order = OrderRequest(side="buy", symbol="AAPL", qty=5, limit=100)

    engine.assert_order(order, ctx)
    with pytest.raises(BrokerError) as exc:
        engine.assert_order(order, ctx)

    assert exc.value.code == ErrorCode.DUPLICATE_ORDER
    assert ErrorCode.DUPLICATE_ORDER.value in exc.value.details.get("violation_codes", [])
