from __future__ import annotations

from typer.testing import CliRunner

from main import app


def test_root_help() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["-h"])
    assert result.exit_code == 0
    assert "Broker command-line interface" in result.stdout
    assert "broker order buy AAPL 10 --limit 180" in result.stdout
    assert "daemon" not in result.stdout.lower()


def test_unknown_command_suggests_close_match() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["qoute"])
    assert result.exit_code != 0
    combined = result.stdout + getattr(result, "stderr", "")
    assert "Did you mean" in combined
    assert "quote" in combined
