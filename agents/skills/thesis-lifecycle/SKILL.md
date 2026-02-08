---
name: thesis-lifecycle
description: Manage thesis lifecycle from idea formation to monitoring, invalidation, exit, and postmortem with durable workspace updates.
---

# Thesis Lifecycle Skill

Use this skill when the user asks to create, update, challenge, invalidate, retire, or review a thesis.

Assumptions:
- workspace files are durable memory;
- research and scheduled-jobs tooling are available.

## Global Rules

- A thesis is incomplete without explicit invalidation criteria.
- Every thesis change must update durable workspace context in the same turn.
- Use research subagents for evidence generation when needed.
- For time-bound catalysts, schedule follow-up jobs proactively.

## Lifecycle Stages

1. Build
- define thesis statement, edge hypothesis, key assumptions, and upside/downside scenarios.

2. Validate
- gather confirming and disconfirming evidence;
- assign confidence and evidence quality.

3. Monitor
- track catalyst timeline, risk triggers, and stale-assumption checks.

4. Invalidate or confirm
- define what evidence or price behavior invalidates thesis;
- decide hold/add/trim/exit based on updated evidence.

5. Postmortem
- capture what was right, what was wrong, and process changes.

## Operational Commands

- Use research workflows when evidence is missing:
  - `research_subagent` tool (single/parallel/chain)
- Use scheduled jobs for monitoring checkpoints:
  - `./agents/skills/scheduled-jobs/jobs.sh create ...`
- Use broker queries for position/execution state:
  - `broker positions`
  - `broker orders --status all`
  - `broker fills --since <YYYY-MM-DD>`

## Output Contract

After each thesis-lifecycle workflow, return:
- `stage`: current lifecycle stage and status;
- `thesis`: updated thesis and invalidation criteria;
- `evidence`: confirming vs disconfirming evidence summary;
- `monitoring`: required future checkpoints and scheduled jobs;
- `next`: one concrete follow-up command, or `none`.
