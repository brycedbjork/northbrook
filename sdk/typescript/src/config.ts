import { homedir } from "node:os";
import path from "node:path";
import { access, mkdir, readFile } from "node:fs/promises";

import type { AppConfig, JsonValue } from "./types.js";

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

const USER_HOME = homedir();
const XDG_CONFIG_HOME = envOrDefault("XDG_CONFIG_HOME", path.join(USER_HOME, ".config"));
const XDG_STATE_HOME = envOrDefault("XDG_STATE_HOME", path.join(USER_HOME, ".local", "state"));
const DEFAULT_CONFIG_HOME = path.join(XDG_CONFIG_HOME, "broker");
const DEFAULT_BROKER_CONFIG_JSON = envOrDefault(
  "BROKER_CONFIG_JSON",
  path.join(DEFAULT_CONFIG_HOME, "config.json")
);
const DEFAULT_STATE_HOME = path.join(XDG_STATE_HOME, "broker");

const DEFAULT_CONFIG: AppConfig = {
  gateway: {
    host: "127.0.0.1",
    port: 4001,
    client_id: 1,
    auto_reconnect: true,
    reconnect_backoff_max: 30
  },
  risk: {
    max_position_pct: 10.0,
    max_order_value: 50000,
    max_daily_loss_pct: 2.0,
    max_sector_exposure_pct: 30.0,
    max_single_name_pct: 10.0,
    max_open_orders: 20,
    order_rate_limit: 10,
    duplicate_window_seconds: 60,
    symbol_allowlist: [],
    symbol_blocklist: []
  },
  logging: {
    level: "INFO",
    audit_db: path.join(DEFAULT_STATE_HOME, "audit.db"),
    log_file: path.join(DEFAULT_STATE_HOME, "broker.log"),
    max_log_size_mb: 100
  },
  agent: {
    heartbeat_timeout_seconds: 300,
    on_heartbeat_timeout: "warn",
    default_output: "json"
  },
  output: {
    default_format: "json",
    timezone: "America/New_York"
  },
  runtime: {
    socket_path: path.join(DEFAULT_STATE_HOME, "broker.sock"),
    pid_file: path.join(DEFAULT_STATE_HOME, "broker-daemon.pid"),
    request_timeout_seconds: 15
  }
};

type ConfigSection = keyof AppConfig;
type JsonObject = Record<string, JsonValue>;

function asNonEmptyString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneDefaults(): AppConfig {
  return structuredClone(DEFAULT_CONFIG);
}

function expandHome(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(homedir(), input.slice(2));
  }
  return input;
}

