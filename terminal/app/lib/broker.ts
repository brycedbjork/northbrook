/**
 * Broker SDK client singleton.
 *
 * The entire TUI shares one Client instance. This module lazily initializes
 * it from the standard config and exposes it for hooks and store actions.
 */

import { Client, type ClientOptions } from "@northbrook/broker-sdk-typescript";

let _client: Client | null = null;
let _initPromise: Promise<Client> | null = null;

/** Get or create the shared broker client. */
export function getBrokerClient(opts?: ClientOptions): Promise<Client> {
  if (_client) {
    return Promise.resolve(_client);
  }
  if (_initPromise) {
    return _initPromise;
  }

  _initPromise = Client.fromConfig({
    ...opts,
    source: "terminal",
  }).then((c) => {
    _client = c;
    return c;
  });

  return _initPromise;
}

/** Reset the client (for reconnection). */
export function resetBrokerClient(): void {
  _client = null;
  _initPromise = null;
}
