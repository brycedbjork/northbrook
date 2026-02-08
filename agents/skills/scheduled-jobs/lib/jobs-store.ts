import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { paths } from "../../../daemon/lib/paths.js";
import { nowIso } from "../../../daemon/lib/time.js";
import type { JobStatus, JobsDocument, ScheduledJob } from "./types.js";

const KNOWN_JOB_STATUSES = new Set<JobStatus>([
  "scheduled",
  "running",
  "completed",
  "failed",
  "cancelled",
  "queued_for_pi_dev"
]);

function defaultDocument(): JobsDocument {
  return {
    version: 1,
    framework: "pi.dev",
    jobs: []
  };
}

export async function ensureJobsDocument(): Promise<void> {
  await mkdir(path.dirname(paths.jobsFile), { recursive: true });
  await mkdir(paths.workspaceDir, { recursive: true });

  try {
    await readFile(paths.jobsFile, "utf8");
  } catch {
    await writeJobsDocument(defaultDocument());
  }
}

export async function readJobsDocument(): Promise<JobsDocument> {
  await ensureJobsDocument();

  const raw = await readFile(paths.jobsFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<JobsDocument>;
    if (!parsed || !Array.isArray(parsed.jobs)) {
      return defaultDocument();
    }

    const jobs: ScheduledJob[] = parsed.jobs
      .filter((job): job is ScheduledJob => {
        return (
          typeof job === "object" &&
          job !== null &&
          typeof (job as ScheduledJob).id === "string" &&
          typeof (job as ScheduledJob).timestamp === "string" &&
          typeof (job as ScheduledJob).agentId === "string" &&
          typeof (job as ScheduledJob).prompt === "string"
        );
      })
      .map((job) => ({
        ...job,
        status: KNOWN_JOB_STATUSES.has(job.status) ? job.status : "scheduled",
        createdAt: job.createdAt ?? nowIso(),
        updatedAt: job.updatedAt ?? nowIso(),
        runCount: Number.isFinite(job.runCount) ? Math.max(0, Number(job.runCount)) : 0
      }))
      .sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

    return {
      version: 1,
      framework: "pi.dev",
      jobs
    };
  } catch {
    return defaultDocument();
  }
}

export async function writeJobsDocument(document: JobsDocument): Promise<void> {
  await mkdir(path.dirname(paths.jobsFile), { recursive: true });
  const sorted = [...document.jobs].sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  const normalized: JobsDocument = {
    version: 1,
    framework: "pi.dev",
    jobs: sorted
  };

  await writeFile(paths.jobsFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function makeJob(input: { timestamp: string; agentId: string; prompt: string }): ScheduledJob {
  const ts = nowIso();
  return {
    id: `job_${randomUUID().slice(0, 8)}`,
    timestamp: input.timestamp,
    agentId: input.agentId,
    prompt: input.prompt,
    status: "scheduled",
    createdAt: ts,
    updatedAt: ts
  };
}

export function findJobById(document: JobsDocument, id: string): ScheduledJob | undefined {
  return document.jobs.find((job) => job.id === id);
}
