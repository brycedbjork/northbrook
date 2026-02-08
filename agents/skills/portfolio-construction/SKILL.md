---
name: portfolio-construction
description: Build and rebalance portfolio exposures with explicit sizing logic, concentration controls, and execution checkpoints.
---

# Portfolio Construction Skill

Use this skill for allocation, sizing, rebalance, concentration reduction, or construction quality requests.

Assumptions:
- `broker-daemon` is running and trading/risk commands are available;
- workspace strategy and position files represent intended portfolio state.

## Global Rules

- Always start from current holdings and exposure, not abstract targets.
- Keep sizing logic explicit (symbol, side, qty, risk rationale).
- Respect concentration and correlation risk; avoid single-name overexposure.
- For any execution recommendation, require explicit `broker risk check` before `broker order`.

## Command Surface

- Holdings and exposure:
  - `broker positions`
  - `broker exposure --by symbol`
  - `broker balance`
  - `broker pnl --today`
- Symbol context:
  - `broker quote <symbol>`
  - `broker history <symbol> --period 30d --bar 1d`
- Risk gate:
  - `broker risk check --side <buy|sell> --symbol <symbol> --qty <qty> --limit <price>`

## Construction Workflow

1. Inventory and constraints
- inventory current positions and concentration;
- identify binding risk constraints and liquidity concerns.

2. Candidate action set
- hold / add / trim / exit candidates with reasons;
- estimate impact on exposure concentration.

3. Proposed sizing
- produce explicit symbol-side-qty plan with rationale;
- include dependency or ordering (what must happen first).

4. Execution gate
- list mandatory risk checks per order before placement;
- define invalidation conditions and stop conditions.

5. Follow-up
- specify post-execution verification commands;
- recommend scheduled follow-up jobs for time-bound catalysts.

## Output Contract

After each portfolio-construction workflow, return:
- `state`: current concentration and exposure summary;
- `plan`: ordered symbol-side-qty recommendations with rationale;
- `risk_gates`: required `broker risk check` commands per action;
- `verification`: post-trade commands to confirm outcome;
- `next`: one concrete follow-up command, or `none`.
