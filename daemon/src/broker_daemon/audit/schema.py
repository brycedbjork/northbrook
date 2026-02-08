"""SQLite schema for broker audit storage."""

from __future__ import annotations

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL,
        command TEXT NOT NULL,
        arguments TEXT,
        result_code INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_order_id TEXT NOT NULL UNIQUE,
        ib_order_id INTEGER,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        qty REAL NOT NULL,
        order_type TEXT NOT NULL,
        limit_price REAL,
        stop_price REAL,
        tif TEXT,
        status TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        filled_at TEXT,
        fill_price REAL,
        fill_qty REAL,
        commission REAL,
        risk_check_result TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS fills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fill_id TEXT NOT NULL UNIQUE,
        client_order_id TEXT NOT NULL,
        ib_order_id INTEGER,
        symbol TEXT NOT NULL,
        qty REAL NOT NULL,
        price REAL NOT NULL,
        commission REAL,
        timestamp TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS risk_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        details TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS connection_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event TEXT NOT NULL,
        details TEXT
    )
    """,
]
