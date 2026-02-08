---
description: Build a weekly catalyst monitoring plan and proposed scheduled jobs.
---

Use the `research_subagent` tool now.

Arguments:

```json
{
  "mode": "chain",
  "chain": [
    {
      "agent": "scout",
      "task": "Identify next-week high-impact catalysts and relevant symbols/themes:\n\n$@"
    },
    {
      "agent": "catalyst-scheduler",
      "task": "Convert this catalyst set into pre-event, event-window, and post-event monitoring jobs:\n\n{previous}"
    }
  ]
}
```

After tool completion, list proposed jobs with timing and prompts ready for scheduled-jobs execution.
