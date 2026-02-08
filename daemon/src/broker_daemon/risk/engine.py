"""Risk engine implementing mandatory pre-trade checks."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from broker_daemon.config import RiskConfig
from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.models.orders import OrderRequest, Side
from broker_daemon.models.risk import RiskCheckResult, RiskConfigSnapshot, RiskOverride
from broker_daemon.risk.limits import coerce_param, config_to_dict, validate_param


@dataclass
class RiskContext:
    nlv: float = 0.0
    daily_pnl: float = 0.0
    open_orders: int = 0
    mark_prices: dict[str, float] = field(default_factory=dict)
    position_values: dict[str, float] = field(default_factory=dict)
    sector_by_symbol: dict[str, str] = field(default_factory=dict)
    sector_exposure_values: dict[str, float] = field(default_factory=dict)


class RiskEngine:
    def __init__(self, config: RiskConfig) -> None:
        self._limits = config_to_dict(config)
        self._halted = False
        self._order_times: deque[datetime] = deque()
        self._duplicate_times: dict[str, datetime] = {}
        self._overrides: list[RiskOverride] = []

    @property
    def halted(self) -> bool:
        return self._halted

    def _cleanup_state(self) -> None:
        now = datetime.now(UTC)

        while self._order_times and (now - self._order_times[0]).total_seconds() > 60:
            self._order_times.popleft()

        duplicate_window = self._effective_value("duplicate_window_seconds")
        self._duplicate_times = {
            key: ts for key, ts in self._duplicate_times.items() if (now - ts).total_seconds() <= duplicate_window
        }

        self._overrides = [ov for ov in self._overrides if ov.expires_at > now]

    def _effective_value(self, param: str) -> Any:
        for override in reversed(self._overrides):
            if override.param == param and override.expires_at > datetime.now(UTC):
                return override.value
        return self._limits[param]

    def snapshot(self) -> RiskConfigSnapshot:
        self._cleanup_state()
        payload = {key: self._effective_value(key) for key in self._limits}
        return RiskConfigSnapshot.model_validate({**payload, "halted": self._halted})

    def set_limit(self, param: str, value: Any) -> RiskConfigSnapshot:
        key = validate_param(param)
        self._limits[key] = coerce_param(key, value)
        return self.snapshot()

    def override_limit(self, param: str, value: Any, duration_seconds: int, reason: str) -> RiskOverride:
        key = validate_param(param)
        coerced = coerce_param(key, value)
        if not isinstance(coerced, (int, float)):
            raise ValueError(f"risk override supports only numeric params, got '{key}'")
        override = RiskOverride.from_duration(param=key, value=float(coerced), reason=reason, seconds=duration_seconds)
        self._overrides.append(override)
        return override

    def halt(self) -> None:
        self._halted = True

    def resume(self) -> None:
        self._halted = False

    def assert_order(self, order: OrderRequest, context: RiskContext) -> RiskCheckResult:
        result = self.check_order(order, context)
        if not result.ok:
            code = ErrorCode.RISK_HALTED if self._halted else ErrorCode.RISK_CHECK_FAILED
            violation_codes = {str(item) for item in result.details.get("violation_codes", [])}
            if ErrorCode.RATE_LIMITED.value in violation_codes:
                code = ErrorCode.RATE_LIMITED
            elif ErrorCode.DUPLICATE_ORDER.value in violation_codes:
                code = ErrorCode.DUPLICATE_ORDER
            raise BrokerError(code, "; ".join(result.reasons), details=result.details, suggestion=result.suggestion)
        return result

    def check_order(self, order: OrderRequest, context: RiskContext) -> RiskCheckResult:
        self._cleanup_state()
        reasons: list[str] = []
        details: dict[str, Any] = {}
        violation_codes: set[str] = set()

        if self._halted:
            return RiskCheckResult(
                ok=False,
                reasons=["trading is halted"],
                details={"halted": True, "violation_codes": [ErrorCode.RISK_HALTED.value]},
            )

        symbol = order.symbol.upper()
        allowlist = self._effective_value("symbol_allowlist")
        blocklist = self._effective_value("symbol_blocklist")
        if allowlist and symbol not in allowlist:
            reasons.append(f"symbol {symbol} is not in allowlist")
        if blocklist and symbol in blocklist:
            reasons.append(f"symbol {symbol} is in blocklist")

        now = datetime.now(UTC)
        rate_limit = int(self._effective_value("order_rate_limit"))
        if len(self._order_times) >= rate_limit:
            reasons.append(f"order rate limit exceeded ({rate_limit}/minute)")
            details["orders_last_minute"] = len(self._order_times)
            details["limit"] = rate_limit
            violation_codes.add(ErrorCode.RATE_LIMITED.value)

        duplicate_key = f"{order.side.value}:{symbol}:{order.qty}:{order.limit}:{order.stop}:{order.tif.value}"
        if duplicate_key in self._duplicate_times:
            reasons.append("duplicate order detected inside duplicate window")
            details["duplicate_window_seconds"] = self._effective_value("duplicate_window_seconds")
            violation_codes.add(ErrorCode.DUPLICATE_ORDER.value)

        mark = order.limit or order.stop or context.mark_prices.get(symbol)
        if mark is None:
            mark = 0.0
        notional = abs(order.qty * mark)
        details["notional"] = notional

        max_order_value = float(self._effective_value("max_order_value"))
        if max_order_value > 0 and notional > max_order_value:
            reasons.append(f"order notional {notional:.2f} exceeds max_order_value {max_order_value:.2f}")

        max_open_orders = int(self._effective_value("max_open_orders"))
        if context.open_orders >= max_open_orders:
            reasons.append(f"open orders {context.open_orders} exceed max_open_orders {max_open_orders}")

        nlv = float(context.nlv or 0.0)
        if nlv > 0:
            current_value = float(context.position_values.get(symbol, 0.0))
            signed_notional = notional if order.side == Side.BUY else -notional
            projected_value = current_value + signed_notional
            projected_pct = abs(projected_value) / nlv * 100.0

            max_position_pct = float(self._effective_value("max_position_pct"))
            if projected_pct > max_position_pct:
                reasons.append(f"projected position {projected_pct:.2f}% exceeds max_position_pct {max_position_pct:.2f}%")

            max_single_name_pct = float(self._effective_value("max_single_name_pct"))
            if projected_pct > max_single_name_pct:
                reasons.append(
                    f"projected position {projected_pct:.2f}% exceeds max_single_name_pct {max_single_name_pct:.2f}%"
                )

            sector = context.sector_by_symbol.get(symbol)
            if sector:
                current_sector = float(context.sector_exposure_values.get(sector, 0.0))
                projected_sector_pct = abs(current_sector + signed_notional) / nlv * 100.0
                details["sector"] = sector
                details["projected_sector_pct"] = round(projected_sector_pct, 4)
                max_sector = float(self._effective_value("max_sector_exposure_pct"))
                if projected_sector_pct > max_sector:
                    reasons.append(
                        f"projected sector exposure {projected_sector_pct:.2f}% exceeds max_sector_exposure_pct {max_sector:.2f}%"
                    )

            max_daily_loss_pct = float(self._effective_value("max_daily_loss_pct"))
            loss_pct = abs(min(context.daily_pnl, 0.0)) / nlv * 100.0
            details["daily_loss_pct"] = round(loss_pct, 4)
            if loss_pct > max_daily_loss_pct:
                reasons.append(f"daily drawdown {loss_pct:.2f}% exceeds max_daily_loss_pct {max_daily_loss_pct:.2f}%")

        if reasons:
            if violation_codes:
                details["violation_codes"] = sorted(violation_codes)
            suggestion = None
            if notional > max_order_value and mark:
                max_qty = int(max_order_value / mark)
                suggestion = f"reduce quantity to <= {max_qty}"
            return RiskCheckResult(ok=False, reasons=reasons, details=details, suggestion=suggestion)

        self._order_times.append(now)
        self._duplicate_times[duplicate_key] = now
        return RiskCheckResult(ok=True, reasons=[], details=details)

    def check_drawdown_breaker(self, daily_pnl: float, nlv: float) -> tuple[bool, float]:
        if nlv <= 0:
            return False, 0.0
        loss_pct = abs(min(daily_pnl, 0.0)) / nlv * 100.0
        breached = loss_pct > float(self._effective_value("max_daily_loss_pct"))
        return breached, loss_pct

    def list_overrides(self) -> list[RiskOverride]:
        self._cleanup_state()
        return list(self._overrides)

    @staticmethod
    def parse_duration(value: str) -> int:
        raw = value.strip().lower()
        if raw.endswith("h"):
            return int(raw[:-1]) * 3600
        if raw.endswith("m"):
            return int(raw[:-1]) * 60
        if raw.endswith("s"):
            return int(raw[:-1])
        if raw.isdigit():
            return int(raw)
        raise ValueError(f"invalid duration '{value}'")
