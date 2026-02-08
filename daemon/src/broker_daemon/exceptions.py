"""Error hierarchy and code mapping for broker."""

from __future__ import annotations

from enum import Enum
from typing import Any


class ErrorCode(str, Enum):
    DAEMON_NOT_RUNNING = "DAEMON_NOT_RUNNING"
    IB_DISCONNECTED = "IB_DISCONNECTED"
    IB_REJECTED = "IB_REJECTED"
    RISK_CHECK_FAILED = "RISK_CHECK_FAILED"
    RISK_HALTED = "RISK_HALTED"
    RATE_LIMITED = "RATE_LIMITED"
    DUPLICATE_ORDER = "DUPLICATE_ORDER"
    INVALID_SYMBOL = "INVALID_SYMBOL"
    INVALID_ARGS = "INVALID_ARGS"
    TIMEOUT = "TIMEOUT"
    INTERNAL_ERROR = "INTERNAL_ERROR"


EXIT_CODE_BY_ERROR: dict[ErrorCode, int] = {
    ErrorCode.INVALID_ARGS: 2,
    ErrorCode.DAEMON_NOT_RUNNING: 3,
    ErrorCode.IB_DISCONNECTED: 4,
    ErrorCode.RISK_CHECK_FAILED: 5,
    ErrorCode.RISK_HALTED: 6,
    ErrorCode.TIMEOUT: 10,
}


class BrokerError(Exception):
    """Base typed exception converted to protocol error responses."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        suggestion: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
        self.suggestion = suggestion

    @property
    def exit_code(self) -> int:
        return EXIT_CODE_BY_ERROR.get(self.code, 1)

    def to_error_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code.value,
            "message": self.message,
            "details": self.details,
        }
        if self.suggestion:
            payload["suggestion"] = self.suggestion
        return payload
