from __future__ import annotations

import json
from pathlib import Path

from broker_daemon import config as broker_config


def _set_runtime_env(monkeypatch, root: Path) -> None:
    monkeypatch.setenv("BROKER_RUNTIME_SOCKET_PATH", str(root / "broker.sock"))
    monkeypatch.setenv("BROKER_RUNTIME_PID_FILE", str(root / "broker-daemon.pid"))
    monkeypatch.setenv("BROKER_LOGGING_AUDIT_DB", str(root / "audit.db"))
    monkeypatch.setenv("BROKER_LOGGING_LOG_FILE", str(root / "broker.log"))


def test_load_config_reads_broker_section_and_gateway_mode(tmp_path: Path, monkeypatch) -> None:
    _set_runtime_env(monkeypatch, tmp_path)

    broker_json = tmp_path / "config.json"
    broker_json.write_text(
        json.dumps(
            {
                "ibkrGatewayMode": "paper",
                "broker": {
                    "gateway": {
                        "host": "10.0.0.5",
                        "client_id": 17,
                    },
                    "runtime": {"request_timeout_seconds": 45},
                },
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(broker_config, "DEFAULT_BROKER_CONFIG_JSON", broker_json)

    cfg = broker_config.load_config()

    assert cfg.gateway.host == "10.0.0.5"
    assert cfg.gateway.client_id == 17
    assert cfg.gateway.port == 4002
    assert cfg.runtime.request_timeout_seconds == 45


def test_env_overrides_still_win_over_json(tmp_path: Path, monkeypatch) -> None:
    _set_runtime_env(monkeypatch, tmp_path)
    monkeypatch.setenv("BROKER_GATEWAY_PORT", "4010")

    broker_json = tmp_path / "config.json"
    broker_json.write_text(
        json.dumps(
            {
                "ibkrGatewayMode": "paper",
                "broker": {"gateway": {"port": 4002}},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(broker_config, "DEFAULT_BROKER_CONFIG_JSON", broker_json)

    cfg = broker_config.load_config()

    assert cfg.gateway.port == 4010


def test_load_config_supports_etrade_provider_env(tmp_path: Path, monkeypatch) -> None:
    _set_runtime_env(monkeypatch, tmp_path)
    monkeypatch.setenv("BROKER_PROVIDER", "etrade")
    monkeypatch.setenv("BROKER_ETRADE_CONSUMER_KEY", "key-123")
    monkeypatch.setenv("BROKER_ETRADE_CONSUMER_SECRET", "secret-456")
    monkeypatch.setenv("BROKER_ETRADE_SANDBOX", "true")
    monkeypatch.setenv("BROKER_ETRADE_USERNAME", "alice")
    monkeypatch.setenv("BROKER_ETRADE_PASSWORD", "pw-123")
    monkeypatch.setenv("BROKER_ETRADE_AUTO_REAUTH", "true")

    broker_json = tmp_path / "config.json"
    broker_json.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(broker_config, "DEFAULT_BROKER_CONFIG_JSON", broker_json)

    cfg = broker_config.load_config()

    assert cfg.provider == "etrade"
    assert cfg.etrade.consumer_key == "key-123"
    assert cfg.etrade.consumer_secret == "secret-456"
    assert cfg.etrade.sandbox is True
    assert cfg.etrade.username == "alice"
    assert cfg.etrade.password == "pw-123"
    assert cfg.etrade.auto_reauth is True
