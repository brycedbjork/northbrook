---
description: Run a portfolio rebalance quality check using position-auditor and risk-critic.
---

Use the `research_subagent` tool now.

Arguments:

```json
{
  "mode": "parallel",
  "tasks": [
    {
      "agent": "position-auditor",
      "task": "Audit open positions for thesis drift, stale assumptions, and documentation gaps:\n\n$@"
    },
    {
      "agent": "risk-critic",
      "task": "Identify concentration, correlation, and drawdown risks in current portfolio posture:\n\n$@"
    }
  ]
}
```

After tool completion, provide a prioritized rebalance shortlist (trim/add/hold/exit) with risk rationale.
