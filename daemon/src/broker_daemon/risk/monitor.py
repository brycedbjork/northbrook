"""Continuous risk monitors for drawdown and heartbeat policies."""

from __future__ import annotations

from datetime import UTC, datetime


class HeartbeatMonitor:
    def __init__(self, timeout_seconds: int) -> None:
        self._timeout_seconds = timeout_seconds
        self._last_heartbeat: datetime | None = None

    def beat(self) -> None:
        self._last_heartbeat = datetime.now(UTC)

    def seconds_since_last(self) -> float | None:
        if not self._last_heartbeat:
            return None
        return (datetime.now(UTC) - self._last_heartbeat).total_seconds()

    def is_timed_out(self) -> bool:
        delta = self.seconds_since_last()
        if delta is None:
            return False
        return delta > self._timeout_seconds


class ConnectionLossMonitor:
    def __init__(self, threshold_seconds: int = 30) -> None:
        self._threshold_seconds = threshold_seconds
        self._disconnected_at: datetime | None = None

    def on_connected(self) -> None:
        self._disconnected_at = None

    def on_disconnected(self) -> None:
        if self._disconnected_at is None:
            self._disconnected_at = datetime.now(UTC)

    def breached(self) -> bool:
        if self._disconnected_at is None:
            return False
        seconds = (datetime.now(UTC) - self._disconnected_at).total_seconds()
        return seconds > self._threshold_seconds
