/**
 * Hook that subscribes to daemon event topics and pushes events into the store.
 *
 * Manages the long-lived streaming connection, auto-reconnects on failure,
 * and translates raw EventEnvelope payloads into human-readable summaries
 * for the event feed panel.
 */

import { useEffect, useRef } from "react";
import type { AgentTopic, EventEnvelope } from "@northbrook/broker-sdk-typescript";
import { getBrokerClient } from "../lib/broker.js";
import { useTerminal } from "../store/index.js";

const ALL_TOPICS: AgentTopic[] = ["orders", "fills", "positions", "pnl", "risk", "connection"];

function summarize(env: EventEnvelope): string {
  const d = env.data as Record<string, unknown>;
  switch (env.topic) {
    case "orders":
      return `Order ${d.client_order_id ?? "?"} ${d.status ?? "updated"}`;
    case "fills":
      return `Fill ${d.symbol ?? "?"} ${d.qty ?? "?"}@${d.price ?? "?"}`;
    case "positions":
      return `Position ${d.symbol ?? "?"} qty=${d.qty ?? "?"}`;
    case "pnl":
      return `P&L total=${d.total ?? "?"}`;
    case "risk":
      return `Risk ${d.event_type ?? d.type ?? "event"}`;
    case "connection":
      return `Connection ${d.connected ? "established" : "lost"}`;
    default:
      return `${env.topic} event`;
  }
}

export function useStream(): void {
  const pushEvent = useTerminal((s) => s.pushEvent);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    async function run() {
      while (!ctrl.signal.aborted) {
        try {
          const client = await getBrokerClient();
          for await (const env of client.subscribe(ALL_TOPICS)) {
            if (ctrl.signal.aborted) break;
            pushEvent(
              env.topic ?? "unknown",
              summarize(env),
              (env.data ?? {}) as Record<string, unknown>,
            );
          }
        } catch {
          // Wait before reconnecting
          if (!ctrl.signal.aborted) {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }
    }

    run();

    return () => {
      ctrl.abort();
    };
  }, [pushEvent]);
}
