# Broker CLI

`broker` is the operator CLI for `broker-daemon`.

## Prerequisites

- `broker-daemon` running (`broker daemon start`)
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
- output defaults to JSON
- when daemon is down, run `broker daemon status` and `broker daemon start`
