"""Audit query and export commands."""

from __future__ import annotations

from enum import Enum

import typer

from _common import build_typer, daemon_request, get_state, handle_error, print_output, run_async
from broker_daemon.exceptions import BrokerError

app = build_typer("Audit log queries and exports.")


class AuditSource(str, Enum):
    CLI = "cli"
    SDK = "sdk"
    AGENT = "agent"
    TS_SDK = "ts_sdk"


class AuditTable(str, Enum):
    ORDERS = "orders"
    COMMANDS = "commands"
    RISK = "risk"


class ExportFormat(str, Enum):
    CSV = "csv"


class OrderStatusFilter(str, Enum):
    ACTIVE = "active"
    FILLED = "filled"
    CANCELLED = "cancelled"
    ALL = "all"


@app.command("orders", help="Query order lifecycle records from audit storage.")
def orders(
    ctx: typer.Context,
    since: str | None = typer.Option(None, "--since", help="YYYY-MM-DD"),
    status: OrderStatusFilter | None = typer.Option(None, "--status", case_sensitive=False),
) -> None:
    state = get_state(ctx)
    params: dict[str, object] = {}
    if since:
        params["since"] = since
    if status:
        params["status"] = status.value

    try:
        data = run_async(daemon_request(state, "audit.orders", params))
        print_output(data.get("orders", []), json_output=state.json_output, title="Audit Orders")
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("commands", help="Query command invocation audit records.")
def commands(
    ctx: typer.Context,
    source: AuditSource | None = typer.Option(None, "--source", case_sensitive=False),
    since: str | None = typer.Option(None, "--since", help="YYYY-MM-DD"),
) -> None:
    state = get_state(ctx)
    params: dict[str, object] = {}
    if source:
        params["source"] = source.value
    if since:
        params["since"] = since

    try:
        data = run_async(daemon_request(state, "audit.commands", params))
        print_output(data.get("commands", []), json_output=state.json_output, title="Audit Commands")
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("risk", help="Query risk event audit records.")
def risk(
    ctx: typer.Context,
    event_type: str | None = typer.Option(None, "--type"),
) -> None:
    state = get_state(ctx)
    params: dict[str, object] = {}
    if event_type:
        params["type"] = event_type

    try:
        data = run_async(daemon_request(state, "audit.risk", params))
        print_output(data.get("risk_events", []), json_output=state.json_output, title="Audit Risk")
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("export", help="Export audit rows to CSV.")
def export(
    ctx: typer.Context,
    output: str = typer.Option(..., "--output", help="Output file path."),
    fmt: ExportFormat = typer.Option(ExportFormat.CSV, "--format", case_sensitive=False),
    table: AuditTable = typer.Option(AuditTable.ORDERS, "--table", case_sensitive=False),
    since: str | None = typer.Option(None, "--since", help="YYYY-MM-DD"),
    status: OrderStatusFilter | None = typer.Option(None, "--status", case_sensitive=False, help="Order status filter."),
    source: AuditSource | None = typer.Option(None, "--source", case_sensitive=False),
    event_type: str | None = typer.Option(None, "--type", help="Risk event type filter."),
) -> None:
    state = get_state(ctx)
    params: dict[str, object] = {"output": output, "format": fmt.value, "table": table.value}
    if since:
        params["since"] = since
    if status:
        params["status"] = status.value
    if source:
        params["source"] = source.value
    if event_type:
        params["type"] = event_type

    try:
        data = run_async(daemon_request(state, "audit.export", params))
        print_output(data, json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)
