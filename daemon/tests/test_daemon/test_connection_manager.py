from __future__ import annotations

import asyncio
import builtins
import types

import pytest

from broker_daemon.config import GatewayConfig
from broker_daemon.daemon.connection import IBConnectionManager
from broker_daemon.exceptions import ErrorCode, BrokerError


class _FakeEvent:
    def __init__(self) -> None:
        self.handlers: list[object] = []

    def __iadd__(self, handler: object):  # type: ignore[override]
        self.handlers.append(handler)
        return self


class _FakeIB:
    instances: list["_FakeIB"] = []

    def __init__(self) -> None:
        self.connected = False
        self.disconnectedEvent = _FakeEvent()
        self.orderStatusEvent = _FakeEvent()
        self.execDetailsEvent = _FakeEvent()
        self.client = types.SimpleNamespace(serverVersion=lambda: 180)
        _FakeIB.instances.append(self)

    async def connectAsync(self, *_: object, **__: object) -> None:
        self.connected = True

    def isConnected(self) -> bool:
        return self.connected

    def disconnect(self) -> None:
        self.connected = False

    def managedAccounts(self) -> list[str]:
        return ["DU123456"]


@pytest.mark.asyncio
async def test_connect_registers_event_handlers_after_reconnect(monkeypatch: pytest.MonkeyPatch) -> None:
    import broker_daemon.daemon.connection as connection_mod

    _FakeIB.instances.clear()
    fake_module = types.SimpleNamespace(IB=_FakeIB)
    original_import = builtins.__import__

    def _fake_import(name: str, *args: object, **kwargs: object) -> object:
        if name == "ib_async":
            return fake_module
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _fake_import)

    manager = IBConnectionManager(GatewayConfig())
    assert await manager.connect() is True
    first = _FakeIB.instances[-1]
    assert len(first.disconnectedEvent.handlers) == 1
    assert len(first.orderStatusEvent.handlers) == 1
    assert len(first.execDetailsEvent.handlers) == 1

    await manager.stop()
    assert await manager.connect() is True
    second = _FakeIB.instances[-1]
    assert second is not first
    assert len(second.disconnectedEvent.handlers) == 1
    assert len(second.orderStatusEvent.handlers) == 1
    assert len(second.execDetailsEvent.handlers) == 1


@pytest.mark.asyncio
async def test_on_disconnected_resets_listener_flag_and_schedules_reconnect(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = IBConnectionManager(GatewayConfig())
    manager._listeners_registered = True  # noqa: SLF001

    called = asyncio.Event()

    async def _fake_loop() -> None:
        called.set()

    monkeypatch.setattr(manager, "_reconnect_loop", _fake_loop)
    manager._on_disconnected()  # noqa: SLF001

    assert manager._listeners_registered is False  # noqa: SLF001
    if manager._reconnect_task is not None:  # noqa: SLF001
        await manager._reconnect_task  # noqa: SLF001
    assert called.is_set()


@pytest.mark.asyncio
async def test_exposure_rejects_unknown_group() -> None:
    manager = IBConnectionManager(GatewayConfig())
    with pytest.raises(BrokerError) as exc:
        await manager.exposure("invalid-group")
    assert exc.value.code == ErrorCode.INVALID_ARGS
