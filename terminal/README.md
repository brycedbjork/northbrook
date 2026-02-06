# Northbrook Terminal — Architecture

The terminal is a full-screen TUI (Terminal User Interface) that acts as a command center for observing agents, monitoring the portfolio, and enacting strategy. It is the human interface layer of the Northbrook system.

## Technology choices

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Renderer | **Ink v5** (React for CLIs) | Component model, flexbox layout, hooks, focus management. The most mature TS-native TUI framework. |
| State | **Zustand** | Minimal boilerplate, works outside React (store actions callable from hooks, timers, streams). Single store with domain slices. |
| Data | **@northbrook/broker-sdk-typescript** | Existing typed SDK with msgpack framing, request/response + streaming. Zero duplication. |
| Styling | Custom theme module | Centralized color palette, Unicode symbols, box-drawing chars. No runtime CSS. |
| Build | **TypeScript 5.7**, ESM, `tsx` for dev | Matches the SDK's compilation target. `tsx` gives instant reload during development. |

## Package structure

```
terminal/
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md
└── src/
    ├── main.tsx                  # Entry point, CLI arg parsing, render()
    ├── app.tsx                   # Root component: routing, polling, streaming
    │
    ├── store/                    # Zustand state management
    │   ├── types.ts              # State shape interfaces (slices)
    │   └── index.ts              # Store creation, useTerminal() hook
    │
    ├── hooks/                    # React hooks
    │   ├── use-broker.ts         # Lazy SDK client access
    │   ├── use-stream.ts         # Event subscription + auto-reconnect
    │   ├── use-polling.ts        # Periodic data refresh (5s default)
    │   └── use-keybinds.ts       # Global keyboard shortcut dispatch
    │
    ├── screens/                  # Full-screen views (one active at a time)
    │   ├── dashboard.tsx         # Multi-panel command center overview
    │   ├── orders.tsx            # Order management + fill history
    │   ├── strategy.tsx          # Strategy deployment + monitoring
    │   ├── risk.tsx              # Risk limits, halting, overrides
    │   ├── agents.tsx            # Agent fleet observation
    │   └── audit.tsx             # Audit log browser
    │
    ├── panels/                   # Composable data panels (used across screens)
    │   ├── positions.tsx         # Portfolio positions table
    │   ├── pnl.tsx               # P&L summary with directional arrows
    │   ├── balance.tsx           # Account balance + margin gauge
    │   ├── order-book.tsx        # Active orders table
    │   ├── event-feed.tsx        # Live event stream (color-coded by topic)
    │   ├── risk-status.tsx       # Risk gauges + halted indicator
    │   └── agent-status.tsx      # Agent heartbeats, roles, tasks
    │
    ├── components/               # Shared UI primitives
    │   ├── panel.tsx             # Bordered box with title + focus highlight
    │   ├── table.tsx             # Aligned columnar data with selection
    │   ├── header.tsx            # Top bar with screen tabs
    │   ├── status-bar.tsx        # Bottom bar: connection, toasts, key hints
    │   ├── sparkline.tsx         # Inline Unicode mini-chart
    │   ├── gauge.tsx             # Horizontal usage bar (margin, risk)
    │   ├── badge.tsx             # Colored status label
    │   └── help-overlay.tsx      # Modal with all key bindings
    │
    └── lib/                      # Utilities (no React)
        ├── broker.ts             # SDK client singleton
        ├── format.ts             # Number, currency, time, duration formatting
        ├── theme.ts              # Color palette, Unicode symbols, border styles
        └── keymap.ts             # Key binding definitions + screen map
```

