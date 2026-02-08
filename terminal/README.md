# Terminal Service

The terminal service is the human control plane for Northbrook.

## What It Does

- launches the interactive terminal UI
- surfaces strategy, research, positions, and command workflows
- provides live pi RPC chat streaming in the chat panel
- works with broker + agents services that run in the background

## Launch

```bash
nb
```

On first launch (when `~/.northbrook/workspace/sessions` is empty), `nb` opens a thesis kickoff TUI before loading the main terminal app. The submitted thesis is sent to the first agent session to seed initial strategies and positions.

Open a specific screen:

```bash
nb --screen=command
nb --screen=research
nb --screen=positions
nb --screen=strategies
```

## Pi Chat (Phase 1)

- chat input now sends prompts to a live `pi --mode rpc` process
- primary agent system prompt is loaded from `agents/SYSTEM.md`
- assistant text streams into the chat view in real time
- tool execution status is shown inline while the run is active

## Pi Broker Safety Guards (Phase 2)

- terminal RPC bootstrap auto-loads all skills from `agents/skills/**/SKILL.md`
- terminal RPC bootstrap auto-loads all extensions from `agents/extensions/**/*.ts|js`
- `agents/extensions/broker-safety` enforces broker command policy without interactive confirmations
- RPC dialog requests (`confirm/select/input/editor`) are auto-resolved without user prompts

## Research Workflows (Phase 3)

- `agents/extensions/research-subagent` provides `research_subagent` tool and `/research-workflow` command
- terminal RPC bootstrap loads workflow prompts from `agents/subagents/**` (excluding `README.md` and `*.agent.md`)
- research template commands currently include:
  - `/research-quick`
  - `/research-deep`
  - `/research-compare`

Environment options:

- `NORTHBROOK_PI_BIN` override the `pi` executable path
- `NORTHBROOK_AI_PROVIDER` provider passed to pi (`anthropic`, `openai`, `google`)
- `NORTHBROOK_AI_MODEL` override model id passed to pi (defaults to `aiProvider.model` in `~/.northbrook/northbrook.json`)
- `NORTHBROOK_SYSTEM_PROMPT` override primary system prompt file path
- `NORTHBROOK_SESSIONS_DIR` pi session directory (defaults to `~/.northbrook/workspace/sessions`)

## Related Docs

- `terminal/cli/README.md` for the `nb` command surface
- `broker/README.md` for execution/risk service context
- `agents/README.md` for background automation context
