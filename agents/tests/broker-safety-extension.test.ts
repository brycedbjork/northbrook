import { afterEach, describe, expect, test } from "bun:test";
import brokerSafetyExtension from "../extensions/broker-safety/index.js";

type Handler = (
  event: { toolName?: unknown; input?: unknown },
  ctx: {
    ui?: {
      notify?: (message: string, type?: "info" | "warning" | "error") => void;
      setStatus?: (key: string, value?: string) => void;
    };
  }
) => unknown;

function setup() {
  const handlers = new Map<string, Handler>();
  const notifications: Array<{ message: string; type?: string }> = [];
  const statuses: Array<{ key: string; value?: string }> = [];

  brokerSafetyExtension({
    on(event, handler) {
      handlers.set(event, handler);
    }
  });

  const ctx = {
    ui: {
      notify(message: string, type?: "info" | "warning" | "error") {
        notifications.push({ message, type });
      },
      setStatus(key: string, value?: string) {
        statuses.push({ key, value });
      }
    }
  };

  const runSessionStart = () => {
    handlers.get("session_start")?.({}, ctx);
  };

  const runToolCall = (command: string) => {
    return handlers.get("tool_call")?.(
      {
        toolName: "bash",
        input: { command }
      },
      ctx
    );
  };

  return {
    handlers,
    notifications,
    statuses,
    runSessionStart,
    runToolCall
  };
}

const originalNow = Date.now;

afterEach(() => {
  Date.now = originalNow;
  delete process.env.NORTHBROOK_GUARD_MAX_ORDER_QTY;
});

describe("broker-safety extension", () => {
  test("sets status on session_start", () => {
    const runtime = setup();
    runtime.runSessionStart();
    expect(runtime.statuses.some((entry) => entry.key === "broker-safety")).toBe(true);
  });

  test("allows broker commands without explicit --json", () => {
    const runtime = setup();
    const result = runtime.runToolCall("broker positions");
    expect(result).toBeUndefined();
  });

  test("blocks cancel --all without --confirm", () => {
    const runtime = setup();
    const result = runtime.runToolCall("broker cancel --all");
    expect(result).toEqual({
      block: true,
      reason: "broker-safety: cancel --all requires --confirm"
    });
  });

  test("enforces risk check before order", () => {
    const runtime = setup();
    const blocked = runtime.runToolCall("broker order buy AAPL 5");
    expect(blocked).toEqual({
      block: true,
      reason: "broker-safety: missing risk check for BUY AAPL; run broker risk check first"
    });

    const risk = runtime.runToolCall("broker risk check --side buy --symbol AAPL --qty 5 --limit 180");
    expect(risk).toBeUndefined();

    const allowed = runtime.runToolCall("broker order buy AAPL 5 --limit 180");
    expect(allowed).toBeUndefined();
  });

  test("blocks stale risk checks", () => {
    let now = 1_700_000_000_000;
    Date.now = () => now;

    const runtime = setup();
    expect(runtime.runToolCall("broker risk check --side buy --symbol AAPL --qty 5 --limit 180")).toBeUndefined();

    now += 11 * 60 * 1000;
    const blocked = runtime.runToolCall("broker order buy AAPL 5");
    expect(blocked).toEqual({
      block: true,
      reason: "broker-safety: stale risk check for BUY AAPL; re-run broker risk check"
    });
  });

  test("honors max qty override env", () => {
    process.env.NORTHBROOK_GUARD_MAX_ORDER_QTY = "2";
    const runtime = setup();
    runtime.runToolCall("broker risk check --side buy --symbol AAPL --qty 5 --limit 180");
    const blocked = runtime.runToolCall("broker order buy AAPL 5");
    expect(blocked).toEqual({
      block: true,
      reason:
        "broker-safety: order qty 5 exceeds max 2; set NORTHBROOK_GUARD_MAX_ORDER_QTY to override"
    });
  });
});
