# Northbrook

Northbrook is an autonomous trading platform that combines:
- `terminal` for human oversight and control
- `agents` for background automation and scheduling
- `broker` for execution, risk checks, and audit logging against Interactive Brokers

## Quickstart

Install using the hosted bootstrap script:

```bash
curl -fsSL https://raw.githubusercontent.com/brycedbjork/northbrook/main/install/bootstrap.sh | bash
```

If you already have the repo cloned locally, you can run:

```bash
./install.sh
```

After install:

```bash
nb
nb status
nb setup
```

Common lifecycle commands:

```bash
nb start --paper
nb restart
nb stop
```

Storage defaults:
- `~/.northbrook` for user config + workspace repo
- `~/.local/state/northbrook` for runtime state (logs, sockets, pids, audit db, agents daemon files)
- `~/.local/share/northbrook` for local runtime data payloads (for example IBC install assets)

## Service Documentation

- `terminal/README.md`
- `agents/README.md`
- `broker/README.md`

## Repository Layout

- `terminal/` human-facing TUI and `nb` CLI
- `agents/` background daemon and scheduled-jobs tooling
- `broker/` execution stack (daemon, CLI, SDKs)
- `install/` installer and bootstrap steps

## Development Checks

From repo root:

```bash
bun run typecheck
bun run lint
bun run check
```

## Git Hooks

Husky is configured with a `pre-commit` hook that runs the full local CI suite:

```bash
bun run ci:all
```

After cloning, run `bun install` once to install hooks.
