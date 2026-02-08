"""Async audit logger backed by SQLite."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiosqlite

from broker_daemon.audit.schema import SCHEMA_STATEMENTS
from broker_daemon.models.orders import FillRecord, OrderRecord


class AuditLogger:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    @property
    def db_path(self) -> Path:
        return self._db_path

    async def start(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = await aiosqlite.connect(self._db_path)
        self._conn.row_factory = aiosqlite.Row
        for statement in SCHEMA_STATEMENTS:
            await self._conn.execute(statement)
        await self._conn.commit()

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()
            self._conn = None

    async def _execute(self, query: str, params: tuple[Any, ...]) -> None:
        if not self._conn:
            raise RuntimeError("AuditLogger has not been started")
        await self._conn.execute(query, params)
        await self._conn.commit()

    async def log_command(self, source: str, command: str, arguments: dict[str, Any], result_code: int) -> None:
        await self._execute(
            "INSERT INTO commands (timestamp, source, command, arguments, result_code) VALUES (?, ?, ?, ?, ?)",
            (
                datetime.now(UTC).isoformat(),
                source,
                command,
                json.dumps(arguments, sort_keys=True),
                result_code,
            ),
        )

    async def upsert_order(self, record: OrderRecord) -> None:
        await self._execute(
            """
            INSERT INTO orders (
                client_order_id, ib_order_id, symbol, side, qty, order_type, limit_price,
                stop_price, tif, status, submitted_at, filled_at, fill_price, fill_qty,
                commission, risk_check_result
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_order_id) DO UPDATE SET
                ib_order_id = excluded.ib_order_id,
                status = excluded.status,
                filled_at = excluded.filled_at,
                fill_price = excluded.fill_price,
                fill_qty = excluded.fill_qty,
                commission = excluded.commission,
                risk_check_result = excluded.risk_check_result
            """,
            (
                record.client_order_id,
                record.ib_order_id,
                record.symbol,
                record.side.value,
                record.qty,
                record.order_type.value,
                record.limit_price,
                record.stop_price,
                record.tif.value,
                record.status.value,
                record.submitted_at.isoformat(),
                record.filled_at.isoformat() if record.filled_at else None,
                record.fill_price,
                record.fill_qty,
                record.commission,
                json.dumps(record.risk_check_result, sort_keys=True),
            ),
        )

    async def log_fill(self, fill: FillRecord) -> None:
        await self._execute(
            """
            INSERT OR IGNORE INTO fills (
                fill_id, client_order_id, ib_order_id, symbol, qty, price, commission, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fill.fill_id,
                fill.client_order_id,
                fill.ib_order_id,
                fill.symbol,
                fill.qty,
                fill.price,
                fill.commission,
                fill.timestamp.isoformat(),
            ),
        )

    async def log_risk_event(self, event_type: str, details: dict[str, Any]) -> None:
        await self._execute(
            "INSERT INTO risk_events (timestamp, event_type, details) VALUES (?, ?, ?)",
            (datetime.now(UTC).isoformat(), event_type, json.dumps(details, sort_keys=True)),
        )

    async def log_connection_event(self, event: str, details: dict[str, Any]) -> None:
        await self._execute(
            "INSERT INTO connection_events (timestamp, event, details) VALUES (?, ?, ?)",
            (datetime.now(UTC).isoformat(), event, json.dumps(details, sort_keys=True)),
        )

    async def fetch_all(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        if not self._conn:
            raise RuntimeError("AuditLogger has not been started")
        async with self._conn.execute(query, params) as cursor:
            rows = await cursor.fetchall()
        return [dict(row) for row in rows]
