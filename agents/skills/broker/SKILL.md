---
name: broker
description: Full Northbrook broker CLI operations for market data, portfolio, orders, risk, agent heartbeat/subscriptions, and audit queries. Use this whenever the task requires broker daemon interaction.
---

# Broker Skill

Use this skill for any `broker` CLI workflow.

Assumptions:
- the platform is fully operational;
- `broker-daemon` is already running;
- credentials and gateway connectivity are already configured.

## Global Rules

- Broker CLI outputs JSON by default; use plain `broker ...` commands.
- Do not ask for confirmation prompts. Execute directly and report results.
- Broker safety extension may block non-compliant commands; follow block reason and retry with corrected command.
- For any trade recommendation or execution request, use the pre-trade and post-trade protocol below.
- On command failure:
  1. capture the error message,
  2. report the exact failing command,
  3. suggest one concrete retry/fix.

## Required Trading Protocol

Use this exact sequence for any `buy`, `sell`, `bracket`, or cancel workflow tied to active risk:

1. Context snapshot
- `broker quote <symbol>`
- `broker positions`
- `broker exposure --by symbol`
- optional: `broker pnl --today`

2. Pre-trade risk gate (required)
- Run matching `broker risk check --side <buy|sell> --symbol <symbol> --qty <qty> --limit <price>`
- If risk check fails or is stale relative to changed order parameters, do not place order.

3. Execution
- Place order with `broker order buy|sell|bracket ...`

4. Verification
- `broker order status <client-order-id>`
- `broker orders --status all`
- `broker fills --since <recent-iso-date>`

5. Closeout summary
- Report fills, open risk, and exact next checkpoint command.

## Command Surface

### Market

- Snapshot quotes: `broker quote AAPL MSFT`
- History: `broker history AAPL --period 30d --bar 1d`
- Option chain: `broker chain AAPL --expiry 2026-03 --strike-range 0.9:1.1 --type call`

### Portfolio

- Positions: `broker positions`
- Single symbol positions: `broker positions --symbol AAPL`
- PnL: `broker pnl --today`
- Balance: `broker balance`
- Exposure: `broker exposure --by symbol`

### Orders

- Buy: `broker order buy AAPL 5 --limit 180 --tif DAY`
- Sell: `broker order sell AAPL 5 --limit 190 --tif DAY`
- Bracket: `broker order bracket AAPL 5 --entry 180 --tp 190 --sl 175 --side buy --tif DAY`
- Order status: `broker order status <client-order-id>`
- List orders: `broker orders --status all`
- Fills: `broker fills --since 2026-01-01`
- Cancel one: `broker cancel <client-order-id>`
- Cancel all: `broker cancel --all --confirm`

### Risk

- Dry run: `broker risk check --side buy --symbol AAPL --qty 10 --limit 180`
- Limits: `broker risk limits`
- Set limit: `broker risk set <param> <value>`
- Halt: `broker risk halt`
- Resume: `broker risk resume`
- Temporary override: `broker risk override --param <param> --value <value> --duration 30m --reason "..."`

### Agent / Streams

- Heartbeat: `broker agent heartbeat`
- Event stream (JSONL): `broker agent subscribe --topics orders,fills,positions,pnl,risk,connection`

### Audit

- Orders audit: `broker audit orders --since 2026-01-01`
- Commands audit: `broker audit commands --since 2026-01-01`
- Risk audit: `broker audit risk`
- Export CSV: `broker audit export --table orders --format csv --output /tmp/orders.csv`

## Execution Pattern

For non-trade broker workflows (market/audit/monitoring):

1. Run requested command set directly.
2. Keep outputs structured and scoped to the user question.
3. Call out anomalies requiring risk review.

## Output Contract

After completing a broker workflow, return:

- `commands`: exact commands executed in order;
- `results`: key structured fields (order IDs, status, qty, avg price, exposure changes, risk decisions);
- `risk`: pass/fail state and blockers (if any);
- `failures`: exact errors and mitigation;
- `next`: one concrete follow-up command, or `none`.
