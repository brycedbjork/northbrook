import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AGENTS_ROOT,
  cleanupFixture,
  makeFixture,
  readJson,
  runBunScript,
  waitFor,
  writeExecutable,
  type TestFixture
} from "./helpers.js";

type Job = {
  id: string;
  status: string;
  runCount?: number;
  lastError?: string;
  artifactPath?: string;
};

type JobsDoc = {
  jobs: Job[];
};

type DaemonStatus = {
  heartbeat?: {
    last_status?: "completed" | "failed" | null;
    next_timestamp?: string | null;
  };
};

let fixture: TestFixture;

beforeEach(async () => {
  fixture = await makeFixture("daemon");
  fixture.env.NB_PI_ARGS_LOG = path.join(fixture.tempRoot, "pi-args.log");
  fixture.env.NORTHBROOK_CONFIG_JSON = path.join(fixture.homeDir, "northbrook.json");
  delete fixture.env.NORTHBROOK_AI_MODEL;
  await writeFile(
    fixture.env.NORTHBROOK_CONFIG_JSON,
    `${JSON.stringify({ aiProvider: { model: "configured-model" } }, null, 2)}\n`,
    "utf8"
  );
});

afterEach(async () => {
  await cleanupFixture(fixture);
});

async function startDaemon(env: NodeJS.ProcessEnv): Promise<ReturnType<typeof Bun.spawn>> {
  const proc = Bun.spawn({
    cmd: [process.execPath, path.join(AGENTS_ROOT, "daemon/daemon.ts")],
    cwd: AGENTS_ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe"
  });

  await waitFor(async () => {
    const pidFile = path.join(fixture.stateDir, "agents", "agents-daemon.pid");
    const exists = await Bun.file(pidFile).exists();
    return exists;
  }, 8_000);

  return proc;
}

async function stopDaemon(proc: ReturnType<typeof Bun.spawn>): Promise<void> {
  proc.kill("SIGTERM");
  await Promise.race([proc.exited, Bun.sleep(5_000)]);
}

async function installMockPi(mode: "success" | "fail"): Promise<void> {
  const script = mode === "success"
    ? `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "\${NB_PI_ARGS_LOG:?}"
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"mock scheduled output"}]}}'
echo '{"type":"turn_end","message":{"stopReason":"end_turn"}}'
`
    : `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "\${NB_PI_ARGS_LOG:?}"
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"partial output"}]}}'
echo 'simulated failure' >&2
exit 12
`;

  await writeExecutable(path.join(fixture.binDir, "pi"), script);
}

