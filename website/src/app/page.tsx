"use client";

import { useState, useEffect } from "react";

const INSTALL_CMD = "curl -fsSL brokercli.com/install | bash";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function GitHubLink() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/north-brook/broker-cli")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.stargazers_count === "number")
          setStars(d.stargazers_count);
      })
      .catch(() => {});
  }, []);

  return (
    <a
      href="https://github.com/north-brook/broker-cli"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent-dim)] transition-all backdrop-blur-sm"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      {stars !== null && (
        <span className="flex items-center gap-1">
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3.5 h-3.5 text-yellow-500"
          >
            <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
          </svg>
          <span className="font-mono text-xs">{stars}</span>
        </span>
      )}
    </a>
  );
}

const features = [
  {
    title: "Agent-Native",
    description:
      "Built for AI agents and coding assistants. Ships with SKILL.md so Codex, Claude Code, and other agents can trade autonomously.",
    icon: "🤖",
  },
  {
    title: "Multi-Broker",
    description:
      "Unified interface for E*Trade and Interactive Brokers. Switch providers without changing your code or agent prompts.",
    icon: "⚡",
  },
  {
    title: "Option Chains",
    description:
      "Full option chain data with greeks, expiry filtering, and strike ranges. Built for derivatives strategies.",
    icon: "📊",
  },
  {
    title: "Exposure Analysis",
    description:
      "Real-time portfolio exposure grouped by symbol, currency, sector, or asset class. Know your risk at a glance.",
    icon: "🎯",
  },
  {
    title: "Order Management",
    description:
      "Place, monitor, and cancel orders. Bulk cancel-all for open orders when you need to flatten fast.",
    icon: "📋",
  },
  {
    title: "Persistent Auth",
    description:
      "Headless re-authentication keeps sessions alive 24/7. No manual browser logins interrupting your agents.",
    icon: "🔐",
  },
];

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-20">
      <GitHubLink />

      {/* Hero */}
      <section className="text-center mb-24">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
          broker-cli
        </h1>
        <p className="text-xl text-[var(--muted)] mb-4 max-w-2xl mx-auto">
          The trading CLI built for AI agents.
        </p>
        <p className="text-base text-[var(--muted)] mb-12 max-w-2xl mx-auto">
          Connect to brokerages, manage portfolios, and execute strategies — from
          your terminal or from your agent&apos;s tool calls. Ships with{" "}
          <code className="text-[var(--accent)] bg-[var(--card)] px-1.5 py-0.5 rounded text-sm">
            SKILL.md
          </code>{" "}
          so coding agents know how to use it out of the box.
        </p>

        {/* Install command */}
        <div className="inline-flex items-center gap-3 bg-[var(--card)] border border-[var(--border)] rounded-lg px-5 py-4 font-mono text-sm sm:text-base">
          <span className="text-[var(--accent)]">$</span>
          <code className="select-all">{INSTALL_CMD}</code>
          <CopyButton text={INSTALL_CMD} />
        </div>

        <div className="mt-6 flex items-center justify-center gap-6 text-sm text-[var(--muted)]">
          <a
            href="https://github.com/north-brook/broker-cli"
            className="hover:text-[var(--foreground)] transition-colors"
          >
            GitHub ↗
          </a>
          <span>·</span>
          <span>Open Source</span>
          <span>·</span>
          <span>Python 3.12+</span>
        </div>
      </section>

      {/* Features */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
        {features.map((f) => (
          <div
            key={f.title}
            className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--accent-dim)] transition-colors"
          >
            <div className="text-2xl mb-3">{f.icon}</div>
            <h3 className="font-semibold mb-2">{f.title}</h3>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              {f.description}
            </p>
          </div>
        ))}
      </section>

      {/* Examples */}
      <section className="mb-24">
        <h2 className="text-2xl font-bold mb-2">Examples</h2>
        <p className="text-[var(--muted)] mb-6">
          Use from the command line, a Python script, or let your AI agent drive.
        </p>
        <div className="space-y-6">
          {/* CLI examples */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              Command Line
            </h3>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5 font-mono text-sm overflow-x-auto space-y-3">
              <div>
                <p className="text-[var(--muted)]"># Start the daemon</p>
                <p>
                  <span className="text-[var(--accent)]">$</span> broker daemon
                  start
                </p>
              </div>
              <div>
                <p className="text-[var(--muted)]"># View positions</p>
                <p>
                  <span className="text-[var(--accent)]">$</span> broker
                  portfolio
                </p>
              </div>
              <div>
                <p className="text-[var(--muted)]">
                  # Get AAPL call options expiring this month
                </p>
                <p>
                  <span className="text-[var(--accent)]">$</span> broker
                  option-chain AAPL --type call --expiry 2026-02
                </p>
              </div>
              <div>
                <p className="text-[var(--muted)]">
                  # Check exposure by symbol
                </p>
                <p>
                  <span className="text-[var(--accent)]">$</span> broker
                  exposure --by symbol
                </p>
              </div>
              <div>
                <p className="text-[var(--muted)]"># Cancel all open orders</p>
                <p>
                  <span className="text-[var(--accent)]">$</span> broker
                  cancel-all
                </p>
              </div>
              <div>
                <p className="text-[var(--muted)]">
                  # Place a limit order
                </p>
                <p>
                  <span className="text-[var(--accent)]">$</span> broker order
                  buy AAPL 100 --limit 185.50
                </p>
              </div>
            </div>
          </div>

          {/* Python SDK */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              Python SDK
            </h3>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5 font-mono text-sm overflow-x-auto">
              <pre className="text-[var(--foreground)]">
                <span className="text-[var(--accent)]">from</span>{" "}
                broker_cli{" "}
                <span className="text-[var(--accent)]">import</span> Broker
                {"\n\n"}
                broker = Broker()
                {"\n\n"}
                <span className="text-[var(--muted)]">
                  # Get portfolio positions
                </span>
                {"\n"}
                positions = broker.portfolio()
                {"\n"}
                <span className="text-[var(--accent)]">for</span> p{" "}
                <span className="text-[var(--accent)]">in</span> positions:
                {"\n"}
                {"    "}print(f<span className="text-yellow-500">
                  &quot;{"{"}p.symbol{"}"}: {"{"}p.quantity{"}"} @ ${"{"}p.market_value:.2f{"}"}&quot;
                </span>)
                {"\n\n"}
                <span className="text-[var(--muted)]">
                  # Check exposure
                </span>
                {"\n"}
                exposure = broker.exposure(by=<span className="text-yellow-500">&quot;symbol&quot;</span>)
                {"\n\n"}
                <span className="text-[var(--muted)]">
                  # Flatten everything
                </span>
                {"\n"}
                broker.cancel_all()
              </pre>
            </div>
          </div>

          {/* Agent usage */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
              AI Agent Integration
            </h3>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5 font-mono text-sm overflow-x-auto">
              <pre className="text-[var(--foreground)]">
                <span className="text-[var(--muted)]">
                  # broker-cli ships with SKILL.md — agents read it automatically
                </span>
                {"\n"}
                <span className="text-[var(--muted)]">
                  # Just point your agent at a trading task:
                </span>
                {"\n\n"}
                <span className="text-[var(--accent)]">$</span> codex exec{" "}
                <span className="text-yellow-500">
                  &quot;Check my portfolio exposure. If any single position is &gt;20% of NLV, reduce it to 15%.&quot;
                </span>
                {"\n\n"}
                <span className="text-[var(--muted)]">
                  # The agent reads SKILL.md, discovers broker-cli commands,
                </span>
                {"\n"}
                <span className="text-[var(--muted)]">
                  # checks exposure, and places orders to rebalance — autonomously.
                </span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Providers table */}
      <section className="mb-24">
        <h2 className="text-2xl font-bold mb-6">Supported Brokers</h2>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-5 py-3 font-semibold">Feature</th>
                <th className="text-center px-5 py-3 font-semibold">
                  Interactive Brokers
                </th>
                <th className="text-center px-5 py-3 font-semibold">
                  E*Trade
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--muted)]">
              {[
                ["Real-time quotes", true, true],
                ["Option chains", true, true],
                ["Market / limit / stop orders", true, true],
                ["Bracket orders", true, false],
                ["Cancel all", true, true],
                ["Positions & P/L", true, true],
                ["Exposure analysis", true, true],
                ["Streaming events", true, false],
                ["Persistent auth", false, true],
                ["Historical bars", true, false],
              ].map(([feature, ib, et]) => (
                <tr
                  key={feature as string}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-5 py-2.5">{feature as string}</td>
                  <td className="text-center px-5 py-2.5">
                    {ib ? "✅" : "—"}
                  </td>
                  <td className="text-center px-5 py-2.5">
                    {et ? "✅" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-[var(--muted)] border-t border-[var(--border)] pt-8">
        <p>
          Built by{" "}
          <a
            href="https://northbrook.com"
            className="hover:text-[var(--foreground)] transition-colors"
          >
            North Brook
          </a>
        </p>
      </footer>
    </main>
  );
}
