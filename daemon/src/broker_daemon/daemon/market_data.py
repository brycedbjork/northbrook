"""Market-data cache and polling helpers."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import AsyncIterator

from broker_daemon.daemon.connection import IBConnectionManager
from broker_daemon.models.market import Quote


class MarketDataService:
    def __init__(self, connection: IBConnectionManager, cache_ttl_seconds: int = 2) -> None:
        self._connection = connection
        self._cache_ttl = timedelta(seconds=cache_ttl_seconds)
        self._quotes: dict[str, Quote] = {}
        self._updated_at: dict[str, datetime] = {}

    async def quote(self, symbols: list[str], force_refresh: bool = False) -> list[Quote]:
        now = datetime.now(UTC)
        uncached: list[str] = []
        for symbol in symbols:
            sym = symbol.upper()
            cached_at = self._updated_at.get(sym)
            if force_refresh or cached_at is None or now - cached_at > self._cache_ttl:
                uncached.append(sym)

        if uncached:
            fresh = await self._connection.quote(uncached)
            for quote in fresh:
                self._quotes[quote.symbol] = quote
                self._updated_at[quote.symbol] = now

        result: list[Quote] = []
        for symbol in symbols:
            sym = symbol.upper()
            quote = self._quotes.get(sym)
            if quote is not None:
                result.append(quote)
        return result

    async def watch(self, symbol: str, fields: list[str], interval_seconds: float) -> AsyncIterator[dict[str, float | None]]:
        sym = symbol.upper()
        while True:
            quotes = await self.quote([sym], force_refresh=True)
            if quotes:
                q = quotes[0]
                yield {field: getattr(q, field, None) for field in fields}
            await asyncio.sleep(interval_seconds)
