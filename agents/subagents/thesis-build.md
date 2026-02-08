---
description: Build a decision-ready thesis with evidence, counter-thesis, and risk gates.
---

Use the `research_subagent` tool now.

Arguments:

```json
{
  "mode": "chain",
  "chain": [
    {
      "agent": "scout",
      "task": "Collect high-signal evidence for thesis candidate: $@"
    },
    {
      "agent": "planner",
      "task": "Convert this evidence into an actionable investigation and execution plan:\n\n{previous}"
    },
    {
      "agent": "risk-critic",
      "task": "Challenge this plan for downside, concentration, and invalidation gaps:\n\n{previous}"
    },
    {
      "agent": "synthesizer",
      "task": "Produce a final thesis memo with confidence, counter-thesis, and invalidation triggers:\n\n{previous}"
    }
  ]
}
```

After tool completion, return a final thesis summary with: edge, invalidation, and one next action.
