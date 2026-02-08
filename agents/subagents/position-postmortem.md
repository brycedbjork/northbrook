---
description: Run a structured position postmortem to extract repeatable lessons.
---

Use the `research_subagent` tool now.

Arguments:

```json
{
  "mode": "chain",
  "chain": [
    {
      "agent": "position-auditor",
      "task": "Reconstruct position timeline, decisions, and thesis evolution for:\n\n$@"
    },
    {
      "agent": "risk-critic",
      "task": "Identify preventable risks, execution mistakes, and invalidation failures from this timeline:\n\n{previous}"
    },
    {
      "agent": "synthesizer",
      "task": "Produce postmortem lessons, process improvements, and future guardrails:\n\n{previous}"
    }
  ]
}
```

After tool completion, provide a concise postmortem with 3 process changes to apply immediately.
