# Broker Daemon

`broker-daemon` is the long-running backend for the broker service.

## Responsibilities

- maintain connection/session state to IB Gateway or TWS
- route requests from CLI/SDK clients
- enforce risk controls before execution
- persist audit events for operational traceability

## Interfaces

- local CLI: `broker`
- SDKs: `broker_sdk` (Python), `@northbrook/broker-sdk-typescript`

## Runtime Context

Service lifecycle is managed through `nb`:

```bash
nb start
nb status
nb stop
```
