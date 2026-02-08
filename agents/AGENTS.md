# AGENTS

Default AI coding context for the `agents/` package.

## Purpose

- Keep all Northbrook agent runtime assets inside `agents/`.
- Document how Northbrook maps `agents/` files into pi runtime behavior.
- Keep this file implementation-accurate for future refactors.

## Source Of Truth Links (pi.dev / pi-mono)

Use these links before changing agent orchestration behavior:

- Pi overview and CLI behaviors:
  - https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
- Skills:
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md
  - Agent Skills spec: https://agentskills.io/specification
- Extensions:
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- Prompt templates:
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md
- RPC mode:
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md
- JSON mode event stream:
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/json.md
- Session format and tree semantics:
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/session.md
- Settings and resource loading:
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/settings.md
- SDK (for deeper embedding patterns):
  - https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md

## Directory Contract

- `agents/daemon`: daemon runtime + status CLI + start/stop/status scripts.
- `agents/skills`: all skill docs and skill-owned runtime code.
- `agents/extensions`: pi extension modules.
- `agents/SYSTEM.md`: primary portfolio manager system prompt for the main/root agent.
- `agents/HEARTBEAT.md`: daemon heartbeat user prompt for recurring portfolio review runs.
- `agents/subagents`: reusable subagent templates (`*.agent.md`) and workflow prompt templates (`*.md`).
- `agents/README.md`: human-facing architecture/ops doc.
- `agents/AGENTS.md`: AI-facing build and refactor rules.

Do not create `agents/src`, `agents/agent-harness`, root compatibility wrappers, or extra per-folder docs.

## Runtime Topology

### Main Agent (Terminal App)

- Entry path: `nb` -> `terminal/app/main.tsx` -> `terminal/app/lib/pi-rpc.ts`.
- pi process is started in RPC mode with:
  - `--mode rpc`
  - `--session-dir ~/.northbrook/workspace/sessions`
  - `--model` from `~/.northbrook/northbrook.json` (`aiProvider.model`, fallback `NORTHBROOK_AI_MODEL`)
- Main system prompt:
  - `agents/SYSTEM.md` passed via `--append-system-prompt`
  - override path supported with `NORTHBROOK_SYSTEM_PROMPT`

### Subagents (Research Extension)

- Extension: `agents/extensions/research-subagent/index.ts`.
- Provides `research_subagent` tool and `/research-workflow` command.
- Agent templates are loaded from `agents/subagents/**/*.agent.md` using frontmatter:
  - `name` (agent ID)
  - `tools` (optional comma-delimited tool allowlist)
  - markdown body as subagent system prompt
- Execution modes:
  - `single`
  - `parallel` (max 6 steps, concurrency 3)
  - `chain` with `{previous}` interpolation
- Each subagent run invokes `pi --mode json -p --session-dir ~/.northbrook/workspace/sessions`.
- Subagent `pi` runs also auto-load all skill files from `agents/skills/**/SKILL.md`.

### Background Jobs (Daemon)

- Daemon entrypoint: `agents/daemon/daemon.ts`.
- Service scripts:
  - `agents/daemon/start.sh`
  - `agents/daemon/stop.sh`
  - `agents/daemon/status.sh`
- Due jobs are executed with pi JSON mode and persisted artifacts.
- `job.agentId` maps to template `name` in `agents/subagents/**/*.agent.md`.
- Heartbeat runs execute independently from scheduled jobs using:
  - system prompt: `agents/SYSTEM.md`
  - user prompt: `agents/HEARTBEAT.md`
  - cadence config: `heartbeat` block in `~/.northbrook/northbrook.json`
- Daemon `pi` executions (scheduled jobs + heartbeat) auto-load all skill files from `agents/skills/**/SKILL.md`.

## How `agents/` Files Become Chat Runtime Context

Terminal main-agent startup (`terminal/app/lib/pi-rpc.ts`) compiles resources into one pi RPC process:

1. Loads manager prompt from `agents/SYSTEM.md` and appends it as system prompt.
2. Recursively discovers `agents/skills/**/SKILL.md`, passes each via `--skill`.
3. Recursively discovers `agents/extensions/**/*.{ts,js}`, passes each via `--extension`.
4. Recursively discovers `agents/subagents/**/*.md` excluding `README.md` and `*.agent.md`, passes each via `--prompt-template`.
5. Persists all sessions under `~/.northbrook/workspace/sessions`.

