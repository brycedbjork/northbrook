"""Authentication commands."""

from __future__ import annotations

import typer

from _common import build_typer, get_state, handle_error, print_output, run_async
from broker_daemon.exceptions import BrokerError

app = build_typer("Authentication commands.")


@app.command("etrade", help="Authenticate E*Trade OAuth and store tokens for daemon use.")
def etrade(
    ctx: typer.Context,
    consumer_key: str | None = typer.Option(None, "--consumer-key", help="E*Trade consumer key."),
    consumer_secret: str | None = typer.Option(None, "--consumer-secret", help="E*Trade consumer secret."),
    sandbox: bool = typer.Option(False, "--sandbox", help="Use E*Trade sandbox API base URL."),
) -> None:
    from broker_daemon.providers.etrade import (
        etrade_access_token,
        etrade_authorize_url,
        etrade_request_token,
        save_etrade_tokens,
    )

    state = get_state(ctx)
    cfg = state.config.etrade

    key = (consumer_key or cfg.consumer_key).strip()
    secret = (consumer_secret or cfg.consumer_secret).strip()
    use_sandbox = bool(cfg.sandbox or sandbox)
    token_path = cfg.token_path.expanduser()

    if not key:
        raise typer.BadParameter("consumer_key is required (set --consumer-key or broker.etrade.consumer_key).")
    if not secret:
        raise typer.BadParameter("consumer_secret is required (set --consumer-secret or broker.etrade.consumer_secret).")

    try:
        request = run_async(
            etrade_request_token(
                consumer_key=key,
                consumer_secret=secret,
                sandbox=use_sandbox,
            )
        )
        request_token = request["oauth_token"]
        request_token_secret = request["oauth_token_secret"]
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)
        return

    typer.echo(
        "Open this URL in your browser, sign in, and approve access:\n"
        f"{etrade_authorize_url(key, request_token)}"
    )
    verifier = typer.prompt("Enter E*Trade verification code").strip()
    if not verifier:
        raise typer.BadParameter("verification code is required")

    try:
        access = run_async(
            etrade_access_token(
                consumer_key=key,
                consumer_secret=secret,
                request_token=request_token,
                request_token_secret=request_token_secret,
                verifier=verifier,
                sandbox=use_sandbox,
            )
        )
        save_etrade_tokens(
            token_path,
            oauth_token=access["oauth_token"],
            oauth_token_secret=access["oauth_token_secret"],
        )
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)
        return

    print_output(
        {
            "ok": True,
            "provider": "etrade",
            "token_path": str(token_path),
            "sandbox": use_sandbox,
        },
        json_output=state.json_output,
    )
