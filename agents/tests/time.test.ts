import { describe, expect, test } from "bun:test";
import { formatDuration, parseWhenInput } from "../daemon/lib/time.js";

describe("time utils", () => {
  test("formatDuration renders unit buckets", () => {
    expect(formatDuration(12)).toBe("12s");
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(7_200)).toBe("2h");
    expect(formatDuration(172_800)).toBe("2d");
  });

  test("parseWhenInput parses ISO timestamps", () => {
    const parsed = parseWhenInput("2026-02-08T15:00:00Z");
    expect(parsed.toISOString()).toBe("2026-02-08T15:00:00.000Z");
  });

  test("parseWhenInput parses unix seconds and millis", () => {
    expect(parseWhenInput("1739041200").toISOString()).toBe("2025-02-08T19:00:00.000Z");
    expect(parseWhenInput("1739041200000").toISOString()).toBe("2025-02-08T19:00:00.000Z");
  });

  test("parseWhenInput parses relative durations", () => {
    const before = Date.now();
    const parsed = parseWhenInput("in 2s").getTime();
    const after = Date.now();
    expect(parsed).toBeGreaterThanOrEqual(before + 1_900);
    expect(parsed).toBeLessThanOrEqual(after + 2_100);
  });

  test("parseWhenInput throws on invalid format", () => {
    expect(() => parseWhenInput("tomorrow-ish")).toThrow("invalid timestamp format");
  });
});
