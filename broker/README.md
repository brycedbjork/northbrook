# Broker Service

The broker service is Northbrook's execution and risk layer for Interactive Brokers.

## Components

- `broker/daemon`: long-running runtime (connection, routing, risk, audit)
- `broker/cli`: operator command line (`broker`)
- `broker/sdk/python`: Python client for integrations
- `broker/sdk/typescript`: TypeScript client for integrations

## Requirements

- IB Gateway or TWS running and authenticated
- socket API reachable by `broker-daemon`

## Common Workflows

Start platform services:

```bash
nb start --paper
nb status
```

Query and execute through broker CLI:

```bash
broker quote AAPL MSFT
broker positions
broker order buy AAPL 10 --limit 180
```

## Subcomponent Docs

- `broker/cli/README.md`
- `broker/daemon/README.md`
- `broker/sdk/python/README.md`
- `broker/sdk/typescript/README.md`
