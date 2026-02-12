from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from broker_daemon.config import ETradeConfig
from broker_daemon.exceptions import BrokerError, ErrorCode
from broker_daemon.providers.etrade import ETradeProvider
import broker_daemon.providers.etrade as etrade_mod


def _cfg(tmp_path: Path, **overrides: object) -> ETradeConfig:
    base: dict[str, object] = {
        "consumer_key": "consumer-key",
        "consumer_secret": "consumer-secret",
        "token_path": tmp_path / "etrade-tokens.json",
        "username": "alice",
        "password": "secret",
        "auto_reauth": True,
    }
    base.update(overrides)
    return ETradeConfig.model_validate(base)


@pytest.mark.asyncio
async def test_attempt_auto_reauth_updates_tokens(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    provider = ETradeProvider(_cfg(tmp_path))
    called: dict[str, object] = {}

    async def _fake_headless_reauth(**kwargs: object) -> tuple[str, str]:
        called.update(kwargs)
        return "fresh-token", "fresh-secret"

    monkeypatch.setattr(etrade_mod, "headless_reauth", _fake_headless_reauth)

    ok = await provider._attempt_auto_reauth()  # noqa: SLF001

    assert ok is True
    assert provider._oauth_token == "fresh-token"  # noqa: SLF001
    assert provider._oauth_token_secret == "fresh-secret"  # noqa: SLF001
    assert provider._token_valid is True  # noqa: SLF001
    assert provider._client is not None  # noqa: SLF001
    assert called["username"] == "alice"
    assert called["password"] == "secret"
    await provider.stop()


@pytest.mark.asyncio
async def test_attempt_auto_reauth_requires_credentials(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    provider = ETradeProvider(_cfg(tmp_path, username="", password=""))
    invoked = False

    async def _fake_headless_reauth(**_: object) -> tuple[str, str]:
        nonlocal invoked
        invoked = True
        return "unused", "unused"

    monkeypatch.setattr(etrade_mod, "headless_reauth", _fake_headless_reauth)

    ok = await provider._attempt_auto_reauth()  # noqa: SLF001

    assert ok is False
    assert invoked is False


@pytest.mark.asyncio
async def test_start_uses_auto_reauth_when_tokens_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    provider = ETradeProvider(_cfg(tmp_path))
    monkeypatch.setattr(etrade_mod, "load_etrade_tokens", lambda _path: None)

    attempts = 0

    async def _fake_attempt() -> bool:
        nonlocal attempts
        attempts += 1
        await provider._set_oauth_tokens("generated-token", "generated-secret")  # noqa: SLF001
        return True

    renew_calls: list[bool] = []

    async def _fake_renew(*, initial: bool = False) -> None:
        renew_calls.append(initial)

    async def _fake_discover() -> None:
        provider._account_id_key = "ACC123"  # noqa: SLF001

    async def _fake_log_connection(_event: str, _details: dict[str, object]) -> None:
        return None

    async def _fake_renew_loop() -> None:
        await asyncio.sleep(3600)

    monkeypatch.setattr(provider, "_attempt_auto_reauth", _fake_attempt)  # noqa: SLF001
    monkeypatch.setattr(provider, "_renew_access_token", _fake_renew)  # noqa: SLF001
    monkeypatch.setattr(provider, "_discover_account_id_key", _fake_discover)  # noqa: SLF001
    monkeypatch.setattr(provider, "_log_connection", _fake_log_connection)  # noqa: SLF001
    monkeypatch.setattr(provider, "_renew_loop", _fake_renew_loop)  # noqa: SLF001

    await provider.start()

    assert attempts == 1
    assert renew_calls == [True]
    await provider.stop()


@pytest.mark.asyncio
async def test_start_reauths_when_initial_renew_reports_auth_expired(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    provider = ETradeProvider(_cfg(tmp_path))
    monkeypatch.setattr(etrade_mod, "load_etrade_tokens", lambda _path: ("old-token", "old-secret"))

    attempts = 0

    async def _fake_attempt() -> bool:
        nonlocal attempts
        attempts += 1
        await provider._set_oauth_tokens("fresh-token", "fresh-secret")  # noqa: SLF001
        return True

    renew_attempts = 0

    async def _fake_renew(*, initial: bool = False) -> None:
        nonlocal renew_attempts
        renew_attempts += 1
        if renew_attempts == 1:
            raise BrokerError(
                ErrorCode.IB_DISCONNECTED,
                "expired",
                details={"auth_expired": True},
            )

    async def _fake_discover() -> None:
        provider._account_id_key = "ACC123"  # noqa: SLF001

    async def _fake_log_connection(_event: str, _details: dict[str, object]) -> None:
        return None

    async def _fake_renew_loop() -> None:
        await asyncio.sleep(3600)

    monkeypatch.setattr(provider, "_attempt_auto_reauth", _fake_attempt)  # noqa: SLF001
    monkeypatch.setattr(provider, "_renew_access_token", _fake_renew)  # noqa: SLF001
    monkeypatch.setattr(provider, "_discover_account_id_key", _fake_discover)  # noqa: SLF001
    monkeypatch.setattr(provider, "_log_connection", _fake_log_connection)  # noqa: SLF001
    monkeypatch.setattr(provider, "_renew_loop", _fake_renew_loop)  # noqa: SLF001

    await provider.start()

    assert attempts == 1
    assert renew_attempts == 2
    await provider.stop()


@pytest.mark.asyncio
async def test_renew_loop_attempts_auto_reauth_before_disconnect(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    provider = ETradeProvider(_cfg(tmp_path))
    monkeypatch.setattr(etrade_mod, "RENEW_INTERVAL_SECONDS", -1)
    monkeypatch.setattr(etrade_mod, "RENEW_LOOP_SLEEP_SECONDS", 0)

    async def _fake_renew(*, initial: bool = False) -> None:
        raise BrokerError(
            ErrorCode.IB_DISCONNECTED,
            "expired",
            details={"auth_expired": True},
        )

    attempts = 0

    async def _fake_attempt() -> bool:
        nonlocal attempts
        attempts += 1
        return False

    events: list[tuple[str, dict[str, object]]] = []

    async def _fake_log_connection(event: str, details: dict[str, object]) -> None:
        events.append((event, details))

    monkeypatch.setattr(provider, "_renew_access_token", _fake_renew)  # noqa: SLF001
    monkeypatch.setattr(provider, "_attempt_auto_reauth", _fake_attempt)  # noqa: SLF001
    monkeypatch.setattr(provider, "_log_connection", _fake_log_connection)  # noqa: SLF001
    monkeypatch.setattr(provider, "_should_midnight_reauth", lambda: False)  # noqa: SLF001

    await provider._renew_loop()  # noqa: SLF001

    assert attempts == 1
    assert events == [("disconnected", {"reason": "token_expired"})]
