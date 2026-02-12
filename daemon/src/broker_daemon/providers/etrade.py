"""E*Trade provider implementation built on REST + OAuth 1.0a."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from datetime import UTC, datetime
import json
import logging
from pathlib import Path
import time
from typing import Any, Awaitable, Callable

import httpx
from authlib.integrations.httpx_client import AsyncOAuth1Client

from broker_daemon.audit.logger import AuditLogger
from broker_daemon.config import ETradeConfig
from broker_daemon.exceptions import ErrorCode, BrokerError
from broker_daemon.models.events import Event, EventTopic
from broker_daemon.models.market import Quote
from broker_daemon.models.orders import FillRecord, OrderRequest
from broker_daemon.models.portfolio import Balance, PnLSummary, Position
from broker_daemon.providers.base import BrokerProvider, ConnectionStatus

logger = logging.getLogger(__name__)

AUTH_REQUIRED_SUGGESTION = "Run `broker auth etrade` to create fresh E*Trade tokens."
RENEW_INTERVAL_SECONDS = 90 * 60
MIN_REQUEST_GAP_SECONDS = 0.2
QUOTE_BATCH_SIZE = 25


def etrade_api_base(sandbox: bool) -> str:
    return "https://apisb.etrade.com" if sandbox else "https://api.etrade.com"


def etrade_authorize_url(consumer_key: str, request_token: str) -> str:
    return f"https://us.etrade.com/e/t/etws/authorize?key={consumer_key}&token={request_token}"


def load_etrade_tokens(path: Path) -> tuple[str, str] | None:
    token_path = path.expanduser()
    if not token_path.exists():
        return None
    try:
        payload = json.loads(token_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    oauth_token = str(payload.get("oauth_token") or "").strip()
    oauth_token_secret = str(payload.get("oauth_token_secret") or "").strip()
    if not oauth_token or not oauth_token_secret:
        return None
    return oauth_token, oauth_token_secret


def save_etrade_tokens(path: Path, *, oauth_token: str, oauth_token_secret: str) -> None:
    token_path = path.expanduser()
    token_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "oauth_token": oauth_token,
        "oauth_token_secret": oauth_token_secret,
        "saved_at": datetime.now(UTC).isoformat(),
    }
    token_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    with suppress(OSError):
        token_path.chmod(0o600)


async def etrade_request_token(
    *,
    consumer_key: str,
    consumer_secret: str,
    sandbox: bool,
) -> dict[str, str]:
    client = AsyncOAuth1Client(client_id=consumer_key, client_secret=consumer_secret, callback_uri="oob")
    endpoint = f"{etrade_api_base(sandbox)}/oauth/request_token"
    try:
        token = await client.fetch_request_token(endpoint)
    except httpx.TimeoutException as exc:
        raise BrokerError(ErrorCode.TIMEOUT, f"request_token failed: {exc}") from exc
    except httpx.RequestError as exc:
        raise BrokerError(
            ErrorCode.IB_DISCONNECTED,
            f"request_token failed: {exc}",
            suggestion="Check network connectivity and E*Trade API availability.",
        ) from exc
    except Exception as exc:
        raise BrokerError(
            ErrorCode.IB_REJECTED,
            f"request_token failed: {exc}",
            suggestion="Verify E*Trade consumer credentials and retry.",
        ) from exc
    finally:
        await client.aclose()

    oauth_token = str(token.get("oauth_token") or "").strip()
    oauth_token_secret = str(token.get("oauth_token_secret") or "").strip()
    if not oauth_token or not oauth_token_secret:
        raise BrokerError(
            ErrorCode.IB_REJECTED,
            "request_token failed: missing oauth token in response",
            suggestion="Verify E*Trade consumer credentials and retry.",
        )
    return {"oauth_token": oauth_token, "oauth_token_secret": oauth_token_secret}


async def etrade_access_token(
    *,
    consumer_key: str,
    consumer_secret: str,
    request_token: str,
    request_token_secret: str,
    verifier: str,
    sandbox: bool,
) -> dict[str, str]:
    client = AsyncOAuth1Client(
        client_id=consumer_key,
        client_secret=consumer_secret,
        token=request_token,
        token_secret=request_token_secret,
    )
    endpoint = f"{etrade_api_base(sandbox)}/oauth/access_token"
    try:
        token = await client.fetch_access_token(endpoint, verifier=verifier)
    except httpx.TimeoutException as exc:
        raise BrokerError(ErrorCode.TIMEOUT, f"access_token failed: {exc}") from exc
    except httpx.RequestError as exc:
        raise BrokerError(
            ErrorCode.IB_DISCONNECTED,
            f"access_token failed: {exc}",
            suggestion="Check network connectivity and E*Trade API availability.",
        ) from exc
    except Exception as exc:
        raise BrokerError(
            ErrorCode.IB_REJECTED,
            f"access_token failed: {exc}",
            suggestion="Ensure the verifier code is valid and not expired.",
        ) from exc
    finally:
        await client.aclose()

    oauth_token = str(token.get("oauth_token") or "").strip()
    oauth_token_secret = str(token.get("oauth_token_secret") or "").strip()
    if not oauth_token or not oauth_token_secret:
        raise BrokerError(
            ErrorCode.IB_REJECTED,
            "access_token failed: missing oauth token in response",
            suggestion="Ensure the verifier code is valid and retry auth.",
        )
    return {"oauth_token": oauth_token, "oauth_token_secret": oauth_token_secret}


class ETradeProvider(BrokerProvider):
    def __init__(
        self,
        cfg: ETradeConfig,
        *,
        audit: AuditLogger | None = None,
        event_cb: Callable[[Event], Awaitable[None]] | None = None,
    ) -> None:
        self._cfg = cfg
        self._audit = audit
        self._event_cb = event_cb
        self._client: AsyncOAuth1Client | None = None
        self._connected_at: datetime | None = None
        self._last_error: str | None = None
        self._renew_task: asyncio.Task[None] | None = None
        self._oauth_token = ""
        self._oauth_token_secret = ""
        self._token_valid = False
        self._account_id_key = cfg.account_id_key.strip()
        self._rate_lock = asyncio.Lock()
        self._last_request_monotonic = 0.0

    @property
    def capabilities(self) -> dict[str, bool]:
        return {
            "history": False,
            "option_chain": False,
            "exposure": False,
            "bracket_orders": False,
            "streaming": False,
            "cancel_all": False,
        }

    async def start(self) -> None:
        self._validate_consumer_credentials()

        loaded = load_etrade_tokens(self._cfg.token_path)
        if loaded is None:
            raise BrokerError(
                ErrorCode.IB_DISCONNECTED,
                f"missing E*Trade OAuth tokens at {self._cfg.token_path.expanduser()}",
                suggestion=AUTH_REQUIRED_SUGGESTION,
            )

        self._oauth_token, self._oauth_token_secret = loaded
        self._token_valid = True
        self._client = self._build_client()

        try:
            await self._renew_access_token(initial=True)
            await self._discover_account_id_key()
        except Exception:
            await self._close_client()
            raise

        self._connected_at = datetime.now(UTC)
        self._last_error = None
        self._renew_task = asyncio.create_task(self._renew_loop())
        await self._log_connection(
            "connected",
            {
                "host": self._api_base,
                "account_id_key": self._account_id_key,
            },
        )

    async def stop(self) -> None:
        if self._renew_task:
            self._renew_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._renew_task
            self._renew_task = None
        await self._close_client()
        self._connected_at = None
        self._token_valid = False

    async def ensure_connected(self) -> None:
        if self.is_connected:
            return
        raise BrokerError(
            ErrorCode.IB_DISCONNECTED,
            "daemon is not connected to E*Trade",
            details={"host": self._api_base, "last_error": self._last_error},
            suggestion=AUTH_REQUIRED_SUGGESTION,
        )

    def status(self) -> ConnectionStatus:
        return ConnectionStatus(
            connected=self.is_connected,
            host=self._api_base,
            port=443,
            client_id=0,
            connected_at=self._connected_at,
            account_id=self._account_id_key or None,
            last_error=self._last_error,
        )

    @property
    def is_connected(self) -> bool:
        return bool(self._client and self._token_valid and self._oauth_token and self._oauth_token_secret)

    async def quote(self, symbols: list[str]) -> list[Quote]:
        if not symbols:
            return []

        out: list[Quote] = []
        for group in _chunks([s.upper().strip() for s in symbols if s.strip()], QUOTE_BATCH_SIZE):
            path = f"/v1/market/quote/{','.join(group)}"
            payload = await self._request_json(
                "GET",
                path,
                params={"detailFlag": "ALL"},
                operation="quote",
            )
            for row in _extract_quote_rows(payload):
                all_data = row.get("All") if isinstance(row.get("All"), dict) else {}
                product = row.get("Product") if isinstance(row.get("Product"), dict) else {}
                symbol = str(product.get("symbol") or row.get("symbol") or "").upper()
                if not symbol:
                    continue
                out.append(
                    Quote(
                        symbol=symbol,
                        bid=_as_float(all_data.get("bid")),
                        ask=_as_float(all_data.get("ask")),
                        last=_as_float(all_data.get("lastTrade")),
                        volume=_as_float(all_data.get("totalVolume")),
                        timestamp=datetime.now(UTC),
                        exchange=str(product.get("exchange") or "") or None,
                        currency=str(product.get("currency") or "USD") or "USD",
                    )
                )
        return out

    async def positions(self) -> list[Position]:
        account_id_key = await self._require_account_id_key()
        payload = await self._request_json(
            "GET",
            f"/v1/accounts/{account_id_key}/portfolio",
            operation="positions",
        )
        rows = _extract_position_rows(payload)
        if not rows:
            return []

        out: list[Position] = []
        for row in rows:
            product = row.get("Product") if isinstance(row.get("Product"), dict) else {}
            quick = row.get("Quick") if isinstance(row.get("Quick"), dict) else {}
            symbol = str(product.get("symbol") or quick.get("symbol") or "").upper()
            if not symbol:
                continue

            qty = _as_float(row.get("quantity")) or 0.0
            avg_cost = _as_float(row.get("pricePaid")) or 0.0
            market_price = _as_float(quick.get("lastTrade"))
            market_value = _as_float(row.get("marketValue"))
            if market_value is None and market_price is not None:
                market_value = market_price * qty

            unrealized = _as_float(row.get("totalGain"))
            if unrealized is None and market_price is not None:
                unrealized = (market_price - avg_cost) * qty

            out.append(
                Position(
                    symbol=symbol,
                    qty=qty,
                    avg_cost=avg_cost,
                    market_price=market_price,
                    market_value=market_value,
                    unrealized_pnl=unrealized,
                    currency=str(product.get("currency") or "USD") or "USD",
                )
            )
        return out

    async def balance(self) -> Balance:
        account_id_key = await self._require_account_id_key()
        payload = await self._request_json(
            "GET",
            f"/v1/accounts/{account_id_key}/balance",
            params={"instType": "BROKERAGE", "realTimeNAV": "true"},
            operation="balance",
        )
        body = payload.get("BalanceResponse") if isinstance(payload.get("BalanceResponse"), dict) else payload
        computed = body.get("Computed") if isinstance(body, dict) and isinstance(body.get("Computed"), dict) else {}
        real_time = computed.get("RealTimeValues") if isinstance(computed.get("RealTimeValues"), dict) else {}

        net_liquidation = _as_float(real_time.get("netMv"))
        cash = _as_float(computed.get("cashAvailableForInvestment"))
        buying_power = (
            _as_float(computed.get("cashBuyingPower"))
            or _as_float(computed.get("marginBuyingPower"))
            or net_liquidation
        )
        margin_used = _as_float(computed.get("marginBalance"))
        margin_available = _as_float(computed.get("cashAvailableForInvestment"))

        return Balance(
            account_id=str(body.get("accountIdKey") or account_id_key) if isinstance(body, dict) else account_id_key,
            net_liquidation=net_liquidation,
            cash=cash,
            buying_power=buying_power,
            margin_used=margin_used,
            margin_available=margin_available,
        )

    async def pnl(self) -> PnLSummary:
        positions = await self.positions()
        unrealized = sum(float(row.unrealized_pnl or 0.0) for row in positions)
        realized = 0.0
        return PnLSummary(realized=realized, unrealized=unrealized, total=realized + unrealized)

    async def place_order(self, order: OrderRequest, client_order_id: str) -> dict[str, Any]:
        account_id_key = await self._require_account_id_key()
        preview_payload = self._build_preview_payload(order, client_order_id)

        preview_response = await self._request_json(
            "POST",
            f"/v1/accounts/{account_id_key}/orders/preview",
            json_body=preview_payload,
            operation="order_preview",
        )
        preview_id = _extract_preview_id(preview_response)
        if not preview_id:
            raise BrokerError(
                ErrorCode.IB_REJECTED,
                "order preview failed: previewId missing in response",
                details={"operation": "order_preview"},
            )

        place_request = dict(preview_payload["PreviewOrderRequest"])
        place_request["previewIds"] = [{"previewId": preview_id}]
        place_payload = {"PlaceOrderRequest": place_request}
        place_response = await self._request_json(
            "POST",
            f"/v1/accounts/{account_id_key}/orders/place",
            json_body=place_payload,
            operation="order_place",
        )

        order_id_raw = _extract_order_id(place_response)
        status_raw = _extract_place_status(place_response)
        return {
            "ib_order_id": _as_int(order_id_raw),
            "status": _normalize_order_status(status_raw),
        }

    async def cancel_order(self, client_order_id: str | None = None, ib_order_id: int | None = None) -> dict[str, Any]:
        account_id_key = await self._require_account_id_key()

        order_id: str | None
        if ib_order_id is not None:
            order_id = str(ib_order_id)
        elif client_order_id:
            order_id = await self._find_order_id_by_client_id(client_order_id)
        else:
            raise BrokerError(ErrorCode.INVALID_ARGS, "cancel_order requires client_order_id or ib_order_id")

        if not order_id:
            return {"cancelled": False}

        payload = {"CancelOrderRequest": {"orderId": order_id}}
        response = await self._request_json(
            "PUT",
            f"/v1/accounts/{account_id_key}/orders/cancel",
            json_body=payload,
            operation="cancel_order",
        )
        cancelled = _extract_cancelled(response)
        return {"cancelled": cancelled, "ib_order_id": _as_int(order_id)}

    async def trades(self) -> list[dict[str, Any]]:
        raw_orders = await self._list_orders_raw()
        out: list[dict[str, Any]] = []
        for row in raw_orders:
            parsed = _parse_order_row(row)
            status = _normalize_order_status(parsed["status"])
            out.append(
                {
                    "ib_order_id": _as_int(parsed["order_id"]),
                    "client_order_id": parsed["client_order_id"],
                    "symbol": parsed["symbol"],
                    "status": status,
                    "action": parsed["action"],
                    "qty": parsed["qty"],
                    "filled": parsed["filled"],
                    "remaining": parsed["remaining"],
                    "avg_fill_price": parsed["avg_fill_price"],
                }
            )
        return out

    async def fills(self) -> list[FillRecord]:
        raw_orders = await self._list_orders_raw()
        out: list[FillRecord] = []
        for row in raw_orders:
            parsed = _parse_order_row(row)
            status = _normalize_order_status(parsed["status"])
            filled = float(parsed["filled"] or 0.0)
            if status != "Filled" and filled <= 0:
                continue
            qty = filled if filled > 0 else float(parsed["qty"] or 0.0)
            out.append(
                FillRecord(
                    fill_id=str(parsed["order_id"] or ""),
                    client_order_id=str(parsed["client_order_id"] or ""),
                    ib_order_id=_as_int(parsed["order_id"]),
                    symbol=str(parsed["symbol"] or ""),
                    qty=qty,
                    price=float(parsed["avg_fill_price"] or 0.0),
                    timestamp=datetime.now(UTC),
                )
            )
        return out

    @property
    def _api_base(self) -> str:
        return etrade_api_base(self._cfg.sandbox)

    def _validate_consumer_credentials(self) -> None:
        if self._cfg.consumer_key.strip() and self._cfg.consumer_secret.strip():
            return
        raise BrokerError(
            ErrorCode.INVALID_ARGS,
            "E*Trade consumer_key and consumer_secret are required",
            suggestion="Set broker.etrade.consumer_key and broker.etrade.consumer_secret in config or env.",
        )

    def _build_client(self) -> AsyncOAuth1Client:
        return AsyncOAuth1Client(
            client_id=self._cfg.consumer_key,
            client_secret=self._cfg.consumer_secret,
            token=self._oauth_token,
            token_secret=self._oauth_token_secret,
            timeout=httpx.Timeout(20.0, connect=10.0),
        )

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _renew_access_token(self, *, initial: bool = False) -> None:
        try:
            await self._request(
                "GET",
                "/oauth/renew_access_token",
                operation="renew_access_token",
                require_connected=False,
            )
            self._token_valid = True
            return
        except BrokerError as exc:
            auth_expired = bool(exc.details.get("status_code") in {401, 403})
            if auth_expired:
                message = "E*Trade access token is expired or revoked"
                if initial:
                    message = "saved E*Trade access token is expired; re-authentication required"
                self._token_valid = False
                self._last_error = message
                raise BrokerError(
                    ErrorCode.IB_DISCONNECTED,
                    message,
                    details={"auth_expired": True},
                    suggestion=AUTH_REQUIRED_SUGGESTION,
                ) from exc
            raise

    async def _discover_account_id_key(self) -> None:
        if self._account_id_key:
            return
        payload = await self._request_json("GET", "/v1/accounts/list", operation="accounts_list")
        accounts = _extract_accounts(payload)
        for row in accounts:
            account_id_key = str(row.get("accountIdKey") or "").strip()
            if account_id_key:
                self._account_id_key = account_id_key
                return
        raise BrokerError(
            ErrorCode.IB_REJECTED,
            "unable to discover E*Trade accountIdKey from /v1/accounts/list",
            suggestion="Verify your account has brokerage access and API permissions.",
        )

    async def _require_account_id_key(self) -> str:
        await self.ensure_connected()
        if not self._account_id_key:
            await self._discover_account_id_key()
        if not self._account_id_key:
            raise BrokerError(ErrorCode.IB_REJECTED, "E*Trade accountIdKey is unavailable")
        return self._account_id_key

    async def _renew_loop(self) -> None:
        while True:
            await asyncio.sleep(RENEW_INTERVAL_SECONDS)
            try:
                await self._renew_access_token()
            except BrokerError as exc:
                self._last_error = exc.message
                if exc.details.get("auth_expired"):
                    await self._log_connection("disconnected", {"reason": "token_expired"})
                    return
                logger.warning("E*Trade token renew failed: %s", exc.message)
            except Exception:
                logger.exception("unexpected E*Trade renew failure")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        operation: str,
        require_connected: bool = True,
    ) -> httpx.Response:
        if require_connected:
            await self.ensure_connected()
        if self._client is None:
            raise BrokerError(ErrorCode.IB_DISCONNECTED, "E*Trade HTTP client is not initialized", suggestion=AUTH_REQUIRED_SUGGESTION)

        await self._throttle()
        url = path if path.startswith("http") else f"{self._api_base}{path}"
        headers = {"Accept": "application/json"}

        try:
            response = await self._client.request(
                method,
                url,
                params=params,
                json=json_body,
                headers=headers,
            )
        except httpx.TimeoutException as exc:
            self._last_error = f"{operation} timed out: {exc}"
            raise BrokerError(
                ErrorCode.TIMEOUT,
                f"{operation} timed out",
                details={"operation": operation, "error": str(exc)},
                suggestion="Retry and consider increasing runtime.request_timeout_seconds if needed.",
            ) from exc
        except httpx.RequestError as exc:
            self._last_error = f"{operation} network error: {exc}"
            raise BrokerError(
                ErrorCode.IB_DISCONNECTED,
                f"{operation} failed: {exc}",
                details={"operation": operation, "error_type": type(exc).__name__},
                suggestion="Check network connectivity and E*Trade API availability.",
            ) from exc

        if response.status_code >= 400:
            self._raise_http_error(response, operation=operation, path=path)
        return response

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        operation: str,
        require_connected: bool = True,
    ) -> dict[str, Any]:
        response = await self._request(
            method,
            path,
            params=params,
            json_body=json_body,
            operation=operation,
            require_connected=require_connected,
        )
        if not response.content:
            return {}
        try:
            payload = response.json()
        except Exception as exc:
            self._last_error = f"{operation} returned non-JSON payload"
            raise BrokerError(
                ErrorCode.IB_REJECTED,
                f"{operation} failed: expected JSON response",
                details={"operation": operation, "status_code": response.status_code},
            ) from exc
        if not isinstance(payload, dict):
            return {}
        return payload

    def _raise_http_error(self, response: httpx.Response, *, operation: str, path: str) -> None:
        status_code = response.status_code
        payload: dict[str, Any] = {}
        raw = response.text.strip()
        if response.content:
            with suppress(Exception):
                parsed = response.json()
                if isinstance(parsed, dict):
                    payload = parsed
                    raw = _extract_error_message(parsed) or raw

        code = ErrorCode.IB_REJECTED
        suggestion: str | None = None
        lowered = raw.lower()
        if status_code in {401, 403}:
            code = ErrorCode.IB_DISCONNECTED
            suggestion = AUTH_REQUIRED_SUGGESTION
        elif status_code == 429:
            code = ErrorCode.RATE_LIMITED
            suggestion = "Retry with lower request frequency."
        elif path.startswith("/v1/market/quote") and (status_code in {400, 404} or "symbol" in lowered):
            code = ErrorCode.INVALID_SYMBOL
            suggestion = "Confirm symbol formatting and market data availability."

        self._last_error = f"{operation} HTTP {status_code}: {raw}"
        raise BrokerError(
            code,
            f"{operation} failed: {raw or response.reason_phrase}",
            details={
                "operation": operation,
                "status_code": status_code,
                "path": path,
            },
            suggestion=suggestion,
        )

    async def _throttle(self) -> None:
        async with self._rate_lock:
            now = time.monotonic()
            elapsed = now - self._last_request_monotonic
            if elapsed < MIN_REQUEST_GAP_SECONDS:
                await asyncio.sleep(MIN_REQUEST_GAP_SECONDS - elapsed)
            self._last_request_monotonic = time.monotonic()

    async def _list_orders_raw(self) -> list[dict[str, Any]]:
        account_id_key = await self._require_account_id_key()
        payload = await self._request_json(
            "GET",
            f"/v1/accounts/{account_id_key}/orders",
            operation="orders_list",
        )
        return _extract_orders(payload)

    async def _find_order_id_by_client_id(self, client_order_id: str) -> str | None:
        wanted = client_order_id.strip()
        if not wanted:
            return None
        for row in await self._list_orders_raw():
            parsed = _parse_order_row(row)
            if str(parsed["client_order_id"] or "").strip() != wanted:
                continue
            order_id = parsed["order_id"]
            if order_id:
                return str(order_id)
        return None

    async def _log_connection(self, event: str, details: dict[str, Any]) -> None:
        logger.info("connection_event=%s details=%s", event, details)
        if self._audit:
            await self._audit.log_connection_event(event, details)
        if self._event_cb:
            await self._event_cb(Event(topic=EventTopic.CONNECTION, payload={"event": event, **details}))

    def _build_preview_payload(self, order: OrderRequest, client_order_id: str) -> dict[str, Any]:
        price_type = _price_type(order)
        order_term = _order_term(order.tif.value)
        instrument = {
            "Product": {
                "securityType": "EQ",
                "symbol": order.symbol.upper(),
            },
            "orderAction": _order_action(order.side.value),
            "quantityType": "QUANTITY",
            "quantity": abs(order.qty),
        }
        order_item: dict[str, Any] = {
            "allOrNone": "false",
            "priceType": price_type,
            "orderTerm": order_term,
            "Instrument": [instrument],
        }
        if order.limit is not None:
            order_item["limitPrice"] = order.limit
        if order.stop is not None:
            order_item["stopPrice"] = order.stop
        return {
            "PreviewOrderRequest": {
                "orderType": "EQ",
                "clientOrderId": client_order_id,
                "Order": [order_item],
            }
        }


def _chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[i : i + size] for i in range(0, len(values), size)]


def _extract_quote_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    quote_response = payload.get("QuoteResponse")
    if not isinstance(quote_response, dict):
        return []
    rows = quote_response.get("QuoteData")
    return [row for row in _as_list(rows) if isinstance(row, dict)]


def _extract_accounts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    response = payload.get("AccountListResponse")
    if not isinstance(response, dict):
        return []
    accounts = response.get("Accounts")
    if not isinstance(accounts, dict):
        return []
    rows = accounts.get("Account")
    return [row for row in _as_list(rows) if isinstance(row, dict)]


def _extract_position_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    response = payload.get("PortfolioResponse")
    if not isinstance(response, dict):
        return []
    portfolios = [item for item in _as_list(response.get("AccountPortfolio")) if isinstance(item, dict)]
    rows: list[dict[str, Any]] = []
    for portfolio in portfolios:
        for row in _as_list(portfolio.get("Position")):
            if isinstance(row, dict):
                rows.append(row)
    return rows


def _extract_orders(payload: dict[str, Any]) -> list[dict[str, Any]]:
    response = payload.get("OrdersResponse")
    if not isinstance(response, dict):
        return []
    rows = response.get("Order")
    return [row for row in _as_list(rows) if isinstance(row, dict)]


def _extract_preview_id(payload: dict[str, Any]) -> str | None:
    response = payload.get("PreviewOrderResponse")
    if not isinstance(response, dict):
        return None
    raw_preview_ids = response.get("PreviewIds")
    for row in _as_list(raw_preview_ids):
        if isinstance(row, dict):
            value = row.get("previewId") or row.get("PreviewId")
        else:
            value = row
        if value not in {None, ""}:
            return str(value)
    for key in ("previewId", "PreviewId"):
        value = response.get(key)
        if value not in {None, ""}:
            return str(value)
    return None


def _extract_order_id(payload: dict[str, Any]) -> str | None:
    response = payload.get("PlaceOrderResponse")
    if not isinstance(response, dict):
        return None
    raw_order_ids = response.get("OrderIds")
    for row in _as_list(raw_order_ids):
        if isinstance(row, dict):
            value = row.get("orderId") or row.get("OrderId")
        else:
            value = row
        if value not in {None, ""}:
            return str(value)
    for key in ("orderId", "OrderId"):
        value = response.get(key)
        if value not in {None, ""}:
            return str(value)
    return None


def _extract_place_status(payload: dict[str, Any]) -> str:
    response = payload.get("PlaceOrderResponse")
    if not isinstance(response, dict):
        return "Submitted"
    for key in ("orderStatus", "OrderStatus", "status", "Status"):
        value = response.get(key)
        if value not in {None, ""}:
            return str(value)
    return "Submitted"


def _extract_cancelled(payload: dict[str, Any]) -> bool:
    response = payload.get("CancelOrderResponse")
    if not isinstance(response, dict):
        return True
    for key in ("cancelStatus", "CancelStatus", "status", "Status"):
        value = response.get(key)
        if value is None:
            continue
        normalized = str(value).strip().lower()
        if normalized in {"success", "ok", "cancelled", "canceled"}:
            return True
        if normalized in {"failed", "error"}:
            return False
    return True


def _parse_order_row(order: dict[str, Any]) -> dict[str, Any]:
    details = [row for row in _as_list(order.get("OrderDetail")) if isinstance(row, dict)]
    detail = details[0] if details else {}
    instruments = [row for row in _as_list(detail.get("Instrument")) if isinstance(row, dict)]
    instrument = instruments[0] if instruments else {}

    product = instrument.get("Product") if isinstance(instrument.get("Product"), dict) else {}
    symbol = str(product.get("symbol") or detail.get("symbol") or order.get("symbol") or "").upper()

    order_id = order.get("orderId") or detail.get("orderId")
    client_order_id = order.get("clientOrderId") or detail.get("clientOrderId")
    status = order.get("status") or detail.get("status") or ""
    action = instrument.get("orderAction") or detail.get("orderAction")

    qty = (
        _as_float(instrument.get("quantity"))
        or _as_float(detail.get("orderedQuantity"))
        or _as_float(order.get("orderedQuantity"))
        or 0.0
    )
    filled = _as_float(detail.get("filledQuantity")) or _as_float(order.get("filledQuantity")) or 0.0
    avg_fill_price = (
        _as_float(detail.get("averageExecutionPrice"))
        or _as_float(detail.get("executedPrice"))
        or _as_float(order.get("averageExecutionPrice"))
        or 0.0
    )
    remaining = max(qty - filled, 0.0)

    return {
        "order_id": str(order_id) if order_id not in {None, ""} else None,
        "client_order_id": str(client_order_id) if client_order_id not in {None, ""} else None,
        "symbol": symbol,
        "status": str(status),
        "action": str(action) if action not in {None, ""} else None,
        "qty": float(qty),
        "filled": float(filled),
        "remaining": float(remaining),
        "avg_fill_price": float(avg_fill_price),
    }


def _normalize_order_status(value: str) -> str:
    normalized = str(value or "").strip().upper()
    mapping = {
        "OPEN": "Submitted",
        "WORKING": "Submitted",
        "ACKNOWLEDGED": "Acknowledged",
        "PENDING": "PendingSubmit",
        "PENDING_SUBMIT": "PendingSubmit",
        "PENDING CANCEL": "PendingSubmit",
        "EXECUTED": "Filled",
        "FILLED": "Filled",
        "CANCELED": "Cancelled",
        "CANCELLED": "Cancelled",
        "REJECTED": "Rejected",
        "INACTIVE": "Inactive",
    }
    return mapping.get(normalized, "Submitted" if not normalized else value)


def _order_action(side: str) -> str:
    mapping = {
        "buy": "BUY",
        "sell": "SELL",
    }
    return mapping.get(side.lower(), side.upper())


def _order_term(tif: str) -> str:
    mapping = {
        "DAY": "GOOD_FOR_DAY",
        "GTC": "GOOD_UNTIL_CANCEL",
        "IOC": "IMMEDIATE_OR_CANCEL",
    }
    return mapping.get(tif.upper(), "GOOD_FOR_DAY")


def _price_type(order: OrderRequest) -> str:
    if order.limit is not None and order.stop is not None:
        return "STOP_LIMIT"
    if order.limit is not None:
        return "LIMIT"
    if order.stop is not None:
        return "STOP"
    return "MARKET"


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except Exception:
        return None


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _extract_error_message(payload: dict[str, Any]) -> str | None:
    for key in ("message", "Message", "error", "Error", "error_description"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    for value in payload.values():
        if isinstance(value, dict):
            nested = _extract_error_message(value)
            if nested:
                return nested
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    nested = _extract_error_message(item)
                    if nested:
                        return nested
                elif isinstance(item, str) and item.strip():
                    return item.strip()
    return None

