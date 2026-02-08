import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import {
  cleanupFixture,
  makeFixture,
  runShellScript,
  waitFor,
  writeExecutable,
  type TestFixture
} from "./helpers.js";

let fixture: TestFixture;

beforeEach(async () => {
  fixture = await makeFixture("service-scripts");
  await writeExecutable(
    path.join(fixture.binDir, "pi"),
    `#!/usr/bin/env bash
set -euo pipefail
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}'
echo '{"type":"turn_end","message":{"stopReason":"end_turn"}}'
`
  );
});

afterEach(async () => {
  await runShellScript("daemon/stop.sh", [], fixture.env).catch(() => undefined);
  await cleanupFixture(fixture);
});

describe("agents service scripts", () => {
  test("start/status/stop lifecycle works", async () => {
    const start = await runShellScript("daemon/start.sh", [], fixture.env);
    expect(start.code).toBe(0);

    const startJson = JSON.parse(start.stdout);
    expect(startJson.running).toBe(true);

    await waitFor(async () => {
      const status = await runShellScript("daemon/status.sh", [], fixture.env);
      if (status.code !== 0) {
        return false;
      }
      const payload = JSON.parse(status.stdout);
      return payload.running === true;
    }, 8_000);

    const stop = await runShellScript("daemon/stop.sh", [], fixture.env);
    expect(stop.code).toBe(0);
    const stopJson = JSON.parse(stop.stdout);
    expect(stopJson.running).toBe(false);
  });
});
