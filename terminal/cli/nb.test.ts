import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hasExplicitGatewayOrMode, parseRunArgs } from "./nb";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const NB_CLI_PATH = path.join(REPO_ROOT, "terminal", "cli", "nb.ts");

type CliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type Fixture = {
  rootDir: string;
  homeDir: string;
  stateDir: string;
  dataDir: string;
  logFile: string;
  env: NodeJS.ProcessEnv;
};

let fixture: Fixture;

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, "utf-8");
  await chmod(filePath, 0o755);
}

async function createFixture(): Promise<Fixture> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nb-cli-test-"));
  const rootDir = path.join(tempRoot, "fixture-root");
  const homeDir = path.join(tempRoot, "fixture-home");
  const stateBase = path.join(tempRoot, "fixture-state");
  const dataBase = path.join(tempRoot, "fixture-data");
  const stateDir = path.join(stateBase, "northbrook");
  const dataDir = path.join(dataBase, "northbrook");
  const logFile = path.join(tempRoot, "cli.log");

  await mkdir(rootDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await mkdir(stateBase, { recursive: true });
  await mkdir(dataBase, { recursive: true });
  await writeFile(logFile, "", "utf-8");

  await mkdir(path.join(rootDir, "broker", ".venv", "bin"), { recursive: true });
  await mkdir(path.join(rootDir, "agents", "daemon"), { recursive: true });
  await mkdir(path.join(rootDir, "install"), { recursive: true });
  await mkdir(path.join(rootDir, "terminal", "app"), { recursive: true });
  await mkdir(path.join(rootDir, "terminal", "thesis"), { recursive: true });

  await writeExecutable(
    path.join(rootDir, "broker", "start.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--help" ]]; then
  echo "BROKER START HELP"
  exit 0
fi
echo "broker-start:$*" >> "\${NB_TEST_LOG_FILE:?}"
`
  );

  await writeExecutable(
    path.join(rootDir, "broker", "stop.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "broker-stop:$*" >> "\${NB_TEST_LOG_FILE:?}"
`
  );

  await writeExecutable(
    path.join(rootDir, "broker", ".venv", "bin", "broker"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--json" && "\${2:-}" == "daemon" && "\${3:-}" == "status" ]]; then
  if [[ -n "\${NB_TEST_BROKER_STATUS_JSON:-}" ]]; then
    echo "\${NB_TEST_BROKER_STATUS_JSON}"
  else
    echo '{"connection":{"connected":false,"host":"127.0.0.1","port":4002},"uptime_seconds":5,"risk_halted":false}'
  fi
  exit 0
fi
if [[ "\${1:-}" == "--json" && "\${2:-}" == "daemon" && "\${3:-}" == "stop" ]]; then
  echo '{"ok":true}'
  exit 0
fi
echo '{}'
`
  );

  await writeExecutable(
    path.join(rootDir, "agents", "daemon", "start.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "agents-start" >> "\${NB_TEST_LOG_FILE:?}"
echo '{"ok":true,"running":true}'
`
  );

  await writeExecutable(
    path.join(rootDir, "agents", "daemon", "stop.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "agents-stop" >> "\${NB_TEST_LOG_FILE:?}"
echo '{"ok":true,"running":false}'
`
  );

  await writeExecutable(
    path.join(rootDir, "agents", "daemon", "status.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ -n "\${NB_TEST_AGENTS_STATUS_JSON:-}" ]]; then
  echo "\${NB_TEST_AGENTS_STATUS_JSON}"
else
  echo '{"running":false}'
fi
`
  );

  await writeExecutable(
    path.join(rootDir, "install", "main.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "install:$*" >> "\${NB_TEST_LOG_FILE:?}"
`
  );

  await writeFile(
    path.join(rootDir, "terminal", "app", "main.tsx"),
    `#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
appendFileSync(process.env.NB_TEST_LOG_FILE || "/dev/null", \`terminal:\${process.argv.slice(2).join(" ")}\\n\`);
console.log("TERMINAL_OK");
`,
    "utf-8"
  );

  await writeFile(
    path.join(rootDir, "terminal", "thesis", "main.tsx"),
    `#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
appendFileSync(process.env.NB_TEST_LOG_FILE || "/dev/null", "thesis\\n");
console.log("THESIS_OK");
`,
    "utf-8"
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NB_ROOT_DIR: rootDir,
    NORTHBROOK_HOME: homeDir,
    NORTHBROOK_CONFIG_JSON: path.join(homeDir, "northbrook.json"),
    NORTHBROOK_WORKSPACE: path.join(homeDir, "workspace"),
    NORTHBROOK_SESSIONS_DIR: path.join(homeDir, "workspace", "sessions"),
    XDG_STATE_HOME: stateBase,
    XDG_DATA_HOME: dataBase,
    NB_TEST_LOG_FILE: logFile,
    PATH: process.env.PATH || "",
  };

  return { rootDir, homeDir, stateDir, dataDir, logFile, env };
}

async function runCli(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<CliResult> {
  const proc = Bun.spawn({
    cmd: [process.execPath, NB_CLI_PATH, ...args],
    cwd: REPO_ROOT,
    env: {
      ...fixture.env,
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    code,
    stdout,
    stderr,
  };
}

async function readLogLines(): Promise<string[]> {
  const raw = await readFile(fixture.logFile, "utf-8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 2500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return;
    }
    await Bun.sleep(50);
  }
  throw new Error("timed out waiting for condition");
}

beforeEach(async () => {
  fixture = await createFixture();
});

afterEach(async () => {
  await rm(path.dirname(fixture.rootDir), { recursive: true, force: true });
});

describe("nb parsing", () => {
  test("parseRunArgs routes daemon and terminal arguments", () => {
    const parsed = parseRunArgs([
      "--paper",
      "--gateway",
      "127.0.0.1:4002",
      "--screen=positions",
      "notes.md",
      "--ib-wait=7",
    ]);

    expect(parsed.daemonArgs).toEqual([
      "--paper",
      "--gateway",
      "127.0.0.1:4002",
      "--ib-wait=7",
    ]);
    expect(parsed.terminalArgs).toEqual(["--screen=positions", "notes.md"]);
    expect(parsed.hasIbWait).toBe(true);
    expect(parsed.daemonHelpRequested).toBe(false);
  });

  test("parseRunArgs throws on missing daemon option value", () => {
    expect(() => parseRunArgs(["--gateway"])).toThrow("Missing value for --gateway.");
    expect(() => parseRunArgs(["--ib-app-path"])).toThrow("Missing value for --ib-app-path.");
    expect(() => parseRunArgs(["--ib-wait"])).toThrow("Missing value for --ib-wait.");
  });

  test("hasExplicitGatewayOrMode detects explicit mode/gateway", () => {
    expect(hasExplicitGatewayOrMode(["--paper"])).toBe(true);
    expect(hasExplicitGatewayOrMode(["--live"])).toBe(true);
    expect(hasExplicitGatewayOrMode(["--gateway", "127.0.0.1:4002"])).toBe(true);
    expect(hasExplicitGatewayOrMode(["--gateway=127.0.0.1:4002"])).toBe(true);
    expect(hasExplicitGatewayOrMode(["--screen=positions"])).toBe(false);
  });
});

describe("nb integration", () => {
  test("--help shows command surface and excludes jobs", async () => {
    const result = await runCli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: nb");
    expect(result.stdout).toContain("run [args...]");
    expect(result.stdout).toContain("reset [options]");
    expect(result.stdout).not.toContain("\n  jobs ");
    expect(result.stdout).not.toContain("\n  jobs[");
  });

  test("unknown command returns error", async () => {
    const result = await runCli(["jobs"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown command 'jobs'");
  });

  test("setup delegates to installer with onboarding-only", async () => {
    const result = await runCli(["setup", "--provider", "openai"]);
    expect(result.code).toBe(0);
    const lines = await readLogLines();
    expect(lines).toContain("install:--onboarding-only --provider openai");
  });

  test("start uses default paper mode and starts agents after broker", async () => {
    const result = await runCli(["start"]);
    expect(result.code).toBe(0);
    const lines = await readLogLines();
    expect(lines[0]).toBe("broker-start:--paper");
    expect(lines[1]).toBe("agents-start");
  });

  test("restart stops then starts services in expected order", async () => {
    const result = await runCli(["restart", "--live"]);
    expect(result.code).toBe(0);
    const lines = await readLogLines();
    expect(lines[0]).toBe("agents-stop");
    expect(lines[1]).toBe("broker-stop:");
    expect(lines[2]).toBe("broker-start:--live");
    expect(lines[3]).toBe("agents-start");
  });

  test("stop stops agents before broker", async () => {
    const result = await runCli(["stop"]);
    expect(result.code).toBe(0);
    const lines = await readLogLines();
    expect(lines[0]).toBe("agents-stop");
    expect(lines[1]).toBe("broker-stop:");
  });

  test("run --daemon-help proxies broker start help and exits", async () => {
    const result = await runCli(["run", "--daemon-help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("BROKER START HELP");
    const lines = await readLogLines();
    expect(lines.length).toBe(0);
  });

  test("run launches terminal and background bootstrap", async () => {
    const result = await runCli(["run", "--screen=positions", "--paper"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("THESIS_OK");
    expect(result.stdout).toContain("TERMINAL_OK");

    await waitFor(async () => {
      const lines = await readLogLines();
      return lines.includes("agents-start");
    });

    const lines = await readLogLines();
    expect(lines[0]).toBe("broker-start:--paper --ib-wait=0");
    expect(lines[1]).toBe("agents-start");
    expect(lines[2]).toBe("thesis");
    expect(lines.some((line) => line.startsWith("terminal:--screen=positions"))).toBe(true);

    const logsDir = path.join(fixture.stateDir, "logs");
    const files = await readdir(logsDir);
    const stateFileName = files.find((name) => name.endsWith(".state"));
    expect(stateFileName).toBeDefined();
    const stateFile = path.join(logsDir, stateFileName ?? "");

    await waitFor(async () => (await readFile(stateFile, "utf-8")).trim() === "ok");
  });

  test("top-level mode flag routes to terminal run path", async () => {
    const result = await runCli(["--paper", "--screen=research"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("THESIS_OK");
    expect(result.stdout).toContain("TERMINAL_OK");

    await waitFor(async () => {
      const lines = await readLogLines();
      return lines.some((line) => line.startsWith("broker-start:--paper"));
    });

    const lines = await readLogLines();
    expect(lines[0]).toBe("broker-start:--paper --ib-wait=0");
    expect(lines[1]).toBe("agents-start");
    expect(lines[2]).toBe("thesis");
    expect(lines.some((line) => line.startsWith("terminal:--screen=research"))).toBe(true);
  });

  test("run skips thesis kickoff when sessions already exist", async () => {
    const sessionsDir = path.join(fixture.homeDir, "workspace", "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(path.join(sessionsDir, "existing-session.json"), "{}\n", "utf-8");

    const result = await runCli(["run"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("TERMINAL_OK");
    expect(result.stdout).not.toContain("THESIS_OK");

    await waitFor(async () => {
      const lines = await readLogLines();
      return lines.includes("agents-start");
    });

    const lines = await readLogLines();
    expect(lines.some((line) => line === "thesis")).toBe(false);
    expect(lines.some((line) => line.startsWith("terminal:"))).toBe(true);
  });

  test("status renders broker/agents/config snapshot", async () => {
    const configPath = path.join(fixture.homeDir, "northbrook.json");
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          aiProvider: { provider: "openai", apiKey: "secret", model: "gpt-5" },
          skills: { xApi: { apiKey: "x-key" }, braveSearchApi: { apiKey: "" } },
          sec: {
            appName: "Northbrook",
            name: "Jane",
            email: "jane@example.com",
            company: "Acme",
            userAgent: "Northbrook/1.0 (Jane, Acme, jane@example.com)",
          },
          ibkrGatewayMode: "live",
          ibkrUsername: "demo",
          ibkrPassword: "demo-pass",
          ibkrAutoLogin: true,
        },
        null,
        2
      )}\n`,
      "utf-8"
    );

    const brokerStatusJson =
      '{"connection":{"connected":true,"host":"127.0.0.1","port":4001},"uptime_seconds":42,"risk_halted":false}';
    const agentsStatusJson =
      '{"running":true,"jobs":{"scheduled":3,"queued_for_pi_dev":1},"uptime_seconds":21,"framework":"pi.dev","mode":"stub"}';

    const result = await runCli(["status"], {
      NB_TEST_BROKER_STATUS_JSON: brokerStatusJson,
      NB_TEST_AGENTS_STATUS_JSON: agentsStatusJson,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Northbrook Platform Status");
    expect(result.stdout).toContain("Gateway        connected (127.0.0.1:4001)");
    expect(result.stdout).toContain("Agents daemon  running");
    expect(result.stdout).toContain("jobs: scheduled=3 queued_for_pi_dev=1");
    expect(result.stdout).toContain("AI provider : openai");
    expect(result.stdout).toContain("IB mode     : live");
    expect(result.stdout).toContain("aiProvider.apiKey: yes");
    expect(result.stdout).toContain("skills.xApi: yes");
    expect(result.stdout).toContain("skills.braveSearchApi: no");
    expect(result.stdout).toContain("sec.userAgent: yes");
  });

  test("reset --yes recreates northbrook defaults", async () => {
    await mkdir(path.join(fixture.homeDir, "workspace"), { recursive: true });
    await writeFile(path.join(fixture.homeDir, "workspace", "old.txt"), "old", "utf-8");
    await writeFile(path.join(fixture.homeDir, "northbrook.json"), '{"foo":"bar"}\n', "utf-8");

    const result = await runCli(["reset", "--yes"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Reset complete.");

    const riskPath = path.join(fixture.homeDir, "workspace", "risk.json");
    const readmePath = path.join(fixture.homeDir, "workspace", "README.md");
    const cfgPath = path.join(fixture.homeDir, "northbrook.json");

    expect((await stat(riskPath)).isFile()).toBe(true);
    expect((await stat(readmePath)).isFile()).toBe(true);
    expect((await stat(cfgPath)).isFile()).toBe(true);

    const cfg = JSON.parse(await readFile(cfgPath, "utf-8")) as Record<string, unknown>;
    expect(cfg.ibkrGatewayMode).toBe("paper");
    expect(cfg.ibkrAutoLogin).toBe(false);
    expect(cfg.sec).toBeTruthy();
  });
});
