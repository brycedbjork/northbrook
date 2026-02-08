#!/usr/bin/env bun

import { spawn } from "node:child_process";
import {
  appendFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

import { findJobById, readJobsDocument, writeJobsDocument } from "../skills/scheduled-jobs/lib/jobs-store.js";
import type { ScheduledJob } from "../skills/scheduled-jobs/lib/types.js";
import { paths } from "./lib/paths.js";
import { nowIso } from "./lib/time.js";
import type { AgentsDaemonStatus } from "./lib/types.js";

const TICK_INTERVAL_MS = 5_000;
const DEFAULT_HEARTBEAT_INTERVAL_MINUTES = 30;

type AgentTemplate = {
  name: string;
  tools?: string[];
  systemPrompt?: string;
  sourcePath: string;
};

type NorthbrookConfig = {
  aiProvider?: {
    model?: unknown;
  };
  heartbeat?: {
    enabled?: unknown;
    intervalMinutes?: unknown;
  };
};

type HeartbeatRuntimeConfig = {
  enabled: boolean;
  intervalMs: number;
  intervalMinutes: number;
};

type PiExecutionResult = {
  ok: boolean;
  output: string;
  error?: string;
  stopReason?: string;
  durationMs: number;
  exitCode: number;
};

const startedAt = new Date();
let lastTickAt: string | null = null;
let lastError: string | null = null;
let lastJobId: string | null = null;
let lastJobStatus: "completed" | "failed" | null = null;
let lastJobFinishedAt: string | null = null;
let lastHeartbeatStartedAt: string | null = null;
let lastHeartbeatFinishedAt: string | null = null;
let lastHeartbeatStatus: "completed" | "failed" | null = null;
let lastHeartbeatError: string | null = null;
let nextHeartbeatAtMs: number | null = null;
let appliedHeartbeatIntervalMs: number | null = null;
let timer: NodeJS.Timeout | null = null;
let tickInFlight = false;

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveNorthbrookConfigPath(): string {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_CONFIG_JSON);
  if (fromEnv) {
    return fromEnv;
  }

  const home = asNonEmptyString(process.env.NORTHBROOK_HOME) ?? path.join(os.homedir(), ".northbrook");
  return path.join(home, "northbrook.json");
}

function readNorthbrookConfig(): NorthbrookConfig | null {
  const configPath = resolveNorthbrookConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as NorthbrookConfig;
    }
  } catch {
    // ignore malformed config and fall back to defaults
  }

  return null;
}

