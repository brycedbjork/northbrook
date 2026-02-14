import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reference — broker-cli",
  description:
    "Complete command reference for broker-cli. Every command, flag, and option documented.",
};

function Cmd({
  name,
  description,
  usage,
  flags,
  example,
  notes,
}: {
  name: string;
  description: string;
  usage: string;
  flags?: { flag: string; description: string; default?: string }[];
  example?: string;
  notes?: string;
}) {
  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-5 py-4 bg-[var(--card)]">
        <div className="flex items-baseline gap-3 mb-1">
          <code className="text-[var(--accent)] font-semibold text-sm">
            {name}
          </code>
        </div>
        <p className="text-sm text-[var(--muted)]">{description}</p>
      </div>
      <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--background)]">
        <pre className="text-sm font-mono text-[var(--foreground)] overflow-x-auto">
          {usage}
        </pre>
      </div>
      {flags && flags.length > 0 && (
        <div className="px-5 py-3 border-t border-[var(--border)]">
          <table className="w-full text-sm">
            <tbody>
              {flags.map((f) => (
                <tr key={f.flag} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-1.5 pr-4 font-mono text-[var(--foreground)] whitespace-nowrap">
                    {f.flag}
                  </td>
                  <td className="py-1.5 text-[var(--muted)]">
                    {f.description}
                    {f.default && (
                      <span className="ml-2 text-xs opacity-60">
                        (default: {f.default})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {example && (
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--card)]">
          <pre className="text-sm font-mono text-[var(--muted)] overflow-x-auto whitespace-pre-wrap">
            {example}
          </pre>
        </div>
      )}
      {notes && (
        <div className="px-5 py-3 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted)] leading-relaxed">{notes}</p>
        </div>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-bold mb-1">{title}</h2>
      {description && (
        <p className="text-sm text-[var(--muted)] mb-5">{description}</p>
      )}
      {!description && <div className="mb-5" />}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const sections = [
  { id: "daemon", label: "Daemon" },
  { id: "auth", label: "Auth" },
  { id: "market", label: "Market Data" },
  { id: "orders", label: "Orders" },
  { id: "portfolio", label: "Portfolio" },
  { id: "risk", label: "Risk" },
  { id: "audit", label: "Audit" },
  { id: "config", label: "Configuration" },
];

export default function ReferencePage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12 flex gap-12">
      {/* Sidebar nav */}
      <nav className="hidden lg:block w-48 shrink-0 sticky top-20 self-start">
        <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          Sections
        </p>
        <ul className="space-y-1.5">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-16">
        <div>
          <h1 className="text-3xl font-bold mb-2">Command Reference</h1>
          <p className="text-[var(--muted)]">
            Complete reference for every broker-cli command. All commands output JSON by default.
          </p>
        </div>

        {/* Daemon */}
        <Section
          id="daemon"
          title="Daemon"
          description="Manage the broker daemon process. The daemon maintains the broker connection and handles all API communication."
        >
          <Cmd
            name="broker daemon start"
            description="Start the trading daemon and wait for socket readiness."
            usage="broker daemon start [OPTIONS]"
            flags={[
              { flag: "--paper", description: "Use paper trading port (4002)" },
              { flag: "--gateway HOST:PORT", description: "Override gateway endpoint" },
              { flag: "--client-id INT", description: "Override IB client ID" },
            ]}
            example={`$ broker daemon start\n{"ok": true, "socket": "~/.local/state/broker/broker.sock"}\n\n$ broker daemon start --paper\n{"ok": true, "socket": "~/.local/state/broker/broker.sock"}`}
          />
          <Cmd
            name="broker daemon stop"
            description="Request graceful daemon shutdown."
            usage="broker daemon stop"
            example={`$ broker daemon stop\n{"ok": true}`}
          />
          <Cmd
            name="broker daemon status"
            description="Show daemon uptime, broker connection state, and risk halt status."
            usage="broker daemon status"
            example={`$ broker daemon status\n{"uptime": 3421, "connected": true, "provider": "etrade", "halted": false}`}
          />
          <Cmd
            name="broker daemon restart"
            description="Stop then start the daemon."
            usage="broker daemon restart [OPTIONS]"
            flags={[
              { flag: "--paper", description: "Restart using paper trading port" },
            ]}
          />
        </Section>

        {/* Auth */}
        <Section
          id="auth"
          title="Authentication"
          description="Authenticate with broker providers. Tokens are stored locally and used by the daemon."
        >
          <Cmd
            name="broker auth etrade"
            description="Interactive OAuth flow for E*Trade. Opens a URL, prompts for verification code, and stores tokens."
            usage="broker auth etrade [OPTIONS]"
            flags={[
              { flag: "--consumer-key KEY", description: "E*Trade consumer key" },
              { flag: "--consumer-secret SECRET", description: "E*Trade consumer secret" },
              { flag: "--sandbox", description: "Use E*Trade sandbox API" },
            ]}
            example={`$ broker auth etrade\nOpen this URL in your browser, sign in, and approve access:\nhttps://us.etrade.com/e/t/etws/authorize?key=...&token=...\nEnter E*Trade verification code: A1B2C3\n{"ok": true, "token_path": "~/.config/broker/etrade_tokens.json"}`}
            notes="For headless/agent use, enable persistent_auth in config to auto-refresh tokens at midnight ET. Accounts with 2FA cannot use persistent auth."
          />
        </Section>

        {/* Market Data */}
        <Section
          id="market"
          title="Market Data"
          description="Real-time quotes, streaming, option chains, and historical bars."
        >
          <Cmd
            name="broker quote"
            description="Snapshot quote for one or more symbols."
            usage="broker quote SYMBOL [SYMBOL...]"
            example={`$ broker quote AAPL MSFT\n[\n  {"symbol": "AAPL", "bid": 185.20, "ask": 185.25, "last": 185.22, "volume": 48291033},\n  {"symbol": "MSFT", "bid": 412.10, "ask": 412.15, "last": 412.12, "volume": 22104891}\n]`}
          />
          <Cmd
            name="broker watch"
            description="Continuously refresh quote fields in the terminal. Ctrl+C to stop."
            usage="broker watch SYMBOL [OPTIONS]"
            flags={[
              {
                flag: "--fields FIELDS",
                description: "Comma-separated: bid, ask, last, volume, timestamp, exchange, currency, symbol",
                default: "bid,ask,last,volume",
              },
              { flag: "--interval INTERVAL", description: "Refresh rate (e.g. 250ms, 1s, 2m)", default: "1s" },
            ]}
            example={`$ broker watch AAPL --fields bid,ask,last --interval 500ms`}
          />
          <Cmd
            name="broker chain"
            description="Fetch an option chain with optional expiry, strike range, and type filters. Includes greeks."
            usage="broker chain SYMBOL [OPTIONS]"
            flags={[
              { flag: "--expiry YYYY-MM", description: "Filter by expiration month" },
              { flag: "--strike-range LOW:HIGH", description: "Ratio range around current price (e.g. 0.9:1.1)" },
              { flag: "--type call|put", description: "Filter by option type" },
            ]}
            example={`$ broker chain AAPL --type call --expiry 2026-03\n[\n  {\n    "symbol": "AAPL260320C185",\n    "expiry": "2026-03-20",\n    "strike": 185.0,\n    "type": "call",\n    "bid": 4.20,\n    "ask": 4.35,\n    "delta": 0.52,\n    "gamma": 0.04,\n    "theta": -0.08,\n    "vega": 0.31,\n    "iv": 0.28\n  },\n  ...\n]`}
          />
          <Cmd
            name="broker history"
            description="Fetch historical price bars for a symbol."
            usage="broker history SYMBOL --period PERIOD --bar SIZE [OPTIONS]"
            flags={[
              { flag: "--period 1d|5d|30d|90d|1y", description: "Lookback period" },
              { flag: "--bar 1m|5m|15m|1h|1d", description: "Bar size" },
              { flag: "--rth-only", description: "Restrict to regular trading hours" },
            ]}
            example={`$ broker history AAPL --period 5d --bar 1h`}
            notes="Available on Interactive Brokers only."
          />
        </Section>

        {/* Orders */}
        <Section
          id="orders"
          title="Orders"
          description="Place, monitor, and cancel orders. Supports market, limit, stop, and bracket orders."
        >
          <Cmd
            name="broker order buy"
            description="Place a buy order. Market by default unless --limit or --stop is set."
            usage="broker order buy SYMBOL QTY [OPTIONS]"
            flags={[
              { flag: "--limit PRICE", description: "Limit price (creates limit order)" },
              { flag: "--stop PRICE", description: "Stop trigger price (creates stop order)" },
              { flag: "--tif DAY|GTC|IOC", description: "Time in force", default: "DAY" },
            ]}
            example={`$ broker order buy AAPL 100 --limit 185.00\n{"order_id": "a1b2c3", "status": "submitted", "symbol": "AAPL", "side": "buy", "qty": 100, "limit": 185.0}\n\n$ broker order buy TSLA 50\n{"order_id": "d4e5f6", "status": "submitted", "symbol": "TSLA", "side": "buy", "qty": 50, "type": "market"}`}
          />
          <Cmd
            name="broker order sell"
            description="Place a sell order. Market by default unless --limit or --stop is set."
            usage="broker order sell SYMBOL QTY [OPTIONS]"
            flags={[
              { flag: "--limit PRICE", description: "Limit price" },
              { flag: "--stop PRICE", description: "Stop trigger price" },
              { flag: "--tif DAY|GTC|IOC", description: "Time in force", default: "DAY" },
            ]}
            example={`$ broker order sell AAPL 50 --limit 190.00 --tif GTC`}
          />
          <Cmd
            name="broker order bracket"
            description="Place a bracket order: entry + take profit + stop loss."
            usage="broker order bracket SYMBOL QTY --entry PRICE --tp PRICE --sl PRICE [OPTIONS]"
            flags={[
              { flag: "--entry PRICE", description: "Entry limit price (required)" },
              { flag: "--tp PRICE", description: "Take-profit price (required)" },
              { flag: "--sl PRICE", description: "Stop-loss price (required)" },
              { flag: "--side buy|sell", description: "Order side", default: "buy" },
              { flag: "--tif DAY|GTC|IOC", description: "Time in force", default: "DAY" },
            ]}
            example={`$ broker order bracket AAPL 100 --entry 185 --tp 195 --sl 180`}
            notes="Available on Interactive Brokers only."
          />
          <Cmd
            name="broker order status"
            description="Show status for a single order by client order ID."
            usage="broker order status ORDER_ID"
            example={`$ broker order status a1b2c3\n{"order_id": "a1b2c3", "status": "filled", "filled_qty": 100, "avg_price": 185.02}`}
          />
          <Cmd
            name="broker orders"
            description="List orders with optional status and date filters."
            usage="broker orders [OPTIONS]"
            flags={[
              { flag: "--status active|filled|cancelled|all", description: "Filter by status", default: "all" },
              { flag: "--since YYYY-MM-DD", description: "Filter by date" },
            ]}
            example={`$ broker orders --status active`}
          />
          <Cmd
            name="broker cancel"
            description="Cancel a single order by ID, or all open orders with --all."
            usage="broker cancel [ORDER_ID] [OPTIONS]"
            flags={[
              { flag: "--all", description: "Cancel all open orders" },
              { flag: "--confirm", description: "Required with --all in interactive mode" },
            ]}
            example={`$ broker cancel a1b2c3\n{"ok": true, "cancelled": "a1b2c3"}\n\n$ broker cancel --all\n{"ok": true, "cancelled": 3, "failed": 0}`}
          />
          <Cmd
            name="broker fills"
            description="List fill/execution history."
            usage="broker fills [OPTIONS]"
            flags={[
              { flag: "--since YYYY-MM-DD", description: "Filter by date" },
              { flag: "--symbol SYMBOL", description: "Filter by symbol" },
            ]}
            example={`$ broker fills --since 2026-02-01 --symbol AAPL`}
          />
        </Section>

        {/* Portfolio */}
        <Section
          id="portfolio"
          title="Portfolio"
          description="Positions, P&L, balances, and exposure analysis."
        >
          <Cmd
            name="broker positions"
            description="Show current positions with unrealized P&L."
            usage="broker positions [OPTIONS]"
            flags={[
              { flag: "--symbol SYMBOL", description: "Filter to a single symbol" },
            ]}
            example={`$ broker positions\n[\n  {"symbol": "AAPL", "qty": 200, "avg_cost": 178.50, "market_value": 37044.00, "unrealized_pnl": 344.00},\n  {"symbol": "MSFT", "qty": 100, "avg_cost": 405.20, "market_value": 41212.00, "unrealized_pnl": 692.00}\n]`}
          />
          <Cmd
            name="broker pnl"
            description="Show P&L summary for today, a named period, or since a specific date."
            usage="broker pnl [OPTIONS]"
            flags={[
              { flag: "--today", description: "Today's P&L window" },
              { flag: "--period PERIOD", description: "Named period (e.g. 7d)" },
              { flag: "--since YYYY-MM-DD", description: "Custom start date" },
            ]}
            example={`$ broker pnl --today\n{"realized": 1250.00, "unrealized": 1036.00, "total": 2286.00}`}
            notes="Only one of --today, --period, or --since can be used. Defaults to --today."
          />
          <Cmd
            name="broker balance"
            description="Show account balances and margin metrics."
            usage="broker balance"
            example={`$ broker balance\n{"nlv": 125000.00, "cash": 42000.00, "buying_power": 84000.00, "margin_used": 41000.00}`}
          />
          <Cmd
            name="broker exposure"
            description="Show portfolio exposure grouped by dimension. Returns percentage of net liquidation value."
            usage="broker exposure [OPTIONS]"
            flags={[
              {
                flag: "--by symbol|sector|asset_class|currency",
                description: "Grouping dimension",
                default: "symbol",
              },
            ]}
            example={`$ broker exposure --by symbol\n[\n  {"group": "AAPL", "exposure_pct": 29.6, "market_value": 37044.00},\n  {"group": "MSFT", "exposure_pct": 33.0, "market_value": 41212.00},\n  {"group": "cash", "exposure_pct": 37.4, "market_value": 46744.00}\n]\n\n$ broker exposure --by sector\n[\n  {"group": "Technology", "exposure_pct": 62.6},\n  {"group": "cash", "exposure_pct": 37.4}\n]`}
          />
        </Section>

        {/* Risk */}
        <Section
          id="risk"
          title="Risk Management"
          description="Pre-trade risk checks, runtime limits, emergency controls, and temporary overrides."
        >
          <Cmd
            name="broker risk check"
            description="Dry-run an order against risk limits without submitting. Use to validate before placing."
            usage="broker risk check --side SIDE --symbol SYMBOL --qty QTY [OPTIONS]"
            flags={[
              { flag: "--side buy|sell", description: "Order side (required)" },
              { flag: "--symbol SYMBOL", description: "Ticker symbol (required)" },
              { flag: "--qty QTY", description: "Quantity to evaluate (required)" },
              { flag: "--limit PRICE", description: "Limit price" },
              { flag: "--stop PRICE", description: "Stop trigger price" },
              { flag: "--tif DAY|GTC|IOC", description: "Time in force", default: "DAY" },
            ]}
            example={`$ broker risk check --side buy --symbol AAPL --qty 500\n{"allowed": true, "checks": {"max_order_size": "pass", "concentration": "pass", "buying_power": "pass"}}\n\n$ broker risk check --side buy --symbol AAPL --qty 50000\n{"allowed": false, "checks": {"max_order_size": "fail"}, "reason": "qty 50000 exceeds max_order_size 10000"}`}
          />
          <Cmd
            name="broker risk limits"
            description="Show current runtime risk limit parameters."
            usage="broker risk limits"
            example={`$ broker risk limits\n{"max_order_size": 10000, "max_position_pct": 0.35, "max_daily_loss": 5000, "max_open_orders": 50}`}
          />
          <Cmd
            name="broker risk set"
            description="Update a risk limit parameter at runtime."
            usage="broker risk set PARAM VALUE"
            example={`$ broker risk set max_order_size 5000\n{"max_order_size": 5000, ...}`}
          />
          <Cmd
            name="broker risk halt"
            description="Emergency halt: cancels all open orders and rejects new orders until resumed."
            usage="broker risk halt"
            example={`$ broker risk halt\n{"ok": true, "halted": true, "cancelled": 4}`}
          />
          <Cmd
            name="broker risk resume"
            description="Resume normal trading after a risk halt."
            usage="broker risk resume"
            example={`$ broker risk resume\n{"ok": true, "halted": false}`}
          />
          <Cmd
            name="broker risk override"
            description="Apply a temporary risk limit override. Requires a reason and duration for audit trail."
            usage="broker risk override PARAM VALUE --reason TEXT --duration DURATION"
            flags={[
              { flag: "--reason TEXT", description: "Required explanation for the override" },
              { flag: "--duration DURATION", description: "How long the override lasts (e.g. 1h, 30m)" },
            ]}
            example={`$ broker risk override max_order_size 25000 --reason "large rebalance" --duration 1h`}
          />
        </Section>

        {/* Audit */}
        <Section
          id="audit"
          title="Audit"
          description="Query order history, command invocations, and risk events. Export to CSV."
        >
          <Cmd
            name="broker audit orders"
            description="Query order lifecycle records from audit storage."
            usage="broker audit orders [OPTIONS]"
            flags={[
              { flag: "--since YYYY-MM-DD", description: "Filter by date" },
              { flag: "--status active|filled|cancelled|all", description: "Filter by status" },
            ]}
          />
          <Cmd
            name="broker audit commands"
            description="Query command invocation audit records."
            usage="broker audit commands [OPTIONS]"
            flags={[
              { flag: "--source cli|sdk|ts_sdk", description: "Filter by source" },
              { flag: "--since YYYY-MM-DD", description: "Filter by date" },
            ]}
          />
          <Cmd
            name="broker audit risk"
            description="Query risk event audit records (halts, overrides, limit violations)."
            usage="broker audit risk [OPTIONS]"
          />
          <Cmd
            name="broker audit export"
            description="Export audit rows to CSV."
            usage="broker audit export --table TABLE [OPTIONS]"
            flags={[
              { flag: "--table orders|commands|risk", description: "Which audit table to export" },
              { flag: "--format csv", description: "Output format", default: "csv" },
            ]}
          />
        </Section>

        {/* Configuration */}
        <Section
          id="config"
          title="Configuration"
          description="broker-cli uses a JSON config file and supports environment variable overrides."
        >
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-5 py-4 bg-[var(--card)]">
              <h3 className="font-semibold text-sm mb-2">Config file</h3>
              <p className="text-sm text-[var(--muted)]">
                Default location:{" "}
                <code className="text-[var(--foreground)]">
                  ~/.config/broker/config.json
                </code>
              </p>
            </div>
            <div className="px-5 py-4 border-t border-[var(--border)]">
              <pre className="text-sm font-mono text-[var(--muted)] overflow-x-auto whitespace-pre">{`{
  "broker": {
    "provider": "etrade",
    "etrade": {
      "consumer_key": "...",
      "consumer_secret": "...",
      "persistent_auth": true,
      "username": "...",
      "password": "...",
      "sandbox": false
    },
    "ibkr": {
      "gateway_host": "127.0.0.1",
      "gateway_port": 4001,
      "client_id": 1
    }
  }
}`}</pre>
            </div>
          </div>

          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-5 py-4 bg-[var(--card)]">
              <h3 className="font-semibold text-sm mb-2">
                Environment variables
              </h3>
              <p className="text-sm text-[var(--muted)]">
                Environment variables override config file values.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)]">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ["BROKER_PROVIDER", "Provider name (etrade, ibkr)"],
                    ["BROKER_ETRADE_CONSUMER_KEY", "E*Trade consumer key"],
                    ["BROKER_ETRADE_CONSUMER_SECRET", "E*Trade consumer secret"],
                    ["BROKER_ETRADE_USERNAME", "E*Trade username (persistent auth)"],
                    ["BROKER_ETRADE_PASSWORD", "E*Trade password (persistent auth)"],
                    ["BROKER_ETRADE_PERSISTENT_AUTH", "Enable persistent auth (true/false)"],
                    ["BROKER_GATEWAY_HOST", "IB gateway host"],
                    ["BROKER_GATEWAY_PORT", "IB gateway port (4001=live, 4002=paper)"],
                    ["BROKER_GATEWAY_CLIENT_ID", "IB client ID"],
                  ].map(([name, desc]) => (
                    <tr key={name} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5 pr-4 font-mono text-[var(--foreground)] whitespace-nowrap text-xs">
                        {name}
                      </td>
                      <td className="py-1.5 text-[var(--muted)]">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-5 py-4 bg-[var(--card)]">
              <h3 className="font-semibold text-sm mb-2">File locations</h3>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)]">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ["Config", "~/.config/broker/config.json"],
                    ["E*Trade tokens", "~/.config/broker/etrade_tokens.json"],
                    ["Daemon socket", "~/.local/state/broker/broker.sock"],
                    ["Daemon log", "~/.local/state/broker/broker.log"],
                    ["Audit data", "~/.local/share/broker/"],
                  ].map(([label, path]) => (
                    <tr key={label} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5 pr-4 text-[var(--foreground)] whitespace-nowrap">
                        {label}
                      </td>
                      <td className="py-1.5 font-mono text-[var(--muted)] text-xs">
                        {path}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

      </div>
    </div>
  );
}
