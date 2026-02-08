from __future__ import annotations

import pytest

from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.protocol import ErrorResponse, Response
from broker_sdk import AGENT_TOPICS, RISK_PARAMS
from broker_sdk.client import _unwrap_response


def test_unwrap_success() -> None:
    response = Response(request_id="1", ok=True, data={"ok": True})
    assert _unwrap_response(response) == {"ok": True}


def test_unwrap_error() -> None:
    response = Response(
        request_id="1",
        ok=False,
        error=ErrorResponse(code=ErrorCode.INVALID_ARGS.value, message="bad args"),
    )
    with pytest.raises(BrokerError) as exc:
        _unwrap_response(response)
    assert exc.value.code == ErrorCode.INVALID_ARGS


def test_exported_constants_are_non_empty() -> None:
    assert len(AGENT_TOPICS) > 0
    assert "max_order_value" in RISK_PARAMS
