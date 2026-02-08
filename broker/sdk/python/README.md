# Broker Python SDK

`broker-sdk-python` is the async Python client for `broker-daemon`.

## Install

```bash
pip install broker-sdk-python
```

For local development from `broker/`:

```bash
.venv/bin/python -m pip install -e './daemon[dev]' -e './sdk/python[dev]'
```

## Basic Usage

```python
import asyncio
from broker_sdk import Client

async def main() -> None:
    async with Client() as broker:
        print(await broker.daemon_status())
        print(await broker.quote("AAPL", "MSFT"))

asyncio.run(main())
```

## Scope

The SDK talks only to `broker-daemon`; daemon-side risk checks and audit behavior still apply.
