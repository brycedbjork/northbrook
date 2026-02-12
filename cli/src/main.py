"""Root Typer app and command registration."""

from __future__ import annotations

import typer

import auth
import audit
import daemon
import market
import orders
import portfolio
import risk
from _common import CLIState, build_typer, load_config

app = build_typer(
    """Broker command-line interface for trading, portfolio, risk, and audit workflows.

    Examples:
      broker quote AAPL MSFT
      broker order buy AAPL 10 --limit 180
      broker risk check --side buy --symbol AAPL --qty 50
    """
)

app.add_typer(daemon.app, name="daemon")
app.add_typer(auth.app, name="auth")
app.add_typer(market.app)
app.add_typer(orders.order_app, name="order")
app.add_typer(portfolio.app)
app.add_typer(risk.app)
app.add_typer(audit.app, name="audit")

# Flat commands required by spec.
app.command("orders", help="List orders with optional filters.")(orders.orders)
app.command("cancel", help="Cancel one order, or all open orders with --all.")(orders.cancel)
app.command("fills", help="List fills/execution history.")(orders.fills)


@app.callback()
def root(ctx: typer.Context) -> None:
    cfg = load_config()
    ctx.obj = CLIState(config=cfg, json_output=True)


def run() -> None:
    app()