## Data flow

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                         Daemon (Python)                         │
  │  IB Gateway ←→ OrderManager ←→ RiskEngine ←→ AuditLogger       │
  └───────────────────┬────────────────┬─────────────────────────────┘
                      │ req/resp       │ event stream
                      │ (msgpack)      │ (msgpack, long-lived)
  ┌───────────────────┴────────────────┴─────────────────────────────┐
  │                    TypeScript SDK (Client)                       │
  │  .positions() .orders() .riskLimits()   .subscribe(topics)      │
  └───────────────────┬────────────────┬─────────────────────────────┘
                      │                │
              ┌───────┴──────┐  ┌──────┴──────┐
              │  usePolling  │  │  useStream  │
              │  (5s timer)  │  │  (async gen)│
              └───────┬──────┘  └──────┬──────┘
                      │                │
              ┌───────┴────────────────┴──────┐
              │        Zustand Store          │
              │  portfolio │ orders │ risk    │
              │  agents    │ events │ UI      │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │     useTerminal(selector)     │
              │     React re-renders          │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │          Ink Renderer          │
              │   Header → Screen → StatusBar │
              │   (flexbox layout to stdout)  │
              └───────────────────────────────┘
```

## Screens

### 1. Dashboard (default)

The primary view. Six panels in a two-column layout:

```
┌──────────────────────────────────┬─────────────────┐
│           Positions              │      P&L        │
│  symbol  qty  cost  mkt  unrlPL │  realized  ↑    │
│  AAPL    100  150   155  +500   │  unrealized ↓   │
│  TSLA    -50  200   195  +250   │  total      →   │
├────────────────┬─────────────────┤─────────────────│
│ Active Orders  │   Event Feed   │    Account      │
│ time side sym  │ 14:23 fill ... │  NLV   $50,000  │
│ ...            │ 14:22 order ..│  Cash  $12,000  │
│                │ 14:21 risk ... │  Margin ████░ 40%│
│                │                ├─────────────────│
│                │                │      Risk       │
│                │                │  Position ███░  │
│                │                │  Loss     ██░░  │
└────────────────┴────────────────┴─────────────────┘
```

### 2. Orders

Full order blotter with all fields, plus recent fills table below.

### 3. Strategy

Strategy deployment view. Shows configured strategies, their assigned agents, allocation percentages, trade counts, and P&L attribution. Supports deploy/pause/stop actions.

### 4. Risk

Risk limit configuration with current values, gauges for utilization, halted state banner, and allowlist/blocklist display.

### 5. Agents

Agent fleet view. Shows manager, trader(s), and analyst(s) with heartbeat status, latency, current task descriptions. Includes the event feed filtered by agent activity.

### 6. Audit

Scrollable audit log browser showing all commands executed against the daemon, with source, arguments, and result codes.

## Key bindings

| Key | Action |
|-----|--------|
| `1`-`6` | Switch screen |
| `Tab` | Cycle focused panel |
| `?` | Toggle help overlay |
| `:` | Open command palette |
| `q` | Quit |
| `r` | Refresh all data (dashboard) |
| `n` | New order/strategy (context) |
| `c` / `C` | Cancel selected / cancel all (orders) |
| `j` / `k` | Navigate rows |
| `Enter` | View details |
| `h` / `H` | Halt / resume trading (risk) |
| `Esc` | Close overlay |

## State slices

| Slice | Responsibility | Update source |
|-------|---------------|---------------|
| `PortfolioSlice` | positions, balance, P&L, exposure | Polling (5s) |
| `OrdersSlice` | orders, fills, selection | Polling + events |
| `RiskSlice` | limits, halted, overrides | Polling + events |
| `AgentsSlice` | agent registry, heartbeats | Agent registration API |
| `EventsSlice` | ring buffer of recent events | Stream subscription |
| `ConnectionSlice` | daemon status, connectivity | Polling + heartbeat |
| `UISlice` | active screen, focus, modals, toasts | User input |

## Future extensions

- **Command palette** (`:` key): fuzzy-search over all available commands (quote, order, risk set, etc.) with inline parameter input
- **ASCII price charts**: sparklines are implemented; full candlestick charts via `asciichart` for the strategy detail view
- **Agent messaging**: send directives to agents from the terminal (e.g., "increase AAPL allocation to 5%")
- **Strategy backtesting**: inline backtest results display with equity curve
- **Multi-account**: tab between accounts when multiple IB sessions are connected
- **Alerts**: configurable threshold alerts with desktop notifications
