---
name: scheduled-jobs
description: Manage daemon-executed scheduled jobs for Pi agent runs (create, inspect, edit, remove, and monitor outcomes).
---

# Scheduled Jobs Skill

Use this skill whenever the user asks to schedule agent work for later execution, inspect scheduled/finished jobs, or update/remove an existing scheduled run.

Assumptions:
- the platform is fully operational;
- `agents-daemon` is already running;
- Pi execution + artifact persistence are active.

## Global Rules

- Always use `./agents/skills/scheduled-jobs/jobs.sh`.
- Do not request human confirmation for CRUD operations.
- Prefer `--in` for relative scheduling and `--at` for fixed timestamps.
- For `show` and targeted edits/removals, pass the exact `jobId`.
- For predictable catalysts (earnings, macro releases, planned events), create jobs ahead of time instead of waiting for heartbeat.
- On command failure:
  1. report the exact failing command,
  2. include the error text,
  3. provide one concrete retry command.

## Command Surface

- Create: `./agents/skills/scheduled-jobs/jobs.sh create --agent <agentId> (--in <duration> | --at <timestamp>) --prompt "<text>"`
- List all: `./agents/skills/scheduled-jobs/jobs.sh list`
- List by agent: `./agents/skills/scheduled-jobs/jobs.sh list --agent <agentId>`
- Show one: `./agents/skills/scheduled-jobs/jobs.sh show <jobId>`
- Edit: `./agents/skills/scheduled-jobs/jobs.sh edit <jobId> [--agent <agentId>] [--in <duration> | --at <timestamp>] [--prompt "<text>"]`
- Remove: `./agents/skills/scheduled-jobs/jobs.sh remove <jobId>`

## Scheduling Inputs

- Relative duration (`--in`): supports `s`, `m`, `h`, `d` (example: `30m`, `2h`, `1d`).
- Absolute time (`--at`): ISO-8601 or unix timestamp.
- Use only one schedule input per command: `--in` or `--at`, never both.

## Catalyst Scheduling Pattern (Required For Time-Bound Events)

When asked to prepare for a known event, create a three-job ladder when feasible:

1. Pre-event prep job
- Timing: 24h to 72h before event
- Goal: refresh thesis, scenarios, risk limits

2. Event-window monitoring job
- Timing: near event time
- Goal: monitor and evaluate immediate implications

3. Post-event follow-up job
- Timing: after first market reaction window
- Goal: update thesis, rebalance/exit recommendations, and workspace records

If the user requests only one checkpoint, still suggest the missing two checkpoints in `next`.

## State Model

Source of truth: `~/.northbrook/workspace/scheduled-jobs.json`

Primary fields:
- identity: `id`, `agentId`
- schedule: `timestamp`
- prompt: `prompt`
- lifecycle: `status`, `createdAt`, `updatedAt`, `runCount`
- runtime: `queuedAt`, `startedAt`, `completedAt`, `failedAt`, `lastDurationMs`, `lastStopReason`, `lastError`, `artifactPath`

Known statuses:
- `scheduled`
- `queued_for_pi_dev`
- `running`
- `completed`
- `failed`
- `cancelled`

## Execution + Artifacts

- Framework marker is `pi.dev`.
- Due jobs progress to execution via daemon ticks.
- Execution log appends JSONL entries to `~/.local/state/northbrook/agents/scheduled-job-executions.jsonl`.
- Persisted artifacts:
  - markdown: `~/.northbrook/workspace/research/*.md`
  - execution record JSON: `~/.local/state/northbrook/agents/artifacts/*.json`

## Fast Workflows

1. Schedule new run:
   `create` -> capture returned `jobId` -> `show <jobId>` for verification.
2. Update schedule/prompt:
   `edit <jobId> ...` -> `show <jobId>` to confirm reset/updated fields.
3. Monitor completion:
   `list` for status scan -> `show <jobId>` for runtime details + `artifactPath`.
4. Delete stale work:
   `remove <jobId>` when no longer needed.
5. Catalyst ladder:
   create pre-event + event-window + post-event jobs -> `list` -> `show` each `jobId`.

## Output Contract

After each scheduled-jobs workflow, respond with:
- `commands`: exact commands executed in order;
- `jobs`: affected `jobId` values and resulting `status`;
- `evidence`: key returned fields (timestamp, agentId, runCount, artifactPath, or error);
- `next`: one specific follow-up command when useful, otherwise `none`.