describe("agents daemon", () => {
  test(
    "executes due job and persists artifacts on success",
    async () => {
    await installMockPi("success");
    const daemon = await startDaemon(fixture.env);
    try {
      const create = await runBunScript(
        "skills/scheduled-jobs/cli.ts",
        ["create", "--agent", "scout", "--in", "1s", "--prompt", "Run scheduled smoke test"],
        fixture.env
      );
      expect(create.code).toBe(0);

      const jobsFile = path.join(fixture.workspaceDir, "scheduled-jobs.json");
      await waitFor(async () => {
        try {
          const doc = await readJson<JobsDoc>(jobsFile);
          return doc.jobs.some((job) => job.status === "completed");
        } catch {
          return false;
        }
      }, 20_000);

      const doc = await readJson<JobsDoc>(jobsFile);
      const job = doc.jobs[0];
      expect(job?.status).toBe("completed");
      expect(job?.runCount).toBe(1);
      expect(job?.artifactPath).toBeTruthy();
      expect(await Bun.file(job?.artifactPath || "").exists()).toBe(true);

      const researchDir = path.join(fixture.workspaceDir, "research");
      const researchFiles = await readdir(researchDir);
      expect(researchFiles.length).toBeGreaterThan(0);

      const executionsLog = path.join(fixture.stateDir, "agents", "scheduled-job-executions.jsonl");
      const executionsRaw = await readFile(executionsLog, "utf8");
      expect(executionsRaw).toContain('"status":"completed"');

      const argsLog = await readFile(fixture.env.NB_PI_ARGS_LOG || "", "utf8");
      expect(argsLog).toContain("--session-dir");
      expect(argsLog).toContain(path.join(fixture.workspaceDir, "sessions"));
      expect(argsLog).toContain("--model configured-model");
      expect(argsLog).toContain("--skill");
      expect(argsLog).toContain(path.join("agents", "skills", "web-search", "SKILL.md"));
      expect(argsLog).toContain(path.join("agents", "skills", "public-company-filings", "SKILL.md"));

      const artifactsDir = path.join(fixture.stateDir, "agents", "artifacts");
      const artifactFiles = await readdir(artifactsDir);
      expect(artifactFiles.length).toBeGreaterThan(0);
    } finally {
      await stopDaemon(daemon);
    }
    },
    30_000
  );

  test(
    "marks job failed and persists error artifacts when pi exits non-zero",
    async () => {
    await installMockPi("fail");
    const daemon = await startDaemon(fixture.env);
    try {
      const create = await runBunScript(
        "skills/scheduled-jobs/cli.ts",
        ["create", "--agent", "scout", "--in", "1s", "--prompt", "Run failure smoke test"],
        fixture.env
      );
      expect(create.code).toBe(0);

      const jobsFile = path.join(fixture.workspaceDir, "scheduled-jobs.json");
      await waitFor(async () => {
        try {
          const doc = await readJson<JobsDoc>(jobsFile);
          return doc.jobs.some((job) => job.status === "failed");
        } catch {
          return false;
        }
      }, 20_000);

      const doc = await readJson<JobsDoc>(jobsFile);
      const job = doc.jobs[0];
      expect(job?.status).toBe("failed");
      expect(job?.lastError).toContain("simulated failure");
      expect(job?.artifactPath).toBeTruthy();
      expect(await Bun.file(job?.artifactPath || "").exists()).toBe(true);

      const executionsLog = path.join(fixture.stateDir, "agents", "scheduled-job-executions.jsonl");
      const executionsRaw = await readFile(executionsLog, "utf8");
      expect(executionsRaw).toContain('"status":"failed"');
      expect(executionsRaw).toContain('"pi_exit_code":12');

      const argsLog = await readFile(fixture.env.NB_PI_ARGS_LOG || "", "utf8");
      expect(argsLog).toContain("--session-dir");
      expect(argsLog).toContain(path.join(fixture.workspaceDir, "sessions"));
      expect(argsLog).toContain("--model configured-model");
      expect(argsLog).toContain("--skill");
      expect(argsLog).toContain(path.join("agents", "skills", "web-search", "SKILL.md"));
      expect(argsLog).toContain(path.join("agents", "skills", "public-company-filings", "SKILL.md"));
    } finally {
      await stopDaemon(daemon);
    }
    },
    30_000
  );

  test(
    "runs heartbeat loop from northbrook config on its own cadence",
    async () => {
      await installMockPi("success");
      await writeFile(
        fixture.env.NORTHBROOK_CONFIG_JSON || "",
        `${JSON.stringify(
          {
            aiProvider: { model: "configured-model" },
            heartbeat: { enabled: true, intervalMinutes: 0.01 }
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      const daemon = await startDaemon(fixture.env);
      try {
        await waitFor(async () => {
          if (!(await Bun.file(fixture.env.NB_PI_ARGS_LOG || "").exists())) {
            return false;
          }
          const argsLog = await readFile(fixture.env.NB_PI_ARGS_LOG || "", "utf8");
          return (
            argsLog.includes("Run the portfolio heartbeat review now.") &&
            argsLog.includes(path.join("agents", "skills", "web-search", "SKILL.md")) &&
            argsLog.includes(path.join("agents", "skills", "public-company-filings", "SKILL.md"))
          );
        }, 20_000);

        const statusPath = path.join(fixture.stateDir, "agents", "agents-daemon.status.json");
        const status = await readJson<DaemonStatus>(statusPath);
        expect(status.heartbeat?.last_status).toBe("completed");
        expect(Boolean(status.heartbeat?.next_timestamp)).toBe(true);

        const executionsLog = path.join(fixture.stateDir, "agents", "scheduled-job-executions.jsonl");
        const executionsRaw = await readFile(executionsLog, "utf8");
        expect(executionsRaw).toContain('"type":"heartbeat"');
      } finally {
        await stopDaemon(daemon);
      }
    },
    35_000
  );
});
