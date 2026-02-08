import { useEffect, useRef } from "react";
import { useTerminal } from "../store/index.js";

export const POLL_INTERVAL_MS = 5000;

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op catch for broker unavailability
const noop = () => {};

export function usePolling(intervalMs: number = POLL_INTERVAL_MS): void {
  const loadAll = useTerminal((s) => s.loadAll);
  const fetchBrokerData = useTerminal((s) => s.fetchBrokerData);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAll();
    fetchBrokerData().catch(noop);

    timerRef.current = setInterval(() => {
      loadAll();
      fetchBrokerData().catch(noop);
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [loadAll, fetchBrokerData, intervalMs]);
}
