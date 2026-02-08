import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type JobStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "queued_for_pi_dev";

type ScheduledJob = {
  id: string;
  timestamp: string;
  agentId: string;
  prompt: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  lastDurationMs?: number;
  lastStopReason?: string;
  lastError?: string;
  runCount?: number;
  artifactPath?: string;
};

type JobsDocument = {
  version: 1;
  framework: "pi.dev";
  jobs: ScheduledJob[];
};

type EnqueueKickoffResult = {
  jobId: string;
  jobsFile: string;
  kickoffMarkerFile: string;
};

function asNonEmptyString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveWorkspaceDir(): string {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_WORKSPACE);
  if (fromEnv) {
    return fromEnv;
  }
  const home = asNonEmptyString(process.env.NORTHBROOK_HOME) ?? path.join(homedir(), ".northbrook");
  return path.join(home, "workspace");
}

function defaultJobsDocument(): JobsDocument {
  return {
    version: 1,
    framework: "pi.dev",
    jobs: [],
  };
}

function isJobStatus(value: unknown): value is JobStatus {
  return (
    value === "scheduled" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "queued_for_pi_dev"
  );
}

function normalizeJobsDocument(value: unknown): JobsDocument {
  if (!value || typeof value !== "object") {
    return defaultJobsDocument();
  }

  const maybe = value as Partial<JobsDocument>;
  if (!Array.isArray(maybe.jobs)) {
    return defaultJobsDocument();
  }

  const jobs = maybe.jobs.filter((job): job is ScheduledJob => {
    if (!job || typeof job !== "object") {
      return false;
    }
    const candidate = job as Partial<ScheduledJob>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.timestamp === "string" &&
      typeof candidate.agentId === "string" &&
      typeof candidate.prompt === "string" &&
      typeof candidate.createdAt === "string" &&
      typeof candidate.updatedAt === "string" &&
      isJobStatus(candidate.status)
    );
  });

  return {
    version: 1,
    framework: "pi.dev",
    jobs: [...jobs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
  };
}

async function readJobsDocument(jobsFile: string): Promise<JobsDocument> {
  if (!existsSync(jobsFile)) {
    return defaultJobsDocument();
  }
  try {
    const raw = await readFile(jobsFile, "utf8");
    return normalizeJobsDocument(JSON.parse(raw));
  } catch {
    return defaultJobsDocument();
  }
}

async function writeJobsDocument(jobsFile: string, document: JobsDocument): Promise<void> {
  await mkdir(path.dirname(jobsFile), { recursive: true });
  const sorted = [...document.jobs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  await writeFile(
    jobsFile,
    `${JSON.stringify(
      {
        version: 1,
        framework: "pi.dev",
        jobs: sorted,
      } satisfies JobsDocument,
      null,
      2
    )}\n`,
    "utf8"
  );
}

export async function enqueueThesisKickoffJob(prompt: string): Promise<EnqueueKickoffResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Thesis kickoff prompt cannot be empty.");
  }

  const workspaceDir = resolveWorkspaceDir();
  const sessionsDir = path.join(workspaceDir, "sessions");
  const jobsFile = path.join(workspaceDir, "scheduled-jobs.json");

  await mkdir(workspaceDir, { recursive: true });
  await mkdir(sessionsDir, { recursive: true });

  const document = await readJobsDocument(jobsFile);
  const now = new Date().toISOString();
  const jobId = `job_${randomUUID().slice(0, 8)}`;
  document.jobs.push({
    id: jobId,
    timestamp: now,
    agentId: "portfolio-seeder",
    prompt: trimmedPrompt,
    status: "queued_for_pi_dev",
    createdAt: now,
    updatedAt: now,
    queuedAt: now,
  });

  await writeJobsDocument(jobsFile, document);

  // Marker ensures first-run kickoff happens once even if pi session persistence is disabled.
  const kickoffMarkerFile = path.join(sessionsDir, "kickoff-seeded.txt");
  await writeFile(
    kickoffMarkerFile,
    [`queued_at=${now}`, `job_id=${jobId}`, "agent_id=portfolio-seeder"].join("\n") + "\n",
    "utf8"
  );

  return { jobId, jobsFile, kickoffMarkerFile };
}
