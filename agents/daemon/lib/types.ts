export interface AgentsDaemonStatus {
  ok: boolean;
  running: boolean;
  framework: "pi.dev";
  mode: "active";
  pid: number | null;
  started_at: string | null;
  uptime_seconds: number | null;
  workspace: string;
  jobs_file: string;
  artifacts_dir: string;
  executions_log_file: string;
  jobs: {
    total: number;
    scheduled: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    queued_for_pi_dev: number;
    overdue: number;
    next_timestamp: string | null;
  };
  services: {
    scheduled_jobs: "active" | "inactive";
    heartbeats: "active" | "inactive";
    scheduler: "active";
  };
  heartbeat: {
    enabled: boolean;
    interval_minutes: number;
    next_timestamp: string | null;
    last_started_at: string | null;
    last_finished_at: string | null;
    last_status: "completed" | "failed" | null;
    last_error: string | null;
  };
  last_tick_at: string | null;
  last_error: string | null;
  last_job_id: string | null;
  last_job_status: "completed" | "failed" | null;
  last_job_finished_at: string | null;
}
