#!/usr/bin/env bun

import { readJobsDocument, writeJobsDocument, makeJob, findJobById } from "./lib/jobs-store.js";
import { paths } from "../../daemon/lib/paths.js";
import { parseWhenInput } from "../../daemon/lib/time.js";

function usage(): void {
  console.log(`Scheduled Jobs CLI (pi.dev aligned)

Usage:
  ./agents/skills/scheduled-jobs/jobs.sh create --agent <agentId> (--at <timestamp> | --in <duration>) --prompt <text>
  ./agents/skills/scheduled-jobs/jobs.sh list [--agent <agentId>] [--json]
  ./agents/skills/scheduled-jobs/jobs.sh show <jobId>
  ./agents/skills/scheduled-jobs/jobs.sh edit <jobId> [--agent <agentId>] [--at <timestamp> | --in <duration>] [--prompt <text>]
  ./agents/skills/scheduled-jobs/jobs.sh remove <jobId>

Timestamp formats:
  --at "2026-02-08T15:00:00Z"
  --at "1739041200"                (unix)
  --in "30m"                       (supports s/m/h/d)

Data file:
  ${paths.jobsFile}
`);
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function readOption(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return null;
  }
  return args[idx + 1] ?? null;
}

function parseSchedule(args: string[]): string {
  const at = readOption(args, "--at");
  const inValue = readOption(args, "--in");

  if (at && inValue) {
    throw new Error("use only one of --at or --in");
  }

  if (at) {
    return parseWhenInput(at).toISOString();
  }

  if (inValue) {
    return parseWhenInput(`in ${inValue}`).toISOString();
  }

  throw new Error("missing schedule: pass --at or --in");
}

function printTable(rows: Array<Record<string, string>>): void {
  if (rows.length === 0) {
    console.log("No jobs found.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => (r[h] ?? "").length)));

  const header = headers.map((h, i) => h.padEnd(widths[i])).join("  ");
  console.log(header);
  console.log(widths.map((w) => "-".repeat(w)).join("  "));

  for (const row of rows) {
    console.log(headers.map((h, i) => (row[h] ?? "").padEnd(widths[i])).join("  "));
  }
}

async function commandCreate(args: string[]): Promise<void> {
  const agentId = readOption(args, "--agent") ?? readOption(args, "--agent-id");
  const prompt = readOption(args, "--prompt");

  if (!agentId) {
    throw new Error("missing --agent <agentId>");
  }
  if (!prompt) {
    throw new Error("missing --prompt <text>");
  }

  const timestamp = parseSchedule(args);
  const doc = await readJobsDocument();
  const job = makeJob({ timestamp, agentId, prompt });
  doc.jobs.push(job);
  await writeJobsDocument(doc);

  console.log(`Created job ${job.id}`);
  console.log(`- timestamp: ${job.timestamp}`);
  console.log(`- agentId: ${job.agentId}`);
  console.log(`- prompt: ${job.prompt}`);
}

async function commandList(args: string[]): Promise<void> {
  const doc = await readJobsDocument();
  const agent = readOption(args, "--agent") ?? readOption(args, "--agent-id");
  const json = hasFlag(args, "--json");

  const jobs = doc.jobs.filter((job) => (agent ? job.agentId === agent : true));

  if (json) {
    console.log(JSON.stringify(jobs, null, 2));
    return;
  }

  printTable(
    jobs.map((job) => ({
      id: job.id,
      status: job.status,
      runs: String(job.runCount ?? 0),
      timestamp: job.timestamp,
      agentId: job.agentId,
      prompt: job.prompt.length > 48 ? `${job.prompt.slice(0, 45)}...` : job.prompt
    }))
  );
}

async function commandShow(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    throw new Error("missing job id");
  }

  const doc = await readJobsDocument();
  const job = findJobById(doc, id);
  if (!job) {
    throw new Error(`job not found: ${id}`);
  }
  console.log(JSON.stringify(job, null, 2));
}

async function commandEdit(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    throw new Error("missing job id");
  }

  const doc = await readJobsDocument();
  const job = findJobById(doc, id);
  if (!job) {
    throw new Error(`job not found: ${id}`);
  }

  const edits = args.slice(1);
  const agentId = readOption(edits, "--agent") ?? readOption(edits, "--agent-id");
  const prompt = readOption(edits, "--prompt");

  if (agentId) {
    job.agentId = agentId;
  }
  if (prompt) {
    job.prompt = prompt;
  }
  if (hasFlag(edits, "--at") || hasFlag(edits, "--in")) {
    job.timestamp = parseSchedule(edits);
    job.status = "scheduled";
    job.queuedAt = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;
    job.failedAt = undefined;
    job.lastDurationMs = undefined;
    job.lastStopReason = undefined;
    job.lastError = undefined;
    job.artifactPath = undefined;
  }

  job.updatedAt = new Date().toISOString();
  await writeJobsDocument(doc);

  console.log(`Updated job ${job.id}`);
}

async function commandRemove(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    throw new Error("missing job id");
  }

  const doc = await readJobsDocument();
  const before = doc.jobs.length;
  doc.jobs = doc.jobs.filter((job) => job.id !== id);
  if (doc.jobs.length === before) {
    throw new Error(`job not found: ${id}`);
  }

  await writeJobsDocument(doc);
  console.log(`Removed job ${id}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  switch (command) {
    case "create":
      await commandCreate(rest);
      return;
    case "list":
      await commandList(rest);
      return;
    case "show":
      await commandShow(rest);
      return;
    case "edit":
      await commandEdit(rest);
      return;
    case "remove":
    case "rm":
    case "delete":
      await commandRemove(rest);
      return;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`jobs error: ${message}`);
  console.error("Run `./agents/skills/scheduled-jobs/jobs.sh --help` for usage.");
  process.exit(1);
});
