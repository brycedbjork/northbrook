import crypto from "node:crypto";
import net from "node:net";
import { decode, encode } from "@msgpack/msgpack";

import { BrokerError, ErrorCode, asErrorCode } from "./errors.js";
import type {
  EventEnvelope,
  JsonValue,
  RequestEnvelope,
  RequestParams,
  ResponseEnvelope
} from "./types.js";

export function makeRequest(command: string, params: RequestParams = {}, stream = false, source = "ts"): RequestEnvelope {
  return {
    request_id: crypto.randomUUID(),
    command,
    params,
    stream,
    source
  };
}

export function framePayload(payload: Uint8Array): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.byteLength, 0);
  return Buffer.concat([header, Buffer.from(payload)]);
}

export function encodeRequest(req: RequestEnvelope): Buffer {
  const payload = encode(req);
  return framePayload(payload);
}

function parseResponseEnvelope(value: unknown): ResponseEnvelope {
  if (!value || typeof value !== "object") {
    throw new BrokerError(ErrorCode.INTERNAL_ERROR, "invalid response payload");
  }
  const obj = value as Record<string, unknown>;
  return {
    request_id: String(obj.request_id ?? ""),
    ok: Boolean(obj.ok),
    data: obj.data as JsonValue,
    error: obj.error as ResponseEnvelope["error"]
  };
}

function parseEventEnvelope(value: unknown): EventEnvelope {
  if (!value || typeof value !== "object") {
    throw new BrokerError(ErrorCode.INTERNAL_ERROR, "invalid event payload");
  }
  const obj = value as Record<string, unknown>;
  return {
    request_id: obj.request_id ? String(obj.request_id) : undefined,
    topic: String(obj.topic ?? ""),
    data: (obj.data as Record<string, JsonValue>) ?? {}
  };
}

export function decodeResponse(payload: Buffer): ResponseEnvelope {
  return parseResponseEnvelope(decode(payload));
}

export function decodeEvent(payload: Buffer): EventEnvelope {
  return parseEventEnvelope(decode(payload));
}

export function unwrapResponse<T>(response: ResponseEnvelope): T {
  if (response.ok) {
    return (response.data ?? null) as T;
  }

  const error = response.error;
  if (!error) {
    throw new BrokerError(ErrorCode.INTERNAL_ERROR, "daemon returned malformed error response");
  }

  throw new BrokerError(
    asErrorCode(error.code),
    error.message,
    error.details ?? {},
    error.suggestion ?? undefined
  );
}

export class FramedReader {
  private buffer: Buffer = Buffer.alloc(0);
  private frames: Buffer[] = [];
  private ended = false;
  private pendingResolve: ((frame: Buffer) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  constructor(private readonly socket: net.Socket) {
    this.socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drainFrames();
    });

    this.socket.on("end", () => {
      this.ended = true;
      this.flushPendingError(new Error("socket ended"));
    });

    this.socket.on("close", () => {
      this.ended = true;
      this.flushPendingError(new Error("socket closed"));
    });

    this.socket.on("error", (error) => {
      this.ended = true;
      this.flushPendingError(error);
    });
  }

  async nextFrame(timeoutMs?: number): Promise<Buffer> {
    if (this.frames.length > 0) {
      return this.frames.shift() as Buffer;
    }

    if (this.ended) {
      throw new BrokerError(
        ErrorCode.DAEMON_NOT_RUNNING,
        "daemon socket closed unexpectedly",
        {},
        "Check daemon health with `broker daemon status` and restart with `broker daemon start` if needed."
      );
    }

    return new Promise<Buffer>((resolve, reject) => {
      const wrappedResolve = (frame: Buffer) => {
        clearTimeout(timer);
        resolve(frame);
      };
      const wrappedReject = (error: Error) => {
        clearTimeout(timer);
        reject(error);
      };

      this.pendingResolve = wrappedResolve;
      this.pendingReject = wrappedReject;

      const timer = timeoutMs
        ? setTimeout(() => {
            if (this.pendingReject) {
              const rej = this.pendingReject;
              this.pendingResolve = null;
              this.pendingReject = null;
              rej(
                new BrokerError(
                  ErrorCode.TIMEOUT,
                  "request timed out waiting for daemon response",
                  { timeout_ms: timeoutMs },
                  "Retry or increase runtime.request_timeout_seconds in config."
                )
              );
            }
          }, timeoutMs)
        : undefined;

      this.drainFrames();
    });
  }

  private drainFrames(): void {
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32BE(0);
      if (this.buffer.length < size + 4) {
        break;
      }
      const frame = this.buffer.subarray(4, size + 4);
      this.buffer = this.buffer.subarray(size + 4);
      this.frames.push(frame);
    }

    if (this.frames.length > 0 && this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingReject = null;
      resolve(this.frames.shift() as Buffer);
    }
  }

  private flushPendingError(error: Error): void {
    if (this.pendingReject) {
      const reject = this.pendingReject;
      this.pendingResolve = null;
      this.pendingReject = null;
      reject(error);
    }
  }
}
