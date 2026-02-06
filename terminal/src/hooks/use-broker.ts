/**
 * Hook to access the broker SDK client from any component.
 */

import { useState, useEffect } from "react";
import { Client } from "@northbrook/broker-sdk-typescript";
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
