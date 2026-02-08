from __future__ import annotations

import pytest

from broker_daemon.daemon.server import _invalid_args_error, _parse_strike_range, _unknown_command_error


def test_parse_strike_range_valid() -> None:
    assert _parse_strike_range("0.8:1.2") == (0.8, 1.2)


def test_parse_strike_range_invalid() -> None:
    with pytest.raises(Exception):
        _parse_strike_range("bad")


def test_unknown_command_error_has_suggestion() -> None:
    error = _unknown_command_error("ordr.place")
    assert error.code.value == "INVALID_ARGS"
    assert error.suggestion
    assert "order.place" in error.suggestion


def test_invalid_args_error_from_keyerror() -> None:
    error = _invalid_args_error(KeyError("symbol"))
    assert error.code.value == "INVALID_ARGS"
    assert "missing required parameter" in error.message
