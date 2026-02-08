"""Market data commands."""

from __future__ import annotations

from enum import Enum
import json
import time

import typer

from _common import (
    build_typer,
    daemon_request,
    get_state,
    handle_error,
    parse_csv_items,
    print_output,
    run_async,
    validate_allowed_values,
)
from broker_daemon.exceptions import BrokerError

app = build_typer("Market data commands (`quote`, `watch`, `chain`, `history`).")


class HistoryPeriod(str, Enum):
    D1 = "1d"
    D5 = "5d"
    D30 = "30d"
    D90 = "90d"
    Y1 = "1y"


class BarSize(str, Enum):
    M1 = "1m"
    M5 = "5m"
    M15 = "15m"
    H1 = "1h"
    D1 = "1d"


class OptionType(str, Enum):
    CALL = "call"
    PUT = "put"


WATCH_FIELDS = {"symbol", "bid", "ask", "last", "volume", "timestamp", "exchange", "currency"}


@app.command("quote", help="Snapshot quote(s) for one or more symbols.")
def quote(
    ctx: typer.Context,
    symbols: list[str] = typer.Argument(
        ...,
        metavar="SYMBOL...",
        help="One or more symbols. Example: AAPL MSFT GOOG",
    ),
) -> None:
    state = get_state(ctx)
    try:
        data = run_async(daemon_request(state, "quote.snapshot", {"symbols": symbols}))
        print_output(data.get("quotes", []), json_output=state.json_output, title="Quotes")
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("watch", help="Continuously refresh quote fields in the terminal (Ctrl+C to stop).")
def watch(
    ctx: typer.Context,
    symbol: str,
    fields: str = typer.Option(
        "bid,ask,last,volume",
        "--fields",
        help="Comma-separated fields (bid,ask,last,volume,timestamp,exchange,currency,symbol).",
    ),
    interval: str = typer.Option("1s", "--interval", help="Refresh interval (e.g. 250ms, 1s, 2m)."),
) -> None:
    state = get_state(ctx)
    interval_seconds = _parse_interval(interval)
    chosen_fields = _parse_fields(fields)

    try:
        while True:
            data = run_async(daemon_request(state, "quote.snapshot", {"symbols": [symbol], "force": True}))
            quote = (data.get("quotes") or [{}])[0]
            row = {field: quote.get(field, "") for field in chosen_fields}
            print(json.dumps(row, default=str, separators=(",", ":")))
            time.sleep(interval_seconds)
    except KeyboardInterrupt:
        return
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("chain", help="Fetch an option chain with optional expiry/strike filters.")
def chain(
    ctx: typer.Context,
    symbol: str,
    expiry: str | None = typer.Option(None, "--expiry", help="YYYY-MM"),
    strike_range: str | None = typer.Option(None, "--strike-range", help="0.8:1.2"),
    option_type: OptionType | None = typer.Option(None, "--type", case_sensitive=False, help="call|put"),
) -> None:
    state = get_state(ctx)
    params: dict[str, object] = {"symbol": symbol}
    if expiry:
        params["expiry"] = expiry
    if strike_range:
        params["strike_range"] = strike_range
    if option_type:
        params["type"] = option_type.value

    try:
        data = run_async(daemon_request(state, "market.chain", params))
        print_output(data, json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("history", help="Fetch historical bars for a symbol.")
def history(
    ctx: typer.Context,
    symbol: str,
    period: HistoryPeriod = typer.Option(..., "--period", case_sensitive=False, help="1d, 5d, 30d, 90d, 1y"),
    bar: BarSize = typer.Option(..., "--bar", case_sensitive=False, help="1m, 5m, 15m, 1h, 1d"),
    rth_only: bool = typer.Option(False, "--rth-only", help="Restrict to regular trading hours."),
) -> None:
    state = get_state(ctx)
    try:
        data = run_async(
            daemon_request(
                state,
                "market.history",
                {
                    "symbol": symbol,
                    "period": period.value,
                    "bar": bar.value,
                    "rth_only": rth_only,
                },
            )
        )
        print_output(data.get("bars", []), json_output=state.json_output, title="History")
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


def _parse_interval(raw: str) -> float:
    text = raw.strip().lower()
    try:
        if text.endswith("ms"):
            seconds = float(text[:-2]) / 1000.0
        elif text.endswith("s"):
            seconds = float(text[:-1])
        elif text.endswith("m"):
            seconds = float(text[:-1]) * 60.0
        else:
            seconds = float(text)
    except ValueError as exc:
        raise typer.BadParameter(f"invalid interval '{raw}'. examples: 250ms, 1s, 2m") from exc

    if seconds <= 0:
        raise typer.BadParameter("interval must be greater than zero")
    return seconds


def _parse_fields(raw: str) -> list[str]:
    chosen = [item.lower() for item in parse_csv_items(raw, field_name="fields")]
    return validate_allowed_values(chosen, allowed=WATCH_FIELDS, field_name="fields")
