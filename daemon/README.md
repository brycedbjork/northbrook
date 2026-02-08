# Broker Daemon

`broker-daemon` is the long-running backend for broker execution and risk enforcement.

## Responsibilities

- maintain session state to IB Gateway/TWS
- route requests from CLI/SDK clients
- enforce risk controls before execution
- persist audit events for traceability

## Interfaces

- local CLI: `broker`
- SDKs: `broker_sdk` (Python), `@broker/sdk-typescript`

## Runtime Context

Service lifecycle commands:

```bash
broker daemon start --paper
broker daemon status
broker daemon stop
```
