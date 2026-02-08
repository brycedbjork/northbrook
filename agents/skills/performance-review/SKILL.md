---
name: performance-review
description: Evaluate portfolio performance quality (expectancy, drawdown, concentration, execution quality) and produce concrete remediation actions.
---

# Performance Review Skill

Use this skill when the user asks for performance review, attribution, quality-of-returns checks, or what to improve next.

Assumptions:
- broker and agents services are running;
- workspace files are the durable memory of strategy state.

## Global Rules

- Read relevant workspace files first:
  - `~/.northbrook/workspace/strategies/*.md`
  - `~/.northbrook/workspace/positions/*.md`
  - recent `~/.northbrook/workspace/research/*.md`
- Pull broker evidence before conclusions.
- Separate facts from inferences and unknowns.
- If data is incomplete, state what is missing and how to fetch it.

## Command Surface

- Portfolio and risk context:
  - `broker positions`
  - `broker exposure --by symbol`
  - `broker pnl --today`
  - `broker balance`
- Execution quality context:
  - `broker orders --status all`
  - `broker fills --since <YYYY-MM-DD>`
- Audit context:
  - `broker audit orders --since <YYYY-MM-DD>`
  - `broker audit risk`

## Review Workflow

1. Build KPI snapshot
- realized/unrealized context;
- concentration and exposure;
- drawdown risk and downside clustering;
- execution quality (fills/slippage/reject patterns if visible).

2. Attribution
- identify strongest and weakest contributors;
- classify performance drivers as repeatable vs one-off.

3. Risk quality
- check if current risk posture matches documented strategy intent;
- flag thesis drift and stale assumptions.

4. Remediation plan
- propose concrete, ordered next actions;
- include required broker checks and workspace updates.

## Output Contract

After each performance-review workflow, return:
- `kpis`: snapshot of observed performance and risk-quality signals;
- `attribution`: top contributors, detractors, and confidence in attribution;
- `issues`: concrete performance leaks or risk-control failures;
- `actions`: prioritized remediation plan with commands where applicable;
- `next`: one specific follow-up command, or `none`.