function coerceEnvValue(raw: string): JsonValue {
  const lower = raw.toLowerCase();
  if (lower === "true" || lower === "false") {
    return lower === "true";
  }
  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  if (/^-?\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  if (/^-?\d+\.\d+$/.test(raw)) {
    return Number.parseFloat(raw);
  }
  return raw;
}

function mergeSection<T extends object>(target: T, source: Partial<T> | undefined): T {
  if (!source) {
    return target;
  }
  const out = { ...target } as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

function normalizeConfig(raw: Partial<AppConfig>): AppConfig {
  const cfg = cloneDefaults();
  cfg.gateway = mergeSection(cfg.gateway, raw.gateway);
  cfg.risk = mergeSection(cfg.risk, raw.risk);
  cfg.logging = mergeSection(cfg.logging, raw.logging);
  cfg.agent = mergeSection(cfg.agent, raw.agent);
  cfg.output = mergeSection(cfg.output, raw.output);
  cfg.runtime = mergeSection(cfg.runtime, raw.runtime);

  cfg.logging.audit_db = expandHome(cfg.logging.audit_db);
  cfg.logging.log_file = expandHome(cfg.logging.log_file);
  cfg.runtime.socket_path = expandHome(cfg.runtime.socket_path);
  cfg.runtime.pid_file = expandHome(cfg.runtime.pid_file);

  return cfg;
}

function applyEnvOverrides(base: AppConfig): AppConfig {
  const out = structuredClone(base);
  const sections = new Set<ConfigSection>(["gateway", "risk", "logging", "agent", "output", "runtime"]);

  for (const [key, raw] of Object.entries(process.env)) {
    if (!key.startsWith("BROKER_") || raw === undefined) {
      continue;
    }

    const tokens = key.slice("BROKER_".length).toLowerCase().split("_");
    if (tokens.length < 2) {
      continue;
    }

    const section = tokens[0] as ConfigSection;
    if (!sections.has(section)) {
      continue;
    }

    const field = tokens.slice(1).join("_");
    const sectionObj = out[section] as unknown as Record<string, JsonValue>;
    sectionObj[field] = coerceEnvValue(raw);
  }

  out.logging.audit_db = expandHome(out.logging.audit_db);
  out.logging.log_file = expandHome(out.logging.log_file);
  out.runtime.socket_path = expandHome(out.runtime.socket_path);
  out.runtime.pid_file = expandHome(out.runtime.pid_file);

  return out;
}

async function readBrokerConfig(configPath: string): Promise<unknown> {
  try {
    await access(configPath);
  } catch {
    return {};
  }

  const raw = await readFile(configPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractBrokerConfig(raw: unknown): Partial<AppConfig> {
  const out: Partial<AppConfig> = {};
  if (!isRecord(raw)) {
    return out;
  }

  const broker = isRecord(raw.broker) ? raw.broker : null;
  if (broker) {
    if (isRecord(broker.gateway)) {
      out.gateway = broker.gateway as unknown as AppConfig["gateway"];
    }
    if (isRecord(broker.risk)) {
      out.risk = broker.risk as unknown as AppConfig["risk"];
    }
    if (isRecord(broker.logging)) {
      out.logging = broker.logging as unknown as AppConfig["logging"];
    }
    if (isRecord(broker.agent)) {
      out.agent = broker.agent as unknown as AppConfig["agent"];
    }
    if (isRecord(broker.output)) {
      out.output = broker.output as unknown as AppConfig["output"];
    }
    if (isRecord(broker.runtime)) {
      out.runtime = broker.runtime as unknown as AppConfig["runtime"];
    }
  }

  const mode = asNonEmptyString(raw.ibkrGatewayMode).toLowerCase();
  if (mode === "paper" || mode === "live") {
    const gateway = isRecord(out.gateway as unknown)
      ? ({ ...(out.gateway as unknown as Record<string, JsonValue>) } as Record<string, JsonValue>)
      : ({} as Record<string, JsonValue>);
    if (gateway.port === undefined) {
      gateway.port = mode === "paper" ? 4002 : 4001;
    }
    out.gateway = gateway as unknown as AppConfig["gateway"];
  }

  return out;
}

async function ensureDirs(cfg: AppConfig): Promise<void> {
  await mkdir(path.dirname(cfg.runtime.socket_path), { recursive: true });
  await mkdir(path.dirname(cfg.runtime.pid_file), { recursive: true });
  await mkdir(path.dirname(cfg.logging.audit_db), { recursive: true });
  await mkdir(path.dirname(cfg.logging.log_file), { recursive: true });
}

export async function loadConfig(): Promise<AppConfig> {
  const resolvedConfigPath = expandHome(DEFAULT_BROKER_CONFIG_JSON);
  const raw = await readBrokerConfig(resolvedConfigPath);
  const fromFile = extractBrokerConfig(raw);
  const normalized = normalizeConfig(fromFile);
  const withEnv = applyEnvOverrides(normalized);
  await ensureDirs(withEnv);
  return withEnv;
}

export function resolveJsonMode(jsonFlag: boolean, cfg: AppConfig): boolean {
  void jsonFlag;
  void cfg;
  return true;
}

export const defaults = {
  DEFAULT_CONFIG_HOME,
  DEFAULT_STATE_HOME,
  DEFAULT_BROKER_CONFIG_JSON
};
