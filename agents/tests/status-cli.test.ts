import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { cleanupFixture, makeFixture, runBunScript, type TestFixture } from "./helpers.js";

type StatusShape = {
  running: boolean;
  mode: string;
  pid: number | null;
  jobs: {
    total: number;
    scheduled: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    overdue: number;
    next_timestamp: string | null;
  };
  last_tick_at: string | null;
  last_job_id?: string | null;
};

let fixture: TestFixture;

beforeEach(async () => {
  fixture = await makeFixture("status-cli");
});

afterEach(async () => {
  await cleanupFixture(fixture);
});

describe("status-cli", () => {
  test("returns inactive status when daemon is not running", async () => {
    const result = await runBunScript("daemon/status-cli.ts", ["--json"], fixture.env);
    expect(result.code).toBe(0);
    const status = JSON.parse(result.stdout) as StatusShape;
    expect(status.running).toBe(false);
    expect(status.mode).toBe("active");
    expect(status.pid).toBeNull();
    expect(status.jobs.total).toBe(0);
  });

  test("aggregates job counters from scheduled-jobs file", async () => {
    const jobsFile = path.join(fixture.workspaceDir, "scheduled-jobs.json");
    await Bun.write(
      jobsFile,
      JSON.stringify(
        {
          version: 1,
          framework: "pi.dev",
          jobs: [
            {
              id: "job_a",
              timestamp: "2020-01-01T00:00:00Z",
              agentId: "scout",
              prompt: "a",
              status: "scheduled",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z"
            },
            {
              id: "job_b",
              timestamp: "2026-02-08T15:00:00Z",
              agentId: "planner",
              prompt: "b",
              status: "running",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z"
            },
            {
              id: "job_c",
              timestamp: "2026-02-09T15:00:00Z",
              agentId: "synthesizer",
              prompt: "c",
              status: "failed",
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z"
            }
          ]
        },
        null,
        2
      )
    );

    const result = await runBunScript("daemon/status-cli.ts", ["--json"], fixture.env);
    expect(result.code).toBe(0);
    const status = JSON.parse(result.stdout) as StatusShape;
    expect(status.jobs.total).toBe(3);
    expect(status.jobs.scheduled).toBe(1);
    expect(status.jobs.running).toBe(1);
    expect(status.jobs.failed).toBe(1);
    expect(status.jobs.overdue).toBe(1);
    expect(status.jobs.next_timestamp).toBe("2020-01-01T00:00:00.000Z");
  });

  test("reports running=true when pid file points to a live process", async () => {
    const proc = Bun.spawn({
      cmd: ["/usr/bin/env", "bash", "-lc", "sleep 30"],
      env: fixture.env,
      stdout: "ignore",
      stderr: "ignore"
    });

    try {
      const agentsHome = path.join(fixture.stateDir, "agents");
      await mkdir(agentsHome, { recursive: true });
      await Bun.write(path.join(agentsHome, "agents-daemon.pid"), `${proc.pid}\n`);
      await Bun.write(
        path.join(agentsHome, "agents-daemon.status.json"),
        JSON.stringify(
          {
            ok: true,
            running: true,
            framework: "pi.dev",
            mode: "active",
            pid: proc.pid,
            started_at: "2026-02-07T00:00:00Z",
            uptime_seconds: 10,
            workspace: fixture.workspaceDir,
            jobs_file: path.join(fixture.workspaceDir, "scheduled-jobs.json"),
            artifacts_dir: path.join(fixture.stateDir, "agents", "artifacts"),
            executions_log_file: path.join(fixture.stateDir, "agents", "scheduled-job-executions.jsonl"),
            jobs: {
              total: 0,
              scheduled: 0,
              running: 0,
              completed: 0,
              failed: 0,
              cancelled: 0,
              queued_for_pi_dev: 0,
              overdue: 0,
              next_timestamp: null
            },
            services: {
              scheduled_jobs: "active",
              heartbeats: "active",
              scheduler: "active"
            },
            last_tick_at: "2026-02-07T00:00:01Z",
            last_error: null,
            last_job_id: "job_last",
            last_job_status: "completed",
            last_job_finished_at: "2026-02-07T00:00:02Z"
          },
          null,
          2
        )
      );

      const result = await runBunScript("daemon/status-cli.ts", ["--json"], fixture.env);
      expect(result.code).toBe(0);
      const status = JSON.parse(result.stdout) as StatusShape;
      expect(status.running).toBe(true);
      expect(status.pid).toBe(proc.pid);
      expect(status.last_tick_at).toBe("2026-02-07T00:00:01Z");
      expect(status.last_job_id).toBe("job_last");
    } finally {
      proc.kill();
      await proc.exited;
    }
  });
});
