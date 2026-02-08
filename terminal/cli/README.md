# `nb` CLI

`nb` is the operator command for Northbrook.

## Core Commands

```bash
nb                        # launch terminal and bootstrap services
nb run [args...]          # explicit launch command
nb setup                  # onboarding wizard
nb start [args...]        # start broker + agents
nb restart [args...]      # restart broker + agents
nb stop [args...]         # stop broker + agents
nb status                 # service + config status snapshot
nb update                 # fast-forward from origin/main and reinstall
nb reset --yes            # reset config/workspace + runtime state/data
```

## Common Flags

```bash
nb --screen=command|research|positions|strategies
nb --paper | --live
nb --gateway HOST:PORT
nb --launch-ib | --no-launch-ib
nb --ib-app-path /Applications/IB\ Gateway.app
nb --ib-wait 60
nb --daemon-help
```

## Notes

- `nb` uses `~/.northbrook/northbrook.json` for provider and gateway defaults.
- Runtime files (logs, pid, socket, audit db, agents state) default to `~/.local/state/northbrook`.
- Runtime payload data (for example IBC install assets) default to `~/.local/share/northbrook`.
- If no prior sessions exist in `~/.northbrook/workspace/sessions`, `nb` runs the thesis kickoff TUI before opening the terminal app.
- Scheduled jobs are handled through `./agents/skills/scheduled-jobs/jobs.sh`, not through `nb`.
- `nb status` is the fastest health check when something looks wrong.

## Testing

From `terminal/`:

```bash
bun run test
```
