/**
 * Hook to access the broker SDK client from any component.
 */

import type { Client } from "@northbrook/broker-sdk-typescript";
import { useEffect, useState } from "react";
import { getBrokerClient } from "../lib/broker.js";

export function useBroker(): { client: Client | null; error: string | null } {
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBrokerClient()
      .then(setClient)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return { client, error };
}
