from __future__ import annotations

import pytest

from broker_daemon.config import AppConfig, LoggingConfig, RuntimeConfig
from broker_daemon.daemon.server import DaemonServer
from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.protocol import Request


def _test_config(tmp_path) -> AppConfig:
    return AppConfig(
        logging=LoggingConfig(
            audit_db=tmp_path / "audit.db",
            log_file=tmp_path / "broker.log",
        ),
        runtime=RuntimeConfig(
            socket_path=tmp_path / "broker.sock",
            pid_file=tmp_path / "broker-daemon.pid",
            request_timeout_seconds=5,
        ),
    )


@pytest.mark.asyncio
async def test_dispatch_quote_requires_symbols(tmp_path) -> None:
    server = DaemonServer(_test_config(tmp_path))
    req = Request(command="quote.snapshot", params={})

    with pytest.raises(BrokerError) as exc:
        await server._dispatch(req)  # noqa: SLF001

    assert exc.value.code == ErrorCode.INVALID_ARGS
    assert "symbols" in exc.value.message


@pytest.mark.asyncio
async def test_dispatch_rejects_invalid_chain_type(tmp_path) -> None:
    server = DaemonServer(_test_config(tmp_path))
    req = Request(command="market.chain", params={"symbol": "AAPL", "type": "straddle"})

    with pytest.raises(BrokerError) as exc:
        await server._dispatch(req)  # noqa: SLF001

    assert exc.value.code == ErrorCode.INVALID_ARGS
    assert "option type" in exc.value.message


@pytest.mark.asyncio
async def test_dispatch_rejects_invalid_order_status_filter(tmp_path) -> None:
    server = DaemonServer(_test_config(tmp_path))
    req = Request(command="orders.list", params={"status": "pending"})

    with pytest.raises(BrokerError) as exc:
        await server._dispatch(req)  # noqa: SLF001

    assert exc.value.code == ErrorCode.INVALID_ARGS
    assert "unsupported orders status" in exc.value.message