function resolveConfiguredModel(): string | null {
  const parsed = readNorthbrookConfig();
  const model = parsed?.aiProvider?.model;
  const configuredModel = asNonEmptyString(model);
  if (configuredModel) {
    return configuredModel;
  }

  return asNonEmptyString(process.env.NORTHBROOK_AI_MODEL);
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function resolveHeartbeatRuntimeConfig(): HeartbeatRuntimeConfig {
  const parsed = readNorthbrookConfig();
  const heartbeat = parsed?.heartbeat;

  const enabled = typeof heartbeat?.enabled === "boolean" ? heartbeat.enabled : true;
  const intervalMinutes = asPositiveNumber(heartbeat?.intervalMinutes) ?? DEFAULT_HEARTBEAT_INTERVAL_MINUTES;

  return {
    enabled,
    intervalMinutes,
    intervalMs: Math.max(1_000, Math.round(intervalMinutes * 60_000))
  };
}

function resolveSystemPromptPath(): string | null {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_SYSTEM_PROMPT);
  if (fromEnv) {
    return existsSync(fromEnv) ? fromEnv : null;
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "SYSTEM.md"),
    path.resolve(cwd, "agents", "SYSTEM.md"),
    path.resolve(cwd, "..", "agents", "SYSTEM.md")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveHeartbeatPromptPath(): string | null {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_HEARTBEAT_PROMPT);
  if (fromEnv) {
    return existsSync(fromEnv) ? fromEnv : null;
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "HEARTBEAT.md"),
    path.resolve(cwd, "agents", "HEARTBEAT.md"),
    path.resolve(cwd, "..", "agents", "HEARTBEAT.md")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

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

async function readPidFile(): Promise<number | null> {
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

function countJobs(doc: Awaited<ReturnType<typeof readJobsDocument>>): AgentsDaemonStatus["jobs"] {
  const now = Date.now();
  const scheduled = doc.jobs.filter((job) => job.status === "scheduled");
  const running = doc.jobs.filter((job) => job.status === "running");
  const completed = doc.jobs.filter((job) => job.status === "completed");
  const failed = doc.jobs.filter((job) => job.status === "failed");
  const cancelled = doc.jobs.filter((job) => job.status === "cancelled");
  const queued = doc.jobs.filter((job) => job.status === "queued_for_pi_dev");
  const overdue = scheduled.filter((job) => new Date(job.timestamp).getTime() <= now);
  const next = scheduled
    .map((job) => new Date(job.timestamp).getTime())
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b)[0];

  return {
    total: doc.jobs.length,
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

async function buildStatus(running: boolean): Promise<AgentsDaemonStatus> {
  const jobsDoc = await readJobsDocument();
  const pid = running ? process.pid : null;
  const heartbeatConfig = resolveHeartbeatRuntimeConfig();
  const nextHeartbeatTimestamp =
    heartbeatConfig.enabled && nextHeartbeatAtMs !== null ? new Date(nextHeartbeatAtMs).toISOString() : null;

  return {
    ok: true,
    running,
    framework: "pi.dev",
    mode: "active",
    pid,
    started_at: running ? startedAt.toISOString() : null,
    uptime_seconds: running ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : null,
    workspace: paths.workspaceDir,
    jobs_file: paths.jobsFile,
    artifacts_dir: paths.artifactsDir,
    executions_log_file: paths.executionsLogFile,
    jobs: countJobs(jobsDoc),
    services: {
      scheduled_jobs: running ? "active" : "inactive",
      heartbeats: running && heartbeatConfig.enabled ? "active" : "inactive",
      scheduler: "active"
    },
    heartbeat: {
      enabled: heartbeatConfig.enabled,
      interval_minutes: heartbeatConfig.intervalMinutes,
      next_timestamp: nextHeartbeatTimestamp,
      last_started_at: lastHeartbeatStartedAt,
      last_finished_at: lastHeartbeatFinishedAt,
      last_status: lastHeartbeatStatus,
      last_error: lastHeartbeatError
    },
    last_tick_at: lastTickAt,
    last_error: lastError,
    last_job_id: lastJobId,
    last_job_status: lastJobStatus,
    last_job_finished_at: lastJobFinishedAt
  };
}

async function writeStatus(running: boolean): Promise<void> {
  const status = await buildStatus(running);
  await mkdir(path.dirname(paths.statusFile), { recursive: true });
  await writeFile(paths.statusFile, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

function trimOuterQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  if (!raw.startsWith("---\n")) {
    return { fields: {}, body: raw.trim() };
  }

  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return { fields: {}, body: raw.trim() };
  }

  const fm = raw.slice(4, end).trim();
  const body = raw.slice(end + 5).trim();
  const fields: Record<string, string> = {};

  for (const line of fm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = trimOuterQuotes(line.slice(idx + 1).trim());
    if (key && value) {
      fields[key] = value;
    }
  }

  return { fields, body };
}

async function walkFiles(rootDir: string): Promise<string[]> {
  if (!existsSync(rootDir)) {
    return [];
  }

  const pending = [rootDir];
  const files: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true, encoding: "utf8" }).catch(() => []);

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function loadSkillPaths(): Promise<string[]> {
  const allFiles = await walkFiles(paths.skillsDir);
  return allFiles.filter((fullPath) => path.basename(fullPath) === "SKILL.md").sort();
}

async function loadAgentTemplates(): Promise<Map<string, AgentTemplate>> {
  const allFiles = await walkFiles(paths.subagentsDir);
  const templates = new Map<string, AgentTemplate>();

  for (const fullPath of allFiles) {
    if (!fullPath.endsWith(".agent.md")) {
      continue;
    }

    let raw = "";
    try {
      raw = await readFile(fullPath, "utf8");
    } catch {
      continue;
    }

    const parsed = parseFrontmatter(raw);
    const name = parsed.fields.name || path.basename(fullPath, ".agent.md");
    if (!name) {
      continue;
    }

    const tools = parsed.fields.tools
      ? parsed.fields.tools
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : undefined;

    templates.set(name, {
      name,
      tools,
      systemPrompt: parsed.body || undefined,
      sourcePath: fullPath
    });
  }

  return templates;
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const maybeRole = (message as { role?: unknown }).role;
  if (maybeRole !== "assistant") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    if ((block as { type?: unknown }).type !== "text") {
      continue;
    }
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) {
      chunks.push(text.trim());
    }
  }
  return chunks.join("\n").trim();
}

