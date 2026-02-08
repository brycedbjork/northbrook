from __future__ import annotations

from datetime import UTC, datetime, timedelta

from broker_daemon.risk.monitor import ConnectionLossMonitor, HeartbeatMonitor


def test_heartbeat_monitor_timeout_behavior() -> None:
    monitor = HeartbeatMonitor(timeout_seconds=10)
    assert monitor.is_timed_out() is False

    monitor.beat()
    assert monitor.is_timed_out() is False
    monitor._last_heartbeat = datetime.now(UTC) - timedelta(seconds=11)  # noqa: SLF001
    assert monitor.is_timed_out() is True


def test_connection_loss_monitor_breach_behavior() -> None:
    monitor = ConnectionLossMonitor(threshold_seconds=30)
    assert monitor.breached() is False

    monitor.on_disconnected()
    monitor._disconnected_at = datetime.now(UTC) - timedelta(seconds=31)  # noqa: SLF001
    assert monitor.breached() is True

    monitor.on_connected()
    assert monitor.breached() is False
