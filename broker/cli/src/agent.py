"""Agent-facing commands."""

from __future__ import annotations

import asyncio
import json

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
from broker_daemon.models.events import EventTopic
from broker_sdk import Client

app = build_typer("Agent-focused commands (heartbeat and subscription streams).")

TOPICS = {topic.value for topic in EventTopic}


@app.command("heartbeat", help="Ping daemon health and return latency metrics.")
def heartbeat(ctx: typer.Context) -> None:
    state = get_state(ctx)
    try:
        data = run_async(daemon_request(state, "agent.heartbeat", {}))
        print_output(data, json_output=state.json_output)
    except BrokerError as exc:
        handle_error(exc, json_output=state.json_output)


@app.command("subscribe", help="Stream daemon events as JSONL for agent consumption.")
def subscribe(
    ctx: typer.Context,
    topics: str = typer.Option(
        "orders,fills,positions",
        "--topics",
        help="Comma-separated topic list or 'all'. Available: orders,fills,positions,pnl,risk,connection",
    ),
) -> None:
    state = get_state(ctx)
    selected = _parse_topics(topics)

    async def _run() -> None:
        async with Client(socket_path=state.config.runtime.socket_path, timeout_seconds=state.config.runtime.request_timeout_seconds) as client:
            async for event in client.subscribe(selected):
                print(json.dumps(event, default=str, separators=(",", ":")))

    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        return
    except BrokerError as exc:
        handle_error(exc, json_output=True)


def _parse_topics(raw: str) -> list[str]:
    text = raw.strip().lower()
    if text == "all":
        return sorted(TOPICS)

    topics = [topic.lower() for topic in parse_csv_items(raw, field_name="topics")]
    return validate_allowed_values(topics, allowed=TOPICS, field_name="topics")
