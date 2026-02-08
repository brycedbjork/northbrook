---
description: Run chained scout->planner->risk-critic->execution-planner->synthesizer workflow for decision-ready analysis.
---

Use the `research_subagent` tool now.

Arguments:

```json
{
  "mode": "chain",
  "chain": [
    {
      "agent": "scout",
      "task": "Collect high-signal evidence for: $@"
    },
    {
      "agent": "planner",
      "task": "Create a detailed investigation plan from this evidence:\n\n{previous}"
    },
    {
      "agent": "risk-critic",
      "task": "Challenge this plan for hidden downside, concentration, and invalidation gaps:\n\n{previous}"
    },
    {
      "agent": "execution-planner",
      "task": "Convert this into a concrete execution plan with pre-trade and post-trade gates:\n\n{previous}"
    },
    {
      "agent": "synthesizer",
      "task": "Produce a final decision memo with confidence level, counter-thesis, and invalidation triggers:\n\n{previous}"
    }
  ]
}
```

After tool completion, return the synthesized memo, explicit assumptions, and required risk gates.
