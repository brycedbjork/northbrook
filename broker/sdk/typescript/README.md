# Broker TypeScript SDK

`@northbrook/broker-sdk-typescript` is the TypeScript client for `broker-daemon`.

## Install (workspace)

From `broker/sdk/typescript/`:

```bash
bun install
bun run typecheck
```

## Basic Usage

```ts
import { Client } from "@northbrook/broker-sdk-typescript";

const client = await Client.fromConfig();
console.log(await client.daemonStatus());
console.log(await client.quote("AAPL", "MSFT"));
```

## Scope

The SDK communicates with `broker-daemon`; daemon-side risk and audit controls remain authoritative.
