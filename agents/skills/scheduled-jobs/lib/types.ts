export type JobStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "queued_for_pi_dev";

export interface ScheduledJob {
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
}

export interface JobsDocument {
  version: 1;
  framework: "pi.dev";
  jobs: ScheduledJob[];
}
