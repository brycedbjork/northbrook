"""Daemon lifecycle commands."""

from __future__ import annotations

import typer

from broker_cli._common import build_typer, daemon_request, get_state, handle_error, print_output, run_async, start_daemon_process
from broker_daemon.exceptions import BrokerError

app = build_typer("Daemon lifecycle commands (`start`, `stop`, `status`, `restart`).")


@app.command("start", help="Start broker-daemon and wait for socket readiness.")
def start(
    ctx: typer.Context,
    gateway: str | None = typer.Option(None, "--gateway", help="Override gateway endpoint as HOST:PORT."),
    client_id: int | None = typer.Option(None, "--client-id", help="Override IB client id."),
    paper: bool = typer.Option(False, "--paper", help="Force paper trading port (4002)."),
) -> None:
    state = get_state(ctx)

    env: dict[str, str] = {}
    if gateway:
        host, _, port = gateway.partition(":")
        env["BROKER_GATEWAY_HOST"] = host
        if port:
            env["BROKER_GATEWAY_PORT"] = port
    if client_id is not None:
        env["BROKER_GATEWAY_CLIENT_ID"] = str(client_id)
    if paper:
        env["BROKER_GATEWAY_PORT"] = "4002"

    code = start_daemon_process(state.config_path, state.config, extra_env=env or None)
    if code != 0:
        typer.echo("Failed to start daemon. Check broker log (default: ~/.local/state/northbrook/broker.log).", err=True)
        raise typer.Exit(code=1)

    print_output({"ok": True, "socket": str(state.config.runtime.socket_path)}, json_output=state.json_output)


@app.command("stop", help="Request graceful daemon shutdown.")
def stop(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        data = run_async(daemon_request(state, "daemon.stop", {}))
        print_output(data, json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("status", help="Show daemon uptime, IB connection state, and risk halt status.")
def status(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        data = run_async(daemon_request(state, "daemon.status", {}))
        print_output(data, json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("restart", help="Stop then start the daemon.")
def restart(
    ctx: typer.Context,
    paper: bool = typer.Option(False, "--paper", help="Restart using paper trading port (4002)."),
) -> None:
    state = get_state(ctx)
    try:
        run_async(daemon_request(state, "daemon.stop", {}))
    except Exception:
        pass

    env = {"BROKER_GATEWAY_PORT": "4002"} if paper else None
    code = start_daemon_process(state.config_path, state.config, extra_env=env)
    if code != 0:
        typer.echo("Failed to restart daemon. Check broker log (default: ~/.local/state/northbrook/broker.log).", err=True)
        raise typer.Exit(code=1)
    print_output({"ok": True}, json_output=state.json_output)
