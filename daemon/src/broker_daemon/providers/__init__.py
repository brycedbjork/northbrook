"""Broker provider abstractions and concrete implementations."""

from broker_daemon.providers.base import BrokerProvider
from broker_daemon.providers.ib import IBProvider

__all__ = ["BrokerProvider", "IBProvider", "ETradeProvider"]


def __getattr__(name: str):
    if name == "ETradeProvider":
        from broker_daemon.providers.etrade import ETradeProvider

        return ETradeProvider
    raise AttributeError(name)
