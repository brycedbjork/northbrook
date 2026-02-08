"""Root Typer app and command registration."""

from __future__ import annotations

import typer

import agent
import audit
import daemon
import market
import orders
import portfolio
import risk
from _common import CLIState, build_typer, load_config, resolve_json_mode

app = build_typer(
    """Broker command-line interface for agent-facing trading, portfolio, risk, and audit workflows.

    Examples:
      broker quote AAPL MSFT
      broker order buy AAPL 10 --limit 180
      broker risk check --side buy --symbol AAPL --qty 50
    """
)

app.add_typer(daemon.app, name="daemon")
app.add_typer(market.app)
app.add_typer(orders.order_app, name="order")
app.add_typer(portfolio.app)
app.add_typer(risk.app)
app.add_typer(agent.app, name="agent")
app.add_typer(audit.app, name="audit")

# Flat commands required by spec.
app.command("orders", help="List orders with optional filters.")(orders.orders)
app.command("cancel", help="Cancel one order, or all open orders with --all.")(orders.cancel)
app.command("fills", help="List fills/execution history.")(orders.fills)


@app.callback()
def root(
    ctx: typer.Context,
    json_output: bool = typer.Option(
        False,
        "--json",
        help="Retained for compatibility. Broker CLI output is JSON by default.",
    ),
) -> None:
    cfg = load_config()
    ctx.obj = CLIState(config=cfg, json_output=resolve_json_mode(json_output, cfg))


def run() -> None:
    app()
