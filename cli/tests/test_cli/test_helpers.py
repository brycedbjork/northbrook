from __future__ import annotations

import pytest
import typer

from agent import _parse_topics
from market import _parse_interval


def test_parse_interval_supports_milliseconds() -> None:
    assert _parse_interval("250ms") == 0.25


def test_parse_interval_rejects_non_positive_values() -> None:
    with pytest.raises(typer.BadParameter):
        _parse_interval("0s")


def test_parse_topics_all_expands() -> None:
    topics = _parse_topics("all")
    assert "orders" in topics
    assert "risk" in topics


def test_parse_topics_invalid_raises() -> None:
    with pytest.raises(typer.BadParameter):
        _parse_topics("orders,not-a-topic")
