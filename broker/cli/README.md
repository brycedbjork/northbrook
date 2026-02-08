# Broker CLI

`broker` is the operator CLI for `broker-daemon`.

## Purpose

- query market/account data
- place/cancel orders
- inspect and update risk limits
- review audit logs

## Prerequisites

- `broker-daemon` running (`nb start`)
- IB Gateway or TWS reachable and authenticated

## Quick Commands

```bash
broker --help
broker quote AAPL MSFT
broker positions
broker order buy AAPL 5 --limit 180 --tif DAY
broker limits
broker audit orders
```

## Notes

- `--help` is available on all command groups
- broker CLI output defaults to JSON
- when daemon is down, run `nb status` and `nb start`
