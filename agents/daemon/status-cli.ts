#!/usr/bin/env bun

import { readFile } from "node:fs/promises";

import { readJobsDocument } from "../skills/scheduled-jobs/lib/jobs-store.js";
import { paths } from "./lib/paths.js";
import { formatDuration } from "./lib/time.js";
import type { AgentsDaemonStatus } from "./lib/types.js";

function isPidRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(): Promise<number | null> {
  try {
    const raw = await readFile(paths.pidFile, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    if (Number.isInteger(pid) && pid > 0) {
      return pid;
    }
    return null;
  } catch {
    return null;
  }
}

function defaultStatus(): AgentsDaemonStatus {
  return {
    ok: true,
    running: false,
    framework: "pi.dev",
    mode: "active",
    pid: null,
    started_at: null,
    uptime_seconds: null,
    workspace: paths.workspaceDir,
    jobs_file: paths.jobsFile,
    artifacts_dir: paths.artifactsDir,
    executions_log_file: paths.executionsLogFile,
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
      scheduled_jobs: "inactive",
      heartbeats: "inactive",
      scheduler: "active"
    },
    heartbeat: {
      enabled: true,
      interval_minutes: 30,
      next_timestamp: null,
      last_started_at: null,
      last_finished_at: null,
      last_status: null,
      last_error: null
    },
    last_tick_at: null,
    last_error: null,
    last_job_id: null,
    last_job_status: null,
    last_job_finished_at: null
  };
}

async function readStatusFile(): Promise<AgentsDaemonStatus | null> {
  try {
    const raw = await readFile(paths.statusFile, "utf8");
    return JSON.parse(raw) as AgentsDaemonStatus;
  } catch {
    return null;
  }
}

function countJobs(status: Awaited<ReturnType<typeof readJobsDocument>>): AgentsDaemonStatus["jobs"] {
  const now = Date.now();
  const scheduled = status.jobs.filter((job) => job.status === "scheduled");
  const running = status.jobs.filter((job) => job.status === "running");
  const completed = status.jobs.filter((job) => job.status === "completed");
  const failed = status.jobs.filter((job) => job.status === "failed");
  const cancelled = status.jobs.filter((job) => job.status === "cancelled");
  const queued = status.jobs.filter((job) => job.status === "queued_for_pi_dev");
  const overdue = scheduled.filter((job) => new Date(job.timestamp).getTime() <= now);
  const next = scheduled
    .map((job) => new Date(job.timestamp).getTime())
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b)[0];

  return {
    total: status.jobs.length,
    scheduled: scheduled.length,
    running: running.length,
    completed: completed.length,
    failed: failed.length,
    cancelled: cancelled.length,
    queued_for_pi_dev: queued.length,
    overdue: overdue.length,
    next_timestamp: Number.isFinite(next) ? new Date(next).toISOString() : null
  };
}

function printHuman(status: AgentsDaemonStatus): void {
  const state = status.running ? "RUNNING" : "STOPPED";
  const uptime = status.uptime_seconds ? formatDuration(status.uptime_seconds) : "-";
  const nextRun = status.jobs.next_timestamp ?? "-";

  console.log("agents daemon status");
  console.log("====================");
  console.log(`state: ${state}`);
  console.log(`framework: ${status.framework} (${status.mode})`);
  console.log(`pid: ${status.pid ?? "-"}`);
  console.log(`uptime: ${uptime}`);
  console.log(
    `jobs: total=${status.jobs.total} scheduled=${status.jobs.scheduled} running=${status.jobs.running} completed=${status.jobs.completed} failed=${status.jobs.failed} cancelled=${status.jobs.cancelled}`
  );
  console.log(`next job: ${nextRun}`);
  if (status.last_job_id) {
    console.log(
      `last job: ${status.last_job_id} (${status.last_job_status ?? "unknown"}) at ${status.last_job_finished_at ?? "-"}`
    );
  }
  if (status.last_error) {
    console.log(`last error: ${status.last_error}`);
  }
  console.log(`workspace: ${status.workspace}`);
}

async function main(): Promise<void> {
  const jsonMode = process.argv.includes("--json");
  const pid = await readPid();
  const running = pid !== null && isPidRunning(pid);

  const jobs = countJobs(await readJobsDocument());
  const fromFile = await readStatusFile();
  const base = fromFile ?? defaultStatus();
  const status: AgentsDaemonStatus = running
    ? {
        ...base,
        framework: "pi.dev",
        mode: "active",
        running: true,
        pid,
        workspace: paths.workspaceDir,
        jobs_file: paths.jobsFile,
        artifacts_dir: paths.artifactsDir,
        executions_log_file: paths.executionsLogFile,
        jobs,
        last_job_id: base.last_job_id ?? null,
        last_job_status: base.last_job_status ?? null,
        last_job_finished_at: base.last_job_finished_at ?? null,
        heartbeat: base.heartbeat ?? defaultStatus().heartbeat
      }
    : {
        ...base,
        framework: "pi.dev",
        mode: "active",
        running: false,
        pid: null,
        started_at: null,
        uptime_seconds: null,
        workspace: paths.workspaceDir,
        jobs_file: paths.jobsFile,
        artifacts_dir: paths.artifactsDir,
        executions_log_file: paths.executionsLogFile,
        jobs,
        last_job_id: base.last_job_id ?? null,
        last_job_status: base.last_job_status ?? null,
        last_job_finished_at: base.last_job_finished_at ?? null,
        services: {
          scheduled_jobs: "inactive",
          heartbeats: "inactive",
          scheduler: "active"
        },
        heartbeat: base.heartbeat ?? defaultStatus().heartbeat
      };

  if (jsonMode) {
    console.log(JSON.stringify(status));
    return;
  }

  printHuman(status);
}

await main();
