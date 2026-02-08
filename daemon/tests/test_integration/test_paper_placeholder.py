from __future__ import annotations

import pytest


@pytest.mark.skip(reason="Requires IB paper gateway running locally")
def test_integration_placeholder() -> None:
    assert True
