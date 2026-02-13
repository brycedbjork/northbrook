"use client";

import { useState } from "react";
import {
  BookOpen,
  Zap,
  Lock,
  Shuffle,
  BarChart3,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

function InstallWidget() {
  const [tab, setTab] = useState<"curl" | "pip">("curl");
  const commands = {
    curl: "curl -fsSL brokercli.com/install | bash",
    pip: "pip install broker-cli",
  };

  return (
    <div className="inline-block">
      <div className="flex gap-0 border border-[var(--border)] rounded-t-lg overflow-hidden bg-[var(--card)]">
        {(["curl", "pip"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-mono cursor-pointer transition-colors ${
              tab === t
                ? "bg-[var(--background)] text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t === "curl" ? "One-liner" : "pip"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 bg-[var(--card)] border border-t-0 border-[var(--border)] rounded-b-lg px-5 py-4 font-mono text-sm sm:text-base">
        <span className="text-[var(--accent)]">$</span>
        <code className="select-all">{commands[tab]}</code>
        <CopyButton text={commands[tab]} />
      </div>
    </div>
  );
}

const features = [
  {
    title: "SKILL.md Included",
    description:
      "Ships with a skill file that Codex, Claude Code, and OpenClaw agents read automatically. Your agent knows every command, flag, and workflow without extra prompting.",
    icon: BookOpen,
  },
  {
    title: "CLI-First, Agent-Ready",
    description:
      "Every action is a shell command. Agents don't need SDKs, API keys, or custom integrations — just bash. The universal interface AI already knows.",
    icon: Zap,
  },
  {
    title: "Autonomous Execution",
    description:
      "Persistent auth keeps sessions alive 24/7. No manual logins, no token expiry interruptions. Your agent trades while you sleep.",
    icon: Lock,
  },
  {
    title: "Multi-Broker",
    description:
      "Unified commands across E*Trade and Interactive Brokers. One skill file, one interface — agents switch brokers without relearning anything.",
    icon: Shuffle,
  },
  {
    title: "Full Options Support",
    description:
      "Option chains with greeks, expiry filtering, and strike ranges. Agents can evaluate and execute complex derivatives strategies.",
    icon: BarChart3,
  },
  {
    title: "Risk Guardrails",
    description:
      "Exposure analysis by symbol, sector, or asset class. Cancel-all for instant flattening. Paper trading mode for safe development. Give agents power with built-in safety valves.",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-20">
      {/* Hero */}
      <section className="text-center mb-24">
        <div className="inline-flex items-center gap-2 bg-[var(--card)] border border-[var(--border)] rounded-full px-4 py-1.5 text-sm text-[var(--muted)] mb-8">
          <span className="text-[var(--accent)]">●</span>
          Open source · Works with any AI agent
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
          Give your AI agent{" "}
          <span className="text-[var(--accent)]">
            <br className="sm:hidden" />a brokerage account
          </span>
        </h1>
        <p className="text-lg text-[var(--muted)] mb-12 max-w-2xl mx-auto leading-relaxed">
          Broker APIs exist. SDKs exist. But AI agents use the command line.{" "}
          <span className="text-[var(--foreground)]">broker-cli</span> turns any
          brokerage into shell commands your agent already understands, with a{" "}
          <code className="text-[var(--accent)] bg-[var(--card)] border border-[var(--border)] px-1.5 py-0.5 rounded text-sm">
            SKILL.md
          </code>{" "}
          that teaches it everything.
        </p>

        {/* Install widget */}
        <InstallWidget />

        <div className="mt-6 flex items-center justify-center gap-6 text-sm text-[var(--muted)]">
          <a
            href="https://github.com/north-brook/broker-cli"
            className="hover:text-[var(--foreground)] transition-colors"
          >
            GitHub ↗
          </a>
          <span>·</span>
          <span>Python 3.12+</span>
          <span>·</span>
          <span>E*Trade · Interactive Brokers</span>
        </div>
      </section>

      {/* Hero Demo */}
      <section className="mb-24">
        <div className="max-w-2xl mx-auto rounded-lg overflow-hidden">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-full rounded-lg"
          >
            <source src="/hero-demo.webm" type="video/webm" />
            <source src="/hero-demo.mp4" type="video/mp4" />
          </video>
        </div>
      </section>

      {/* Why CLI */}
      <section className="mb-24">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-8">
          <h2 className="text-xl font-bold mb-4">
            Why a CLI for agentic trading?
          </h2>
          <div className="space-y-4 text-[var(--muted)] leading-relaxed">
            <p>
              AI coding agents — Codex, Claude Code, OpenClaw — interact with
              the world through shell commands. They can{" "}
              <code className="text-[var(--foreground)]">git push</code>, run
              tests, deploy apps. But they can&apos;t trade, because broker APIs
              require HTTP clients, OAuth flows, and SDK setup that agents
              don&apos;t do well.
            </p>
            <p>
              <span className="text-[var(--foreground)]">broker-cli</span>{" "}
              closes that gap. Install it, and your agent can check positions,
              analyze risk, place orders, and manage a portfolio using the same
              interface it uses for everything else:{" "}
              <span className="text-[var(--foreground)]">the terminal</span>.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mb-24">
        <h2 className="text-2xl font-bold mb-8">Built for agents</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--accent-dim)] transition-colors"
            >
              <f.icon className="w-6 h-6 text-[var(--accent)] mb-3" />
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported brokers — moved up per Halo's feedback */}
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
                ["Option chains + greeks", true, true],
                ["All order types", true, true],
                ["Cancel all", true, true],
                ["Positions & P/L", true, true],
                ["Exposure analysis", true, true],
                ["Persistent auth", false, true],
                ["Streaming events", true, false],
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

      {/* Paper trading */}
      <section className="mb-24">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-lg">🧪</span>
          <span className="font-semibold">Start safe:</span>
          <code className="text-[var(--accent)] bg-[var(--card)] border border-[var(--border)] px-2 py-1 rounded font-mono">
            broker daemon start --paper
          </code>
          <span className="text-[var(--muted)]">
            — full paper trading mode. Test strategies with zero risk, go live
            when ready.
          </span>
        </div>
      </section>

      {/* Agent examples */}
      <section className="mb-24">
        <h2 className="text-2xl font-bold mb-2">See it in action</h2>
        <p className="text-[var(--muted)] mb-6">
          Point your agent at a task. It reads SKILL.md, discovers the commands,
          and executes.
        </p>
        <div className="space-y-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5 font-mono text-sm overflow-x-auto">
            <p className="text-[var(--muted)] mb-3">
              # Tell your agent to rebalance
            </p>
            <p className="mb-4">
              <span className="text-[var(--accent)]">$</span> codex exec{" "}
              <span className="text-yellow-500">
                &quot;Check my portfolio. If any position exceeds 20% of NLV,
                trim it to 15%.&quot;
              </span>
            </p>
            <div className="border-t border-[var(--border)] pt-3 text-[var(--muted)] space-y-1">
              <p>
                <span className="text-blue-400">agent</span> → reading
                SKILL.md...
              </p>
              <p>
                <span className="text-blue-400">agent</span> → broker exposure
                --by symbol --json
              </p>
              <p>
                <span className="text-blue-400">agent</span> → TSLA is 34.2% of
                NLV. Reducing to 15%.
              </p>
              <p>
                <span className="text-blue-400">agent</span> → broker order sell
                TSLA 142 --limit 248.50
              </p>
              <p>
                <span className="text-[var(--accent)]">✓</span> Order placed.
                TSLA exposure now 15.1% of NLV.
              </p>
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5 font-mono text-sm overflow-x-auto">
            <p className="text-[var(--muted)] mb-3">
              # Or run a more complex strategy
            </p>
            <p className="mb-4">
              <span className="text-[var(--accent)]">$</span> codex exec{" "}
              <span className="text-yellow-500">
                &quot;Find AAPL puts expiring next Friday with delta between
                -0.30 and -0.15. Buy the one with the best bid-ask spread.&quot;
              </span>
            </p>
            <div className="border-t border-[var(--border)] pt-3 text-[var(--muted)] space-y-1">
              <p>
                <span className="text-blue-400">agent</span> → broker
                option-chain AAPL --type put --expiry 2026-02-20 --json
              </p>
              <p>
                <span className="text-blue-400">agent</span> → Filtering 47
                contracts: delta range [-0.30, -0.15]...
              </p>
              <p>
                <span className="text-blue-400">agent</span> → Best spread:
                AAPL 220P 02/20 (delta: -0.22, spread: $0.03)
              </p>
              <p>
                <span className="text-blue-400">agent</span> → broker order buy
                AAPL250220P220 1 --limit 3.45
              </p>
              <p>
                <span className="text-[var(--accent)]">✓</span> Order placed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Commands */}
      <section className="mb-24">
        <h2 className="text-2xl font-bold mb-2">Commands</h2>
        <p className="text-[var(--muted)] mb-6">
          Everything an agent needs, nothing it doesn&apos;t.
        </p>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5 font-mono text-sm overflow-x-auto space-y-2">
          {[
            ["broker daemon start", "Start the trading daemon"],
            ["broker daemon start --paper", "Paper trading mode"],
            ["broker portfolio", "View all positions"],
            ["broker exposure --by symbol", "Portfolio exposure breakdown"],
            [
              "broker option-chain AAPL --type call",
              "Option chains with greeks",
            ],
            ["broker order buy AAPL 100 --limit 185", "Place orders"],
            ["broker cancel-all", "Cancel all open orders"],
            ["broker orders", "List open orders"],
            ["broker auth etrade", "Authenticate with a broker"],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex gap-4">
              <span className="text-[var(--foreground)] whitespace-nowrap">
                {cmd}
              </span>
              <span className="text-[var(--muted)]">— {desc}</span>
            </div>
          ))}
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
