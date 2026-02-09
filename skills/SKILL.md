---
name: broker-cli
description: Expanded reference for the broker CLI command surface, including daemon, market data, orders, portfolio, risk, and audit commands. Use when translating trading operations into exact `broker` commands or checking command syntax, flags, defaults, and valid values.
---

# Broker CLI Skill

Use this guide as an expanded Markdown help menu for `broker`.

## Basics

- Run help on any command with `-h` or `--help`.
- Expect JSON output from commands.
- Use command typo suggestions from the CLI if you mistype a command name.

## Top-Level Command Map

```text
broker daemon  ...    # daemon lifecycle
broker quote   ...    # quote snapshot
broker watch   ...    # streaming quote refresh
broker chain   ...    # option chain
broker history ...    # historical bars
broker order   ...    # grouped order commands
broker orders  ...    # list orders (flat command)
broker cancel  ...    # cancel one/all orders (flat command)
broker fills   ...    # fills/executions (flat command)
broker positions ...   # positions
broker pnl       ...   # PnL
broker balance   ...   # account balance/margin
broker exposure  ...   # grouped exposure
broker check     ...   # risk check
broker limits    ...   # risk limits
broker set       ...   # set mutable risk param
broker halt      ...   # emergency halt
broker resume    ...   # resume after halt
broker override  ...   # temporary risk override
broker audit ...      # grouped audit commands
```

## Daemon Commands

### `broker daemon start`

Start `broker-daemon` and wait for socket readiness.

```bash
broker daemon start [--gateway HOST:PORT] [--client-id INT] [--paper]
```

- `--gateway`: Override IB gateway endpoint.
- `--client-id`: Override IB client id.
- `--paper`: Force gateway port `4002`.

### `broker daemon stop`

Request graceful daemon shutdown.

```bash
broker daemon stop
```

### `broker daemon status`

Show daemon uptime, IB connection state, and risk halt status.

```bash
broker daemon status
```

### `broker daemon restart`

Stop then start daemon.

```bash
broker daemon restart [--paper]
```

- `--paper`: Restart against gateway port `4002`.

## Market Data Commands

### `broker quote`

Snapshot quote data for one or more symbols.

```bash
broker quote SYMBOL [SYMBOL...]
```

### `broker watch`

Continuously refresh quote fields until interrupted.

```bash
broker watch SYMBOL [--fields CSV] [--interval DURATION]
```

- Default `--fields`: `bid,ask,last,volume`
- Allowed field values:
  - `symbol`, `bid`, `ask`, `last`, `volume`, `timestamp`, `exchange`, `currency`
- `--interval` examples: `250ms`, `1s`, `2m` (must be > 0)

### `broker chain`

Fetch option chain for a symbol, optionally filtered.

```bash
broker chain SYMBOL [--expiry YYYY-MM] [--strike-range LOW:HIGH] [--type call|put]
```

### `broker history`

Fetch historical bars for a symbol.

```bash
broker history SYMBOL --period PERIOD --bar BAR [--rth-only]
```

- `--period` values: `1d`, `5d`, `30d`, `90d`, `1y`
- `--bar` values: `1m`, `5m`, `15m`, `1h`, `1d`
- `--rth-only`: Restrict to regular trading hours

## Order Commands

### `broker order buy`

Place buy order. Market by default unless `--limit` and/or `--stop` is set.

```bash
broker order buy SYMBOL QTY [--limit PRICE] [--stop PRICE] [--tif DAY|GTC|IOC]
```

- `QTY` must be `> 0`.
- Default `--tif`: `DAY`

### `broker order sell`

Place sell order. Market by default unless `--limit` and/or `--stop` is set.

```bash
broker order sell SYMBOL QTY [--limit PRICE] [--stop PRICE] [--tif DAY|GTC|IOC]
```

- `QTY` must be `> 0`.
- Default `--tif`: `DAY`

### `broker order bracket`

Place bracket order (entry + take-profit + stop-loss).

```bash
broker order bracket SYMBOL QTY --entry PRICE --tp PRICE --sl PRICE [--side buy|sell] [--tif DAY|GTC|IOC]
```

- Required: `--entry`, `--tp`, `--sl`
- Default `--side`: `buy`
- Default `--tif`: `DAY`

### `broker order status`

Show status for one client order id.

