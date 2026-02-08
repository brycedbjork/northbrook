Treat the thesis above as the user's primary portfolio mandate.
This run is a background portfolio seeding workflow.

Mandatory persistence requirements for this run:
- Do not just reply with prose. Use file tools to write durable artifacts in the workspace now.
- Create or update strategy docs in `~/.northbrook/workspace/strategies/*.md` with valid frontmatter:
  - `name`
  - `status`
  - `last_evaluated_at` (ISO-8601)
  - `positions` (string array of symbols)
- Create or update position docs in `~/.northbrook/workspace/positions/*.md` with valid frontmatter:
  - `symbol`
  - `order_ids` (string array; use `[]` if no broker order yet)
  - `strategy`
  - `opened_at` (ISO-8601)
- Ensure strategy `positions` lists and position `strategy` values are consistent.
- Keep initial sizing conservative and include explicit invalidation criteria in file bodies.
- Do not place broker orders in this kickoff; seed documentation and portfolio plan only.

After writing files, return a concise summary of what was persisted.
