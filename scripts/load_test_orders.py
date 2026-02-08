#!/usr/bin/env python3
"""Burst load test harness for broker-daemon order/risk endpoints."""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BROKER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BROKER_ROOT / "packages" / "sdk" / "python" / "src"))
sys.path.insert(0, str(BROKER_ROOT / "packages" / "daemon" / "src"))

from broker_daemon.exceptions import BrokerError
from broker_sdk import Client


@dataclass
class RunResult:
    ok: bool
    latency_ms: float
    error_code: str | None = None
    error_message: str | None = None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rapid order submission load test for broker-daemon")
    parser.add_argument("--count", type=int, default=100, help="Total requests to send")
    parser.add_argument("--concurrency", type=int, default=20, help="Concurrent in-flight requests")
    parser.add_argument("--symbol", type=str, default="AAPL", help="Ticker symbol")
    parser.add_argument("--qty", type=float, default=1.0, help="Base quantity")
    parser.add_argument("--limit", type=float, default=100.0, help="Limit price for order/risk-check payload")
    parser.add_argument(
        "--mode",
        choices=["risk-check", "order"],
        default="risk-check",
        help="risk-check is safer; order submits real/paper orders through daemon",
    )
    parser.add_argument("--json", action="store_true", help="Emit summary as JSON")
    return parser.parse_args()


async def _run_once(client: Client, args: argparse.Namespace, index: int) -> RunResult:
    started = time.perf_counter()
    try:
        if args.mode == "risk-check":
            await client.risk_check(
                side="buy",
                symbol=args.symbol,
                qty=args.qty + (index % 3) * 0.01,
                limit=args.limit,
                tif="DAY",
            )
        else:
            await client.order(
                side="buy",
                symbol=args.symbol,
                qty=args.qty + (index % 3) * 0.01,
                limit=args.limit,
                tif="DAY",
                client_order_id=f"load-test-{index}",
            )
        return RunResult(ok=True, latency_ms=(time.perf_counter() - started) * 1000.0)
    except BrokerError as exc:
        return RunResult(
            ok=False,
            latency_ms=(time.perf_counter() - started) * 1000.0,
            error_code=exc.code.value,
            error_message=exc.message,
        )


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    semaphore = asyncio.Semaphore(args.concurrency)

    async with Client() as client:
        async def _worker(i: int) -> RunResult:
            async with semaphore:
                return await _run_once(client, args, i)

        started = time.perf_counter()
        results = await asyncio.gather(*[_worker(i) for i in range(args.count)])
        total_elapsed_ms = (time.perf_counter() - started) * 1000.0

    successes = [r for r in results if r.ok]
    failures = [r for r in results if not r.ok]
    latencies = [r.latency_ms for r in results]
    p50 = statistics.median(latencies) if latencies else 0.0
    p95 = _percentile(latencies, 95)
    error_counts: dict[str, int] = {}
    for item in failures:
        code = item.error_code or "UNKNOWN"
        error_counts[code] = error_counts.get(code, 0) + 1

    return {
        "mode": args.mode,
        "count": args.count,
        "concurrency": args.concurrency,
        "success": len(successes),
        "failed": len(failures),
        "elapsed_ms": round(total_elapsed_ms, 3),
        "throughput_rps": round((len(results) / (total_elapsed_ms / 1000.0)) if total_elapsed_ms > 0 else 0.0, 3),
        "latency_ms": {
            "p50": round(p50, 3),
            "p95": round(p95, 3),
            "max": round(max(latencies) if latencies else 0.0, 3),
        },
        "errors": error_counts,
    }


def _percentile(values: list[float], pct: int) -> float:
    if not values:
        return 0.0
    rank = (pct / 100.0) * (len(values) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(values) - 1)
    weight = rank - lower
    ordered = sorted(values)
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def main() -> None:
    args = _parse_args()
    summary = asyncio.run(_run(args))
    if args.json:
        print(json.dumps(summary, separators=(",", ":")))
        return

    print(f"mode={summary['mode']} count={summary['count']} concurrency={summary['concurrency']}")
    print(f"success={summary['success']} failed={summary['failed']} throughput_rps={summary['throughput_rps']}")
    print(
        "latency_ms "
        f"p50={summary['latency_ms']['p50']} "
        f"p95={summary['latency_ms']['p95']} "
        f"max={summary['latency_ms']['max']}"
    )
    if summary["errors"]:
        print(f"errors={summary['errors']}")


if __name__ == "__main__":
    main()