type PiPromptExecutionInput = {
  prompt: string;
  promptLabel: string;
  tools?: string[];
  systemPrompt?: string;
};

async function executePromptWithPi(input: PiPromptExecutionInput): Promise<PiExecutionResult> {
  const startedMs = Date.now();
  const args = ["--mode", "json", "-p", "--session-dir", paths.sessionsDir];

  const model = resolveConfiguredModel();
  if (model) {
    args.push("--model", model);
  }
  for (const skillPath of await loadSkillPaths()) {
    args.push("--skill", skillPath);
  }
  if (input.tools && input.tools.length > 0) {
    args.push("--tools", input.tools.join(","));
  }

  let tempDir: string | null = null;
  if (input.systemPrompt && input.systemPrompt.trim().length > 0) {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "northbrook-scheduled-job-"));
    const promptPath = path.join(tempDir, `${input.promptLabel.replace(/[^a-zA-Z0-9._-]/g, "_")}.md`);
    await writeFile(promptPath, input.systemPrompt, { encoding: "utf8", mode: 0o600 });
    args.push("--append-system-prompt", promptPath);
  }

  args.push(input.prompt);

  let stdoutText = "";
  let stopReason: string | undefined;
  let stderr = "";
  let exitCode = 1;

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("pi", args, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NORTHBROOK_SESSIONS_DIR: paths.sessionsDir
        }
      });

      const stdoutReader = createInterface({ input: proc.stdout });
      stdoutReader.on("line", (line) => {
        if (!line.trim()) {
          return;
        }
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        if (event.type === "message_end") {
          const text = extractAssistantText(event.message);
          if (text) {
            stdoutText = text;
          }
        }

        if (event.type === "turn_end" && event.message && typeof event.message === "object") {
          const sr = (event.message as { stopReason?: unknown }).stopReason;
          if (typeof sr === "string" && sr.trim()) {
            stopReason = sr;
          }
        }
      });

      const stderrReader = createInterface({ input: proc.stderr });
      stderrReader.on("line", (line) => {
        if (line.trim()) {
          stderr += `${line}\n`;
        }
      });

      proc.on("error", (error) => {
        reject(error);
      });

      proc.on("close", (code) => {
        exitCode = Number.isInteger(code) ? Number(code) : 1;
        if (exitCode === 0) {
          resolve();
        } else {
          reject(new Error(stderr.trim() || `pi exited with code ${exitCode}`));
        }
      });
    });

    return {
      ok: true,
      output: stdoutText,
      stopReason,
      durationMs: Date.now() - startedMs,
      exitCode
    };
  } catch (error) {
    return {
      ok: false,
      output: stdoutText,
      error: error instanceof Error ? error.message : String(error),
      stopReason,
      durationMs: Date.now() - startedMs,
      exitCode
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function executeWithPi(job: ScheduledJob, template: AgentTemplate | null): Promise<PiExecutionResult> {
  return executePromptWithPi({
    prompt: job.prompt,
    promptLabel: template?.name ?? job.agentId,
    tools: template?.tools,
    systemPrompt: template?.systemPrompt
  });
}

function sanitizeSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "job";
}

async function reserveFilePath(dir: string, base: string, ext: string): Promise<string> {
  let candidate = path.join(dir, `${base}${ext}`);
  let suffix = 1;
  while (existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${suffix}${ext}`);
    suffix += 1;
  }
  return candidate;
}

function yamlQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function persistJobArtifacts(input: {
  job: ScheduledJob;
  template: AgentTemplate | null;
  startedAt: string;
  finishedAt: string;
  run: PiExecutionResult;
}): Promise<{ markdownPath: string; recordPath: string }> {
  const { job, template, startedAt, finishedAt, run } = input;
  await mkdir(paths.researchDir, { recursive: true });
  await mkdir(paths.artifactsDir, { recursive: true });

  const base = `${finishedAt.slice(0, 10).replaceAll("-", "")}-${sanitizeSlug(job.id)}`;
  const markdownPath = await reserveFilePath(paths.researchDir, base, ".md");
  const recordPath = await reserveFilePath(paths.artifactsDir, base, ".json");

  const markdown = [
    "---",
    `title: ${yamlQuote(`Scheduled job ${job.id} (${job.agentId})`)}`,
    `completed_at: ${finishedAt}`,
    "tags:",
    "  - scheduled-job",
    `  - agent:${sanitizeSlug(job.agentId)}`,
    `job_id: ${job.id}`,
    `agent_id: ${job.agentId}`,
    `scheduled_for: ${job.timestamp}`,
    `status: ${run.ok ? "completed" : "failed"}`,
    `duration_ms: ${Math.max(0, Math.round(run.durationMs))}`,
    ...(run.stopReason ? [`stop_reason: ${yamlQuote(run.stopReason)}`] : []),
    "---",
    "",
    "## Prompt",
    "",
    job.prompt,
    "",
    "## Output",
    "",
    run.ok ? run.output || "(no assistant output)" : run.output || "(no assistant output before failure)",
    ...(run.error ? ["", "## Error", "", run.error] : []),
    "",
    "## Metadata",
    "",
    `- job id: ${job.id}`,
    `- agent id: ${job.agentId}`,
    `- template: ${template?.sourcePath ?? "none"}`,
    `- started at: ${startedAt}`,
    `- finished at: ${finishedAt}`,
    `- duration ms: ${Math.max(0, Math.round(run.durationMs))}`,
    ...(run.stopReason ? [`- stop reason: ${run.stopReason}`] : []),
    `- pi exit code: ${run.exitCode}`
  ].join("\n");

  const record = {
    framework: "pi.dev",
    mode: "active",
    job_id: job.id,
    status: run.ok ? "completed" : "failed",
    agent_id: job.agentId,
    template_path: template?.sourcePath ?? null,
    prompt: job.prompt,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: Math.max(0, Math.round(run.durationMs)),
    stop_reason: run.stopReason ?? null,
    output: run.output,
    error: run.error ?? null,
    pi_exit_code: run.exitCode,
    markdown_artifact: markdownPath
  };

  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  return { markdownPath, recordPath };
}

async function appendExecutionRecord(input: {
  job: ScheduledJob;
  startedAt: string;
  finishedAt: string;
  run: PiExecutionResult;
  artifactPath: string;
  recordPath: string;
  templatePath: string | null;
}): Promise<void> {
  await mkdir(path.dirname(paths.executionsLogFile), { recursive: true });
  const entry = {
    framework: "pi.dev",
    mode: "active",
    job_id: input.job.id,
    status: input.run.ok ? "completed" : "failed",
    timestamp: input.job.timestamp,
    agent_id: input.job.agentId,
    template_path: input.templatePath,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    duration_ms: Math.max(0, Math.round(input.run.durationMs)),
    stop_reason: input.run.stopReason ?? null,
    error: input.run.error ?? null,
    pi_exit_code: input.run.exitCode,
    markdown_artifact: input.artifactPath,
    record_artifact: input.recordPath
  };

  await appendFile(paths.executionsLogFile, `${JSON.stringify(entry)}\n`, "utf8");
}

function isDue(job: ScheduledJob, now: number): boolean {
  if (job.status === "queued_for_pi_dev") {
    return true;
  }
  if (job.status !== "scheduled") {
    return false;
  }
  const dueAt = new Date(job.timestamp).getTime();
  return Number.isFinite(dueAt) && dueAt <= now;
}

async function runScheduledJob(document: Awaited<ReturnType<typeof readJobsDocument>>, jobId: string): Promise<void> {
  const job = findJobById(document, jobId);
  if (!job) {
    return;
  }

  const templates = await loadAgentTemplates();
  const template = templates.get(job.agentId) ?? null;

  const startedAt = nowIso();
  job.status = "running";
  job.startedAt = startedAt;
  job.updatedAt = startedAt;
  job.lastError = undefined;
  job.lastStopReason = undefined;
  job.completedAt = undefined;
  job.failedAt = undefined;
  job.runCount = (job.runCount ?? 0) + 1;
  await writeJobsDocument(document);
  await writeStatus(true);

  let run = await executeWithPi(job, template);
  const finishedAt = nowIso();

  let markdownPath = "";
  let recordPath = "";
  try {
    const persisted = await persistJobArtifacts({
      job,
      template,
      startedAt,
      finishedAt,
      run
    });
    markdownPath = persisted.markdownPath;
    recordPath = persisted.recordPath;
  } catch (error) {
    run = {
      ...run,
      ok: false,
      error: error instanceof Error ? `artifact persistence failed: ${error.message}` : "artifact persistence failed"
    };
  }

  job.updatedAt = finishedAt;
  job.lastDurationMs = Math.max(0, Math.round(run.durationMs));
  job.lastStopReason = run.stopReason;
  job.artifactPath = markdownPath || undefined;

  if (run.ok) {
    job.status = "completed";
    job.completedAt = finishedAt;
    job.failedAt = undefined;
    job.lastError = undefined;
  } else {
    job.status = "failed";
    job.failedAt = finishedAt;
    job.lastError = run.error ?? "scheduled execution failed";
    job.completedAt = undefined;
  }

  await appendExecutionRecord({
    job,
    startedAt,
    finishedAt,
    run,
    artifactPath: markdownPath,
    recordPath,
    templatePath: template?.sourcePath ?? null
  }).catch(() => undefined);

  await writeJobsDocument(document);
  lastJobId = job.id;
  lastJobStatus = run.ok ? "completed" : "failed";
  lastJobFinishedAt = finishedAt;
}

async function processScheduledJobs(): Promise<void> {
  const document = await readJobsDocument();
  const now = Date.now();
  const dueJobIds = document.jobs
    .filter((job) => isDue(job, now))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((job) => job.id);

  for (const jobId of dueJobIds) {
    await runScheduledJob(document, jobId);
  }
}

async function appendHeartbeatExecutionRecord(input: {
  startedAt: string;
  finishedAt: string;
  run: PiExecutionResult;
  promptPath: string;
  systemPromptPath: string;
}): Promise<void> {
  await mkdir(path.dirname(paths.executionsLogFile), { recursive: true });
  const entry = {
    framework: "pi.dev",
    mode: "active",
    type: "heartbeat",
    status: input.run.ok ? "completed" : "failed",
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    duration_ms: Math.max(0, Math.round(input.run.durationMs)),
    stop_reason: input.run.stopReason ?? null,
    error: input.run.error ?? null,
    pi_exit_code: input.run.exitCode,
    prompt_path: input.promptPath,
    system_prompt_path: input.systemPromptPath
  };

  await appendFile(paths.executionsLogFile, `${JSON.stringify(entry)}\n`, "utf8");
}

async function runHeartbeat(): Promise<void> {
  const startedAt = nowIso();
  lastHeartbeatStartedAt = startedAt;
  lastHeartbeatFinishedAt = null;
  lastHeartbeatStatus = null;
  lastHeartbeatError = null;

  const heartbeatPromptPath = resolveHeartbeatPromptPath();
  if (!heartbeatPromptPath) {
    lastHeartbeatFinishedAt = nowIso();
    lastHeartbeatStatus = "failed";
    lastHeartbeatError = "missing HEARTBEAT.md prompt";
    return;
  }

  const systemPromptPath = resolveSystemPromptPath();
  if (!systemPromptPath) {
    lastHeartbeatFinishedAt = nowIso();
    lastHeartbeatStatus = "failed";
    lastHeartbeatError = "missing SYSTEM.md prompt for portfolio manager heartbeat";
    return;
  }

  let heartbeatPrompt = "";
  let systemPrompt = "";
  try {
    heartbeatPrompt = (await readFile(heartbeatPromptPath, "utf8")).trim();
    systemPrompt = await readFile(systemPromptPath, "utf8");
  } catch (error) {
    lastHeartbeatFinishedAt = nowIso();
    lastHeartbeatStatus = "failed";
    lastHeartbeatError = error instanceof Error ? error.message : "failed to load heartbeat prompts";
    return;
  }

  if (!heartbeatPrompt) {
    lastHeartbeatFinishedAt = nowIso();
    lastHeartbeatStatus = "failed";
    lastHeartbeatError = "HEARTBEAT.md is empty";
    return;
  }

  const run = await executePromptWithPi({
    prompt: heartbeatPrompt,
    promptLabel: "portfolio-manager-heartbeat",
    systemPrompt
  });
  const finishedAt = nowIso();

  lastHeartbeatFinishedAt = finishedAt;
  lastHeartbeatStatus = run.ok ? "completed" : "failed";
  lastHeartbeatError = run.ok ? null : run.error ?? "heartbeat execution failed";

  await appendHeartbeatExecutionRecord({
    startedAt,
    finishedAt,
    run,
    promptPath: heartbeatPromptPath,
    systemPromptPath
  }).catch(() => undefined);
}

async function processHeartbeat(): Promise<void> {
  const config = resolveHeartbeatRuntimeConfig();
  if (!config.enabled) {
    appliedHeartbeatIntervalMs = null;
    nextHeartbeatAtMs = null;
    return;
  }

  const now = Date.now();
  if (appliedHeartbeatIntervalMs === null || appliedHeartbeatIntervalMs !== config.intervalMs) {
    appliedHeartbeatIntervalMs = config.intervalMs;
    if (nextHeartbeatAtMs !== null) {
      nextHeartbeatAtMs = now + config.intervalMs;
    }
  }

  if (nextHeartbeatAtMs === null) {
    nextHeartbeatAtMs = now + config.intervalMs;
    return;
  }

  if (now < nextHeartbeatAtMs) {
    return;
  }

  await runHeartbeat();
  nextHeartbeatAtMs = Date.now() + config.intervalMs;
}

async function tick(): Promise<void> {
  if (tickInFlight) {
    return;
  }
  tickInFlight = true;
  try {
    await processScheduledJobs();
    await processHeartbeat();
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  } finally {
    lastTickAt = nowIso();
    tickInFlight = false;
    await writeStatus(true);
  }
}

async function shutdown(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  await writeStatus(false);
  await unlink(paths.pidFile).catch(() => undefined);
  process.exit(0);
}

async function main(): Promise<void> {
  await mkdir(paths.agentsDir, { recursive: true });
  await mkdir(paths.workspaceDir, { recursive: true });
  await mkdir(paths.sessionsDir, { recursive: true });
  await mkdir(paths.researchDir, { recursive: true });
  await mkdir(paths.artifactsDir, { recursive: true });
  await mkdir(path.dirname(paths.jobsFile), { recursive: true });
  await mkdir(path.dirname(paths.executionsLogFile), { recursive: true });

  const existingPid = await readPidFile();
  if (existingPid && existingPid !== process.pid && isPidRunning(existingPid)) {
    console.error(`agents-daemon already running (pid ${existingPid})`);
    process.exit(0);
  }

  await writeFile(paths.pidFile, `${process.pid}\n`, "utf8");

  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });

  await tick();
  timer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
}

await main();
