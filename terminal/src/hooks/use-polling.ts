/**
 * Hook that polls the daemon for portfolio, orders, and risk data
 * at a configurable interval.
 */

import { useEffect, useRef } from "react";
import { useTerminal } from "../store/index.js";

const DEFAULT_INTERVAL_MS = 5_000;

export function usePolling(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  const fetchAll = useTerminal((s) => s.fetchAll);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Initial fetch
    fetchAll().catch(() => {});

    timerRef.current = setInterval(() => {
      fetchAll().catch(() => {});
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll, intervalMs]);
}
