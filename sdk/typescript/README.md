# Broker TypeScript SDK

`@broker/sdk-typescript` is the TypeScript client for `broker-daemon`.

## Install (workspace)

From `sdk/typescript/`:

```bash
bun install
bun run typecheck
```

## Basic Usage

```ts
import { Client } from "@broker/sdk-typescript";

const client = await Client.fromConfig();
console.log(await client.daemonStatus());
console.log(await client.quote("AAPL", "MSFT"));
```
