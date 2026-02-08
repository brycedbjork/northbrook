"""Unix-socket message protocol shared by daemon, CLI, and SDK."""

from __future__ import annotations

import struct
import uuid
from typing import Any

import msgpack
from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    suggestion: str | None = None


class Request(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    command: str
    params: dict[str, Any] = Field(default_factory=dict)
    stream: bool = False
    source: str = "cli"


class Response(BaseModel):
    request_id: str
    ok: bool
    data: Any | None = None
    error: ErrorResponse | None = None


class EventEnvelope(BaseModel):
    request_id: str | None = None
    topic: str
    data: dict[str, Any]


def encode_model(model: BaseModel) -> bytes:
    return msgpack.packb(model.model_dump(mode="json"), use_bin_type=True)


def decode_request(payload: bytes) -> Request:
    return Request.model_validate(msgpack.unpackb(payload, raw=False, strict_map_key=False))


def decode_response(payload: bytes) -> Response:
    return Response.model_validate(msgpack.unpackb(payload, raw=False, strict_map_key=False))


def decode_event(payload: bytes) -> EventEnvelope:
    return EventEnvelope.model_validate(msgpack.unpackb(payload, raw=False, strict_map_key=False))


def frame_payload(payload: bytes) -> bytes:
    return struct.pack("!I", len(payload)) + payload


async def read_framed(reader: Any) -> bytes:
    header = await reader.readexactly(4)
    size = struct.unpack("!I", header)[0]
    return await reader.readexactly(size)
