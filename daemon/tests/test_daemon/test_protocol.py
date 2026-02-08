from __future__ import annotations

import asyncio

from broker_daemon.protocol import Request, decode_request, encode_model, frame_payload


async def _roundtrip(payload: bytes) -> bytes:
    reader = asyncio.StreamReader()
    reader.feed_data(payload)
    reader.feed_eof()
    from broker_daemon.protocol import read_framed

    return await read_framed(reader)


def test_protocol_roundtrip() -> None:
    req = Request(command="quote.snapshot", params={"symbols": ["AAPL"]})
    encoded = encode_model(req)
    framed = frame_payload(encoded)

    payload = asyncio.run(_roundtrip(framed))
    out = decode_request(payload)

    assert out.command == "quote.snapshot"
    assert out.params["symbols"] == ["AAPL"]
