from __future__ import annotations

import re
from typing import Any

import pytest
from typer.testing import CliRunner

import auth
import audit
import daemon
import market
import orders
import portfolio
import risk
from main import app

_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")


def _strip_ansi(text: str) -> str:
    return _ANSI_ESCAPE_RE.sub("", text)


def _extract_commands(help_text: str) -> set[str]:
    help_text = _strip_ansi(help_text)
    commands: set[str] = set()
    in_commands = False
    for line in help_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("╭─ Commands"):
            in_commands = True
            continue
        if in_commands and stripped.startswith("╰"):
            break
        match = re.match(r"^\s*[│|]\s+([a-z][a-z0-9_-]*)\s{2,}.*[│|]\s*$", line)
        if match:
            commands.add(match.group(1))
    return commands


@pytest.fixture(autouse=True)
def _use_fake_home(fake_home: object) -> None:
    _ = fake_home


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


@pytest.fixture
def rpc(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict[str, Any]]]:
    calls: list[tuple[str, dict[str, Any]]] = []

    async def fake_daemon_request(_: Any, command: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = params or {}
        calls.append((command, payload))
        responses: dict[str, dict[str, Any]] = {
            "daemon.status": {"ok": True, "socket": "/tmp/broker.sock"},
            "daemon.stop": {"stopping": True},
            "quote.snapshot": {"quotes": [{"symbol": "AAPL", "last": 180.0}]},
            "market.history": {"bars": []},
            "market.chain": {"symbol": "AAPL", "contracts": []},
            "portfolio.positions": {"positions": []},
            "portfolio.balance": {"balance": {"net_liquidation": 100000}},
            "portfolio.pnl": {"pnl": {"total": 0.0}},
            "portfolio.exposure": {"exposure": []},
            "order.place": {"order": {"client_order_id": "cid-1"}},
            "order.bracket": {"parent_order": {"client_order_id": "cid-parent"}},
            "order.status": {"order": {"client_order_id": "cid-1", "status": "submitted"}},
            "orders.list": {"orders": []},
            "order.cancel": {"ok": True},
            "orders.cancel_all": {"cancelled": 0},
            "fills.list": {"fills": []},
            "risk.check": {"ok": True},
            "risk.limits": {"limits": {"max_order_value": 50000}},
            "risk.set": {"limits": {"max_order_value": 1000}},
            "risk.halt": {"halted": True},
            "risk.resume": {"halted": False},
            "risk.override": {"override": {"param": "max_order_value", "value": 1000}},
            "audit.commands": {"commands": []},
            "audit.orders": {"orders": []},
            "audit.risk": {"risk_events": []},
            "audit.export": {"output": "/tmp/audit.csv", "rows": 0},
        }
        return responses.get(command, {"ok": True})

    for mod in (audit, daemon, market, orders, portfolio, risk):
        monkeypatch.setattr(mod, "daemon_request", fake_daemon_request)

    return calls


def test_root_command_surface_contract(runner: CliRunner) -> None:
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0

    commands = _extract_commands(result.stdout)
    assert commands == {
        "orders",
        "cancel",
        "fills",
        "daemon",
        "auth",
        "quote",
        "watch",
        "chain",
        "history",
        "order",
        "positions",
        "pnl",
        "balance",
        "exposure",
        "check",
        "limits",
        "set",
        "halt",
        "resume",
        "override",
        "audit",
    }


@pytest.mark.parametrize(
    ("args", "expected"),
    [
        (["daemon", "--help"], {"start", "stop", "status", "restart"}),
        (["auth", "--help"], {"etrade"}),
        (["order", "--help"], {"buy", "sell", "bracket", "status"}),
        (["audit", "--help"], {"orders", "commands", "risk", "export"}),
    ],
)
def test_subcommand_surface_contract(
    runner: CliRunner,
    args: list[str],
    expected: set[str],
) -> None:
    result = runner.invoke(app, args)
    assert result.exit_code == 0
    assert _extract_commands(result.stdout) == expected


@pytest.mark.parametrize(
    ("args", "expected_rpc"),
    [
        (["quote", "AAPL"], "quote.snapshot"),
        (["chain", "AAPL"], "market.chain"),
        (["history", "AAPL", "--period", "1d", "--bar", "1m"], "market.history"),
        (["order", "buy", "AAPL", "1"], "order.place"),
        (["order", "sell", "AAPL", "1"], "order.place"),
        (["order", "bracket", "AAPL", "1", "--entry", "100", "--tp", "120", "--sl", "95"], "order.bracket"),
        (["order", "status", "cid-1"], "order.status"),
        (["orders"], "orders.list"),
        (["cancel", "cid-1"], "order.cancel"),
        (["cancel", "--all"], "orders.cancel_all"),
        (["fills"], "fills.list"),
        (["positions"], "portfolio.positions"),
        (["pnl", "--today"], "portfolio.pnl"),
        (["balance"], "portfolio.balance"),
        (["exposure"], "portfolio.exposure"),
        (["check", "--side", "buy", "--symbol", "AAPL", "--qty", "1"], "risk.check"),
        (["limits"], "risk.limits"),
        (["set", "max_order_value", "1000"], "risk.set"),
        (["halt"], "risk.halt"),
        (["resume"], "risk.resume"),
        (["override", "--param", "max_order_value", "--value", "1000", "--duration", "1h", "--reason", "test"], "risk.override"),
        (["audit", "orders"], "audit.orders"),
        (["audit", "commands"], "audit.commands"),
        (["audit", "risk"], "audit.risk"),
        (["audit", "export", "--output", "/tmp/audit.csv"], "audit.export"),
        (["daemon", "status"], "daemon.status"),
        (["daemon", "stop"], "daemon.stop"),
    ],
)
def test_commands_are_usable_and_mapped_to_expected_rpc(
    runner: CliRunner,
    rpc: list[tuple[str, dict[str, Any]]],
    args: list[str],
    expected_rpc: str,
) -> None:
    result = runner.invoke(app, args)
    assert result.exit_code == 0, result.stdout
    assert rpc, f"expected at least one RPC call for args={args}"
    assert rpc[-1][0] == expected_rpc


def test_watch_is_usable(monkeypatch: pytest.MonkeyPatch, runner: CliRunner, rpc: list[tuple[str, dict[str, Any]]]) -> None:
    def stop_loop(_: float) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(market.time, "sleep", stop_loop)
    result = runner.invoke(app, ["watch", "AAPL", "--interval", "1ms"])
    assert result.exit_code == 0
    assert rpc[-1][0] == "quote.snapshot"


def test_daemon_start_uses_start_helper(monkeypatch: pytest.MonkeyPatch, runner: CliRunner) -> None:
    captured: dict[str, Any] = {}

    def fake_start(cfg: Any, *, extra_env: dict[str, str] | None = None) -> int:
        captured["cfg"] = cfg
        captured["extra_env"] = extra_env
        return 0

    monkeypatch.setattr(daemon, "start_daemon_process", fake_start)
    result = runner.invoke(app, ["daemon", "start", "--gateway", "127.0.0.1:4001", "--client-id", "7", "--paper"])
    assert result.exit_code == 0
    assert captured["extra_env"] == {
        "BROKER_GATEWAY_HOST": "127.0.0.1",
        "BROKER_GATEWAY_PORT": "4002",
        "BROKER_GATEWAY_CLIENT_ID": "7",
    }


def test_daemon_restart_uses_stop_and_start(monkeypatch: pytest.MonkeyPatch, runner: CliRunner) -> None:
    calls: list[str] = []

    async def fake_daemon_request(_: Any, command: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        _ = params
        calls.append(command)
        return {"ok": True}

    def fake_start(_: Any, *, extra_env: dict[str, str] | None = None) -> int:
        calls.append(f"start:{extra_env}")
        return 0

    monkeypatch.setattr(daemon, "daemon_request", fake_daemon_request)
    monkeypatch.setattr(daemon, "start_daemon_process", fake_start)

    result = runner.invoke(app, ["daemon", "restart", "--paper"])
    assert result.exit_code == 0
    assert calls[0] == "daemon.stop"
    assert calls[1] == "start:{'BROKER_GATEWAY_PORT': '4002'}"
