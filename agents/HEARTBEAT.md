# Portfolio Manager Heartbeat

Run the portfolio heartbeat review now.

This heartbeat cycle is separate from scheduled jobs.

## Required Workflow

1. Review all strategy files in `~/.northbrook/workspace/strategies`.
2. Review all position files in `~/.northbrook/workspace/positions`.
3. Evaluate portfolio risk regime:
- drawdown sensitivity;
- concentration and correlation clusters;
- stale theses and stale exits.
4. Identify timely catalysts:
- unexpected events requiring immediate follow-up;
- near-term known events that still need monitoring jobs.
5. Create research and monitoring follow-up jobs using `./agents/skills/scheduled-jobs/jobs.sh create` where needed.
6. Update workspace files if portfolio understanding changes.

## Constraints

- Do not treat predictable calendar events (including earnings) as heartbeat triggers.
- Predictable calendar events must be handled by proactively creating scheduled jobs ahead of time.
- Keep all updates deterministic and write durable context into workspace files when needed.
- Distinguish facts, inferences, and unknowns.
- If evidence quality is weak, prefer risk reduction over risk increase.

## Response Format

1. Portfolio View
2. Position Risk Review
3. Regime Shift Signals
4. Timely Catalysts
5. Jobs Created
6. Workspace Updates
7. Open Questions
