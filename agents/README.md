# Agents Service

The agents service runs Northbrook background automation and houses agent runtime assets.

## Directory Layout

- `agents/daemon` daemon runtime (`daemon.ts`, `status-cli.ts`) and service scripts (`start.sh`, `stop.sh`, `status.sh`)
- `agents/skills` all Northbrook agent skills
- `agents/extensions` pi extension modules
- `agents/SYSTEM.md` primary portfolio manager system prompt for the main/root agent
- `agents/subagents` reusable research subagent templates and workflow prompts
- `agents/AGENTS.md` contribution patterns and default coding-context guidance

## Responsibilities

- runs the agents daemon lifecycle
- tracks heartbeat/service status
- runs portfolio-manager heartbeat agents on a fixed cadence (`heartbeat` block in `~/.northbrook/northbrook.json`)
- executes due scheduled jobs through `pi`
- persists execution artifacts and job execution logs

## Daemon Runtime

- daemon entrypoint: `agents/daemon/daemon.ts`
- service scripts: `agents/daemon/start.sh`, `agents/daemon/stop.sh`, `agents/daemon/status.sh`
- default tick interval: 5 seconds
- heartbeat cadence: `heartbeat.intervalMinutes` in `~/.northbrook/northbrook.json` (default 30 minutes)
- loads optional subagent templates from `agents/subagents/*.agent.md`
- heartbeat prompt source: `agents/HEARTBEAT.md` (override with `NORTHBROOK_HEARTBEAT_PROMPT`)
- model source for `pi` runs: `aiProvider.model` in `~/.northbrook/northbrook.json` (fallback `NORTHBROOK_AI_MODEL`)
- appends structured execution events to `~/.local/state/northbrook/agents/scheduled-job-executions.jsonl`

## Operations

From repo root:

```bash
./agents/daemon/start.sh
./agents/daemon/status.sh
./agents/daemon/stop.sh
```

Service-level control is also available through `nb`:

```bash
nb start
nb status
nb stop
```

## Scheduled Jobs

Scheduled jobs are managed through the agents tool, not `nb`:

```bash
./agents/skills/scheduled-jobs/jobs.sh --help
```

## Testing

From repo root:

```bash
cd agents && bun run test
```

## Skills

All skills live under `agents/skills`.
Skill docs are agent-facing and assume the platform is already fully operational.

- `agents/skills/broker/SKILL.md` full broker CLI skill
- `agents/skills/scheduled-jobs/SKILL.md` scheduled jobs lifecycle skill
- `agents/skills/web-search/SKILL.md` Brave-powered web discovery skill
- `agents/skills/public-company-filings/SKILL.md` SEC/public filings discovery and pull skill

## Extensions

All runtime extensions live under `agents/extensions`.

- `agents/extensions/broker-safety` enforces automated broker command safety guards (no confirmation prompts)
- `agents/extensions/research-subagent` adds delegated research tooling and workflows

### Broker Safety Policy

- require `--confirm` for `broker cancel --all`
- require `--duration` and `--reason` for `broker risk override`
- require recent matching `broker risk check` before `broker order buy|sell|bracket`
- block orders above max quantity threshold
- defaults:
  - risk-check freshness window: 10 minutes
  - max order quantity: 1000
  - override max qty via `NORTHBROOK_GUARD_MAX_ORDER_QTY`

### Research Subagent Workflows

- tool: `research_subagent`
- command: `/research-workflow`
- modes:
  - `single` one agent and one task
  - `parallel` concurrent multi-step tasks
  - `chain` sequential tasks with `{previous}` interpolation
- workflow prompt templates (loaded by terminal): `agents/subagents/*.md` excluding `*.agent.md`
- common commands:
  - `/research-quick`
  - `/research-deep`
  - `/research-compare`

## Prompts And Templates

- `agents/SYSTEM.md` primary system prompt for the terminal main agent
- `agents/HEARTBEAT.md` user prompt used by daemon heartbeat runs
- `agents/subagents/*.agent.md` reusable subagent configs
- `agents/subagents/*.md` reusable research workflow prompts
- model source for all agent executions: `aiProvider.model` in `~/.northbrook/northbrook.json` (or `NORTHBROOK_AI_MODEL`)
- primary researcher agent templates:
  - `scout`
  - `planner`
  - `synthesizer`

## Data Locations

- runtime state: `~/.local/state/northbrook/agents`
- jobs file: `~/.northbrook/workspace/scheduled-jobs.json`
- agent sessions: `~/.northbrook/workspace/sessions`
- research artifacts: `~/.northbrook/workspace/research/*.md`
- execution records: `~/.local/state/northbrook/agents/artifacts/*.json`
- execution log: `~/.local/state/northbrook/agents/scheduled-job-executions.jsonl`
