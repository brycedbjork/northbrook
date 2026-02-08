"""Risk-management commands."""

from __future__ import annotations

import typer

from _common import build_typer, daemon_request, get_state, handle_error, print_output, run_async
from broker_daemon.exceptions import BrokerError
from broker_daemon.models.orders import Side, TIF
from broker_daemon.risk.limits import mutable_params

app = build_typer("Risk checks, limits, controls, and temporary overrides.")

RISK_PARAMS = tuple(mutable_params())


def _validate_risk_param(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in RISK_PARAMS:
        return normalized
    valid = ", ".join(RISK_PARAMS)
    raise typer.BadParameter(f"unknown risk parameter '{value}'. valid params: {valid}")


@app.command("check", help="Dry-run an order against risk limits (does not submit).")
def check(
    ctx: typer.Context,
    side: Side = typer.Option(..., "--side", case_sensitive=False, help="buy or sell."),
    symbol: str = typer.Option(..., "--symbol", help="Ticker symbol."),
    qty: float = typer.Option(..., "--qty", min=0.000001, help="Quantity to evaluate."),
    limit: float | None = typer.Option(None, "--limit", help="Limit price."),
    stop: float | None = typer.Option(None, "--stop", help="Stop trigger price."),
    tif: TIF = typer.Option(TIF.DAY, "--tif", case_sensitive=False, help="DAY, GTC, IOC."),
) -> None:
    state = get_state(ctx)
    params: dict[str, object] = {"side": side.value, "symbol": symbol, "qty": qty, "tif": tif.value}
    if limit is not None:
        params["limit"] = limit
    if stop is not None:
        params["stop"] = stop

    try:
        data = run_async(daemon_request(state, "risk.check", params))
        print_output(data, json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("limits", help="Show current runtime risk limits.")
def limits(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        data = run_async(daemon_request(state, "risk.limits", {}))
        print_output(data.get("limits", data), json_output=state.json_output, title="Risk Limits")
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("set", help="Update a risk limit parameter at runtime.")
def set_limit(
    ctx: typer.Context,
    param: str = typer.Argument(..., callback=_validate_risk_param),
    value: str = typer.Argument(..., help="New parameter value."),
) -> None:
    state = get_state(ctx)
    try:
        data = run_async(daemon_request(state, "risk.set", {"param": param, "value": value}))
        print_output(data.get("limits", data), json_output=state.json_output, title="Risk Limits")
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("halt", help="Emergency halt: cancel open orders and reject new orders.")
def halt(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        data = run_async(daemon_request(state, "risk.halt", {}))
        print_output(data, json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("resume", help="Resume trading after a risk halt.")
def resume(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        data = run_async(daemon_request(state, "risk.resume", {}))
        print_output(data, json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("override", help="Apply a temporary risk override with required reason and duration.")
def override(
    ctx: typer.Context,
    param: str = typer.Option(..., "--param", callback=_validate_risk_param),
    value: str = typer.Option(..., "--value", help="Override value."),
    duration: str = typer.Option(..., "--duration", help="Duration like 30m, 1h, 1d."),
    reason: str = typer.Option(..., "--reason", help="Required audit reason for the override."),
) -> None:
    state = get_state(ctx)
    try:
        data = run_async(
            daemon_request(
                state,
                "risk.override",
                {"param": param, "value": value, "duration": duration, "reason": reason},
            )
        )
        print_output(data.get("override", data), json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)
