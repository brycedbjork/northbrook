---
description: Run parallel comparative research (bull vs bear) and synthesize differences.
---

Use the `research_subagent` tool now.

Arguments:

```json
{
  "mode": "parallel",
  "tasks": [
    {
      "agent": "scout",
      "task": "Build bullish case for: $@"
    },
    {
      "agent": "scout",
      "task": "Build bearish case for: $@"
    }
  ]
}
```

After tool completion, produce a comparison table: thesis, evidence, uncertainty.
