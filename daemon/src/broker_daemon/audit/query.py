"""Audit query helpers."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from broker_daemon.audit.logger import AuditLogger


def _where_clause(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    values: list[Any] = []
    for key, value in filters.items():
        if value is None:
            continue
        clauses.append(f"{key} = ?")
        values.append(value)
    if not clauses:
        return "", values
    return "WHERE " + " AND ".join(clauses), values


async def query_commands(
    logger: AuditLogger,
    *,
    source: str | None = None,
    since: str | None = None,
) -> list[dict[str, Any]]:
    where, values = _where_clause({"source": source})
    if since:
        where = f"{where} {'AND' if where else 'WHERE'} timestamp >= ?"
        values.append(since)
    return await logger.fetch_all(
        f"SELECT timestamp, source, command, arguments, result_code FROM commands {where} ORDER BY id DESC",
        tuple(values),
    )


async def query_orders(
    logger: AuditLogger,
    *,
    status: str | None = None,
    since: str | None = None,
) -> list[dict[str, Any]]:
    where, values = _where_clause({"status": status})
    if since:
        where = f"{where} {'AND' if where else 'WHERE'} submitted_at >= ?"
        values.append(since)
    return await logger.fetch_all(
        f"SELECT * FROM orders {where} ORDER BY id DESC",
        tuple(values),
    )


async def query_risk_events(
    logger: AuditLogger,
    *,
    event_type: str | None = None,
) -> list[dict[str, Any]]:
    where, values = _where_clause({"event_type": event_type})
    return await logger.fetch_all(
        f"SELECT timestamp, event_type, details FROM risk_events {where} ORDER BY id DESC",
        tuple(values),
    )


def export_rows_to_csv(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
