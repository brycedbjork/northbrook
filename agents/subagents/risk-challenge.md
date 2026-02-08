---
description: Stress-test a thesis or trade plan with the risk-critic agent.
---

Use the `research_subagent` tool now.

Arguments:

```json
{
  "mode": "single",
  "agent": "risk-critic",
  "task": "Challenge this thesis or action plan. Focus on failure modes, missing risk gates, concentration/correlation, and invalidation quality:\n\n$@"
}
```

After tool completion, return a concise go/no-go recommendation and the top 3 blockers.
