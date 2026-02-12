# Broker

Broker is an Interactive Brokers execution stack with a local daemon, CLI, and SDKs.

## Quickstart

Install using the hosted bootstrap script:

```bash
curl -fsSL https://raw.githubusercontent.com/north-brook/broker/main/install/bootstrap.sh | bash
```

If you already have the repo cloned locally:

```bash
./install.sh
```

After install:

```bash
broker --help
broker daemon start --paper
broker daemon status
```

## Supported Providers

Add new providers as additional columns in this table.

| Feature | Interactive Brokers | E*Trade |
|---------|:------------------:|:-------:|
| Real-time quotes | ✅ | ✅ |
| Historical bars | ✅ | ❌ |
| Option chains | ✅ | ❌ |
| Market orders | ✅ | ✅ |
| Limit orders | ✅ | ✅ |
| Stop orders | ✅ | ✅ |
| Bracket orders | ✅ | ❌ |
| Cancel all | ✅ | ❌ |
| Positions | ✅ | ✅ |
| Balance / P&L | ✅ | ✅ |
| Streaming events | ✅ | ❌ |
| Risk engine | ✅ | ✅ |

## E*Trade Setup

Authenticate once manually to create the initial token file:

```bash
broker auth etrade
```

### Auto-Reauth (Headless)

To keep E*Trade authenticated across the daily midnight token expiry:

1. Install Playwright:
   ```bash
   pip install playwright && playwright install chromium
   ```
2. Add credentials to config:
   ```json
   {
     "broker": {
       "provider": "etrade",
       "etrade": {
         "consumer_key": "...",
         "consumer_secret": "...",
         "username": "your_etrade_username",
         "password": "your_etrade_password",
         "auto_reauth": true
       }
     }
   }
   ```
   Or via environment variables:
   ```bash
   export BROKER_ETRADE_USERNAME=your_username
   export BROKER_ETRADE_PASSWORD=your_password
   export BROKER_ETRADE_AUTO_REAUTH=true
   ```
3. The daemon will auto re-authenticate around midnight ET and when access tokens expire.

Note: accounts with 2FA/MFA enabled cannot use auto-reauth. Use `broker auth etrade` for manual authentication.

## Storage Defaults

- Config: `~/.config/broker/config.json`
- State: `~/.local/state/broker`
- Data: `~/.local/share/broker`

## Repository Layout

- `cli/` broker CLI package
- `daemon/` broker daemon package
- `sdk/python/` Python SDK
- `sdk/typescript/` TypeScript SDK
- `install/` installer and bootstrap steps
- `start.sh` / `stop.sh` local daemon wrapper scripts

## Development Checks

From repo root:

```bash
bun run ci:all
```

## Git Hooks

Husky is configured with a `pre-commit` hook that runs:

```bash
bun run ci:all
```

After cloning, run `bun install` once to install hooks.