Implication: adding files in these locations changes the next terminal chat bootstrap without extra wiring.

## Implementation Pointers (Keep In Sync)

- Terminal runtime assembly:
  - `terminal/app/lib/pi-rpc.ts`
  - functions: `defaultSkillPaths`, `defaultExtensionPaths`, `defaultPromptTemplatePaths`, `resolveSystemPromptPath`, `resolveSessionsDir`
- Main chat event wiring:
  - `terminal/app/store/index.ts`
  - pi RPC events drive streaming, tool status, and assistant message assembly
- Daemon pi execution pipeline:
  - `agents/daemon/daemon.ts`
  - functions: `loadAgentTemplates`, `executeWithPi`, `persistJobArtifacts`, `appendExecutionRecord`, `processScheduledJobs`, `processHeartbeat`
- Research subagent orchestration:
  - `agents/extensions/research-subagent/index.ts`
  - functions: `loadAgentTemplates`, `runSingleAgent`, `runWorkflow`
- Sessions and paths:
  - `agents/daemon/lib/paths.ts`
  - `terminal/app/lib/paths.ts`
  - `terminal/cli/nb.ts`

## Session, State, And Artifact Contracts

- Sessions (all agent runs): `~/.northbrook/workspace/sessions`
- Scheduled jobs file: `~/.northbrook/workspace/scheduled-jobs.json`
- Research markdown artifacts: `~/.northbrook/workspace/research/*.md`
- Execution record artifacts: `~/.local/state/northbrook/agents/artifacts/*.json`
- Daemon execution log: `~/.local/state/northbrook/agents/scheduled-job-executions.jsonl`
- Daemon status file: `~/.local/state/northbrook/agents/agents-daemon.status.json`

## Skills: Add / Change Rules

- Place skills under `agents/skills/<skill-name>/SKILL.md`.
- Skill docs are agent-facing and assume fully operational runtime.
- Do not write setup/bootstrap instructions in `SKILL.md` for this repo.
- Keep behavior deterministic, executable, and non-interactive.
- Co-locate skill runtime code beside the skill (example: `agents/skills/scheduled-jobs/*`).
- Broker skill is a single skill: `agents/skills/broker/SKILL.md`.

## Extensions: Add / Change Rules

- Place extension at `agents/extensions/<name>/index.ts` (or `.ts/.js` file under that subtree).
- Default export must register extension hooks/tools/commands through pi extension API.
- Prefer deterministic policy hooks over user prompts.
- Northbrook policy is no human confirmations inside runtime:
  - terminal RPC client auto-declines extension UI prompts requiring confirmation/input/select/editor
  - user decisions occur only at the main chat level

## Prompts And Templates Rules

- Main-agent prompt: `agents/SYSTEM.md`.
- Reusable subagent templates: `agents/subagents/*.agent.md`.
- Reusable workflow prompt templates: `agents/subagents/*.md` (non-`.agent.md`).
- Keep prompt workflows concise, explicit, and directly executable by pi.

## Ownership Map

- `agents/daemon/daemon.ts`: scheduled execution lifecycle, pi invocation, artifact persistence, execution logging.
- `agents/daemon/status-cli.ts`: daemon status report and counters.
- `agents/skills/scheduled-jobs/cli.ts`: scheduled job CRUD/list/show/edit/remove.
- `agents/skills/scheduled-jobs/lib/*`: jobs types and persistence.
- `agents/extensions/broker-safety/index.ts`: broker command safety guards.
- `agents/extensions/research-subagent/index.ts`: subagent orchestration tool and workflows.

## Non-Interactive Policy

- No in-runtime confirmation loops.
- No human gating in daemon/subagent flows.
- Commands should execute or fail fast with explicit reason and concrete retry.

## Change Checklist

1. Update types first (`agents/daemon/lib/types.ts`, `agents/skills/scheduled-jobs/lib/types.ts`) when contracts change.
2. Update path contracts in `agents/daemon/lib/paths.ts` when storage locations change.
3. Update runtime implementation in the owning directory only.
4. Update docs:
   - `agents/README.md` for human operations.
   - `agents/AGENTS.md` for AI implementation context.
   - affected `agents/skills/**/SKILL.md`.
5. Validate end-to-end.

## Validation

```bash
cd agents && bun run typecheck
cd agents && bun run test
cd terminal && bun run typecheck
cd terminal && bun run test
bun run ci:typescript
```