```bash
broker order status ORDER_ID
```

### `broker orders`

List orders (flat command at root).

```bash
broker orders [--status active|filled|cancelled|all] [--since YYYY-MM-DD]
```

- Default `--status`: `all`

### `broker cancel`

Cancel one order or all open orders.

```bash
broker cancel ORDER_ID
broker cancel --all [--confirm]
```

- Do not pass `ORDER_ID` with `--all`.
- If not using `--all`, `ORDER_ID` is required.
- `--confirm` is required by daemon policy for some `--all` contexts.

### `broker fills`

List fills / execution history.

```bash
broker fills [--since YYYY-MM-DD] [--symbol SYMBOL]
```

## Portfolio Commands

### `broker positions`

Show current positions.

```bash
broker positions [--symbol SYMBOL]
```

### `broker pnl`

Show PnL for today, period, or since date.

```bash
broker pnl [--today | --period 7d | --since YYYY-MM-DD]
```

- Choose only one of `--today`, `--period`, `--since`.
- If none is provided, defaults to `--today`.

### `broker balance`

Show balances and margin metrics.

```bash
broker balance
```

### `broker exposure`

Show exposure grouped by category.

```bash
broker exposure [--by symbol|sector|asset_class|currency]
```

- Default `--by`: `symbol`

## Risk Commands

### `broker check`

Dry-run an order against risk limits (no submission).

```bash
broker check --side buy|sell --symbol SYMBOL --qty QTY [--limit PRICE] [--stop PRICE] [--tif DAY|GTC|IOC]
```

- Required: `--side`, `--symbol`, `--qty`
- `--qty` must be `> 0`
- Default `--tif`: `DAY`

### `broker limits`

Show current runtime risk limits.

```bash
broker limits
```

### `broker set`

Set mutable runtime risk parameter.

```bash
broker set PARAM VALUE
```

- Valid `PARAM` values:
  - `duplicate_window_seconds`
  - `max_daily_loss_pct`
  - `max_open_orders`
  - `max_order_value`
  - `max_position_pct`
  - `max_sector_exposure_pct`
  - `max_single_name_pct`
  - `order_rate_limit`
  - `symbol_allowlist`
  - `symbol_blocklist`

### `broker halt`

Emergency halt (cancel open orders and reject new orders).

```bash
broker halt
```

### `broker resume`

Resume trading after halt.

```bash
broker resume
```

### `broker override`

Apply temporary risk override with required reason and duration.

```bash
broker override --param PARAM --value VALUE --duration DURATION --reason TEXT
```

- Required: all options above.
- `--param` uses same valid values as `broker set`.
- `--duration` accepts:
  - `<int>h` (hours)
  - `<int>m` (minutes)
  - `<int>s` (seconds)
  - `<int>` (seconds)

## Audit Commands

### `broker audit orders`

Query order lifecycle audit rows.

```bash
broker audit orders [--since YYYY-MM-DD] [--status active|filled|cancelled|all]
```

### `broker audit commands`

Query command invocation audit rows.

```bash
broker audit commands [--source cli|sdk|ts_sdk] [--since YYYY-MM-DD]
```

### `broker audit risk`

Query risk event audit rows.

```bash
broker audit risk [--type EVENT_TYPE]
```

### `broker audit export`

Export audit rows to CSV.

```bash
broker audit export --output PATH [--format csv] [--table orders|commands|risk] [--since YYYY-MM-DD] [--status STATUS] [--source SOURCE] [--type EVENT_TYPE]
```

- Required: `--output`
- `--format`: currently `csv` only
- Default `--table`: `orders`
- Optional filters:
  - `--status`: `active|filled|cancelled|all` (order rows)
  - `--source`: `cli|sdk|ts_sdk` (command rows)
  - `--type`: risk event type (risk rows)

## Quick Examples

```bash
broker daemon start --paper
broker quote AAPL MSFT
broker history AAPL --period 5d --bar 15m --rth-only
broker order buy AAPL 10 --limit 180 --tif DAY
broker orders --status active
broker cancel --all --confirm
broker check --side buy --symbol AAPL --qty 25 --limit 180
broker set max_order_value 5000
broker override --param max_order_value --value 10000 --duration 1h --reason "earnings session"
broker audit export --output /tmp/audit.csv --table orders --since 2026-01-01
```
