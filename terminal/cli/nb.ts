#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, type Dirent } from "node:fs";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type NorthbrookConfig = {
  aiProvider?: {
    provider?: string;
    apiKey?: string;
    model?: string;
  };
  heartbeat?: {
    enabled?: boolean;
    intervalMinutes?: number;
  };
  skills?: {
    xApi?: { apiKey?: string };
    braveSearchApi?: { apiKey?: string };
  };
  sec?: {
    appName?: string;
    name?: string;
    email?: string;
    company?: string;
    userAgent?: string;
  };
  ibkrUsername?: string;
  ibkrPassword?: string;
  ibkrGatewayMode?: string;
  ibkrAutoLogin?: boolean;
};

type ParsedRunArgs = {
  daemonArgs: string[];
  terminalArgs: string[];
  daemonHelpRequested: boolean;
  hasIbWait: boolean;
};

type BootstrapState = "running" | "ok" | "error";
type BootstrapOutcome = "ok" | "error" | "timeout";

const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.NB_ROOT_DIR
  ? path.resolve(process.env.NB_ROOT_DIR)
  : path.resolve(CLI_DIR, "..", "..");
const HOME_DIR = os.homedir();

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

const NORTHBROOK_HOME = envOrDefault("NORTHBROOK_HOME", path.join(HOME_DIR, ".northbrook"));
const NORTHBROOK_CONFIG_JSON = envOrDefault("NORTHBROOK_CONFIG_JSON", path.join(NORTHBROOK_HOME, "northbrook.json"));
const NORTHBROOK_WORKSPACE = envOrDefault("NORTHBROOK_WORKSPACE", path.join(NORTHBROOK_HOME, "workspace"));
const NORTHBROOK_SESSIONS_DIR = envOrDefault(
  "NORTHBROOK_SESSIONS_DIR",
  path.join(NORTHBROOK_WORKSPACE, "sessions")
);

const STATE_BASE = envOrDefault("XDG_STATE_HOME", path.join(HOME_DIR, ".local", "state"));
const DATA_BASE = envOrDefault("XDG_DATA_HOME", path.join(HOME_DIR, ".local", "share"));
const NORTHBROOK_STATE_HOME = path.join(STATE_BASE, "northbrook");
const NORTHBROOK_DATA_HOME = path.join(DATA_BASE, "northbrook");
const NORTHBROOK_AGENTS_HOME = path.join(NORTHBROOK_STATE_HOME, "agents");
const BROKER_IBC_PATH = path.join(NORTHBROOK_DATA_HOME, "ibc");

process.env.NORTHBROOK_HOME = NORTHBROOK_HOME;
process.env.NORTHBROOK_CONFIG_JSON = NORTHBROOK_CONFIG_JSON;
process.env.NORTHBROOK_WORKSPACE = NORTHBROOK_WORKSPACE;
process.env.NORTHBROOK_SESSIONS_DIR = NORTHBROOK_SESSIONS_DIR;
process.env.NORTHBROOK_STATE_HOME = NORTHBROOK_STATE_HOME;
process.env.NORTHBROOK_DATA_HOME = NORTHBROOK_DATA_HOME;

process.env.NORTHBROOK_AGENTS_HOME = NORTHBROOK_AGENTS_HOME;
process.env.NORTHBROOK_AGENTS_PID_FILE = path.join(NORTHBROOK_AGENTS_HOME, "agents-daemon.pid");
process.env.NORTHBROOK_AGENTS_STATUS_FILE = path.join(NORTHBROOK_AGENTS_HOME, "agents-daemon.status.json");
process.env.NORTHBROOK_AGENTS_LOG_FILE = path.join(NORTHBROOK_AGENTS_HOME, "agents-daemon.log");
process.env.NORTHBROOK_AGENTS_EXECUTIONS_LOG_FILE = path.join(NORTHBROOK_AGENTS_HOME, "scheduled-job-executions.jsonl");

process.env.BROKER_RUNTIME_PID_FILE = path.join(NORTHBROOK_STATE_HOME, "broker-daemon.pid");
process.env.BROKER_RUNTIME_SOCKET_PATH = path.join(NORTHBROOK_STATE_HOME, "broker.sock");
process.env.BROKER_LOGGING_AUDIT_DB = path.join(NORTHBROOK_STATE_HOME, "audit.db");
process.env.BROKER_LOGGING_LOG_FILE = path.join(NORTHBROOK_STATE_HOME, "broker.log");
process.env.BROKER_IBC_PATH = BROKER_IBC_PATH;
process.env.BROKER_IBC_INI = path.join(BROKER_IBC_PATH, "config.ini");
process.env.BROKER_IBC_LOG_FILE = path.join(NORTHBROOK_STATE_HOME, "logs", "ibc-launch.log");
process.env.BROKER_IB_SETTINGS_DIR = path.join(NORTHBROOK_STATE_HOME, "ib-settings");

process.env.PATH = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/home/linuxbrew/.linuxbrew/bin",
  path.join(HOME_DIR, ".bun", "bin"),
  process.env.PATH || "",
].join(":");

export function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildSecUserAgent(config: NorthbrookConfig): string {
  const sec = config.sec ?? {};
  const appName = asNonEmptyString(sec.appName) || "Northbrook";
  const explicit = asNonEmptyString(sec.userAgent);
  if (explicit) {
    return explicit;
  }

  const contactParts = [asNonEmptyString(sec.name), asNonEmptyString(sec.company), asNonEmptyString(sec.email)].filter(
    (part) => part.length > 0
  );
  if (contactParts.length === 0) {
    return `${appName}/1.0`;
  }
  return `${appName}/1.0 (${contactParts.join(", ")})`;
}

function assertSafeDeleteTarget(label: string, target: string): void {
  const resolved = path.resolve(target);
  const homeResolved = path.resolve(HOME_DIR);
  if (!resolved || resolved === "/" || resolved === homeResolved) {
    throw new Error(`Refusing to reset unsafe ${label} path: ${target}`);
  }
}

async function readConfig(): Promise<NorthbrookConfig> {
  try {
    const raw = await readFile(NORTHBROOK_CONFIG_JSON, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as NorthbrookConfig;
    }
  } catch {
    // ignore malformed/missing config
  }
  return {};
}

async function loadNorthbrookSecrets(): Promise<void> {
  const config = await readConfig();
  const provider = asNonEmptyString(config.aiProvider?.provider).toLowerCase();
  const apiKey = asNonEmptyString(config.aiProvider?.apiKey);
  const model = asNonEmptyString(config.aiProvider?.model);

  if (["anthropic", "openai", "google"].includes(provider)) {
    process.env.NORTHBROOK_AI_PROVIDER = provider;
  }
  if (model) {
    process.env.NORTHBROOK_AI_MODEL = model;
  }
  if (apiKey && ["anthropic", "openai", "google"].includes(provider)) {
    if (provider === "anthropic") {
      process.env.ANTHROPIC_API_KEY = apiKey;
    }
    if (provider === "openai") {
      process.env.OPENAI_API_KEY = apiKey;
    }
    if (provider === "google") {
      process.env.GEMINI_API_KEY = apiKey;
    }
  }

  const xApiKey = asNonEmptyString(config.skills?.xApi?.apiKey);
  const braveSearchApiKey = asNonEmptyString(config.skills?.braveSearchApi?.apiKey);
  const ibkrUsername = asNonEmptyString(config.ibkrUsername);
  const ibkrPassword = asNonEmptyString(config.ibkrPassword);

  if (xApiKey) {
    process.env.X_API_KEY = xApiKey;
  }
  if (braveSearchApiKey) {
    process.env.BRAVE_SEARCH_API_KEY = braveSearchApiKey;
    process.env.BRAVE_API_KEY = braveSearchApiKey;
  }
  if (ibkrUsername) {
    process.env.BROKER_IB_USERNAME = ibkrUsername;
  }
  if (ibkrPassword) {
    process.env.BROKER_IB_PASSWORD = ibkrPassword;
  }
  if (typeof config.ibkrAutoLogin === "boolean") {
    process.env.BROKER_IB_AUTO_LOGIN = config.ibkrAutoLogin ? "true" : "false";
  }

  const secUserAgent = buildSecUserAgent(config);
  if (secUserAgent) {
    process.env.SEC_USER_AGENT = secUserAgent;
  }
}

export function commandExists(name: string): boolean {
  return resolveCommandPath(name) !== null;
}

export function resolveCommandPath(name: string): string | null {
  const pathValue = process.env.PATH || "";
  const pathEntries = pathValue.split(":").filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // continue
    }
  }

  return null;
}

export function assertExecutable(filePath: string, message: string): void {
  try {
    accessSync(filePath, constants.X_OK);
  } catch {
    throw new Error(message);
  }
}

export function hasExplicitGatewayOrMode(args: string[]): boolean {
  return args.some((arg) => {
    return arg === "--paper" || arg === "--live" || arg === "--gateway" || arg.startsWith("--gateway=");
  });
}

async function defaultDaemonModeArg(): Promise<string> {
  const config = await readConfig();
  const mode = asNonEmptyString(config.ibkrGatewayMode).toLowerCase();
  if (mode === "live") {
    return "--live";
  }
  return "--paper";
}

async function runCommand(
  cmd: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: "inherit" | "pipe";
  } = {}
): Promise<RunResult> {
  const stdio = options.stdio ?? "pipe";

  return await new Promise<RunResult>((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      stdio,
    });

    let out = "";
    let err = "";

    if (stdio === "pipe") {
      child.stdout?.on("data", (chunk) => {
        out += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        err += chunk.toString();
      });
    }

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: out,
        stderr: err,
      });
    });

    child.on("error", (error) => {
      resolve({
        code: 1,
        stdout: "",
        stderr: error.message,
      });
    });
  });
}

async function runOrThrow(
  cmd: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: "inherit" | "pipe";
    errorPrefix?: string;
  } = {}
): Promise<RunResult> {
  const result = await runCommand(cmd, args, options);
  if (result.code !== 0) {
    const details = (result.stderr || result.stdout).trim();
    const prefix = options.errorPrefix || `${cmd} failed`;
    throw new Error(details ? `${prefix}: ${details}` : prefix);
  }
  return result;
}

function printRunExamples(): string {
  return [
    "Examples:",
    "  nb",
    "  nb --screen=positions",
    "  nb --paper",
    "  nb --live --gateway 127.0.0.1:4001",
    "  nb run --daemon-help",
  ].join("\n");
}

function resolveBrokerBin(): string | null {
  const local = path.join(ROOT_DIR, "broker", ".venv", "bin", "broker");
  if (existsSync(local)) {
    try {
      accessSync(local, constants.X_OK);
      return local;
    } catch {
      // continue
    }
  }
  return resolveCommandPath("broker");
}

async function runBrokerStart(args: string[]): Promise<void> {
  const brokerStart = path.join(ROOT_DIR, "broker", "start.sh");
  assertExecutable(brokerStart, `broker/start.sh not found or not executable at ${brokerStart}`);

  const daemonArgs = [...args];
  if (!hasExplicitGatewayOrMode(daemonArgs)) {
    daemonArgs.push(await defaultDaemonModeArg());
  }

  await runOrThrow(brokerStart, daemonArgs, {
    stdio: "inherit",
    env: process.env,
  });
}

async function runBrokerStop(args: string[]): Promise<void> {
  const brokerStop = path.join(ROOT_DIR, "broker", "stop.sh");
  assertExecutable(brokerStop, `broker/stop.sh not found or not executable at ${brokerStop}`);
  await runOrThrow(brokerStop, args, {
    stdio: "inherit",
    env: process.env,
  });
}

async function runAgentsStart(): Promise<void> {
  const agentsStart = path.join(ROOT_DIR, "agents", "daemon", "start.sh");
  assertExecutable(agentsStart, `agents/daemon/start.sh not found or not executable at ${agentsStart}`);
  await runOrThrow(agentsStart, [], {
    stdio: "inherit",
    env: process.env,
  });
}

async function runAgentsStop(ignoreFailures = false): Promise<void> {
  const agentsStop = path.join(ROOT_DIR, "agents", "daemon", "stop.sh");
  assertExecutable(agentsStop, `agents/daemon/stop.sh not found or not executable at ${agentsStop}`);
  const result = await runCommand(agentsStop, [], {
    stdio: "inherit",
    env: process.env,
  });
  if (!ignoreFailures && result.code !== 0) {
    throw new Error("failed to stop agents daemon");
  }
}

async function runAgentsStatusJson(): Promise<string> {
  const agentsStatus = path.join(ROOT_DIR, "agents", "daemon", "status.sh");
  try {
    assertExecutable(agentsStatus, "");
  } catch {
    return "";
  }
  const result = await runCommand(agentsStatus, [], {
    stdio: "pipe",
    env: process.env,
  });
  return result.stdout.trim();
}

export function parseRunArgs(args: string[]): ParsedRunArgs {
  const daemonArgs: string[] = [];
  const terminalArgs: string[] = [];

  let daemonHelpRequested = false;
  let hasIbWait = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (["--live", "--paper", "--launch-ib", "--no-launch-ib"].includes(arg)) {
      daemonArgs.push(arg);
      continue;
    }

    if (arg === "--daemon-help") {
      daemonHelpRequested = true;
      continue;
    }

    if (["--gateway", "--ib-app-path", "--ib-wait"].includes(arg)) {
      daemonArgs.push(arg);
      if (arg === "--ib-wait") {
        hasIbWait = true;
      }
      i += 1;
      if (i >= args.length) {
        throw new Error(`Missing value for ${arg}.`);
      }
      daemonArgs.push(args[i]);
      continue;
    }

    if (arg.startsWith("--gateway=") || arg.startsWith("--ib-app-path=") || arg.startsWith("--ib-wait=")) {
      daemonArgs.push(arg);
      if (arg.startsWith("--ib-wait=")) {
        hasIbWait = true;
      }
      continue;
    }

    terminalArgs.push(arg);
  }

  return {
    daemonArgs,
    terminalArgs,
    daemonHelpRequested,
    hasIbWait,
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function startBootstrapInBackground(daemonArgs: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const brokerStart = path.join(ROOT_DIR, "broker", "start.sh");
  const agentsStart = path.join(ROOT_DIR, "agents", "daemon", "start.sh");
  assertExecutable(brokerStart, `broker/start.sh not found or not executable at ${brokerStart}`);
  assertExecutable(agentsStart, `agents/daemon/start.sh not found or not executable at ${agentsStart}`);

  const quotedBrokerArgs = daemonArgs.map(shellQuote).join(" ");
  const script = [
    `if ${shellQuote(brokerStart)} ${quotedBrokerArgs} >> ${shellQuote(env.NORTHBROOK_BOOTSTRAP_LOG_FILE || "")} 2>&1 && ${shellQuote(agentsStart)} >> ${shellQuote(env.NORTHBROOK_BOOTSTRAP_LOG_FILE || "")} 2>&1; then`,
    `  printf 'ok\\n' > ${shellQuote(env.NORTHBROOK_BOOTSTRAP_STATE_FILE || "")}`,
    "else",
    "  rc=$?",
    `  printf 'error\\n' > ${shellQuote(env.NORTHBROOK_BOOTSTRAP_STATE_FILE || "")}`,
    `  printf '\\nstartup failed (exit %s)\\n' \"$rc\" >> ${shellQuote(env.NORTHBROOK_BOOTSTRAP_LOG_FILE || "")}`,
    "fi",
  ].join("\n");

  const child = spawn("bash", ["-lc", script], {
    env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function readBootstrapState(stateFile: string): Promise<BootstrapState> {
  try {
    const raw = await readFile(stateFile, "utf-8");
    const value = raw.trim();
    if (value === "ok" || value === "error" || value === "running") {
      return value;
    }
  } catch {
    // treat missing/unreadable state as still running
  }
  return "running";
}

async function waitForBootstrapOutcome(stateFile: string, timeoutMs = 90_000): Promise<BootstrapOutcome> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = await readBootstrapState(stateFile);
    if (state === "ok" || state === "error") {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return "timeout";
}

async function hasPersistedSessions(): Promise<boolean> {
  await mkdir(NORTHBROOK_SESSIONS_DIR, { recursive: true });

  let entries: Dirent[];
  try {
    entries = await readdir(NORTHBROOK_SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some((entry) => entry.name !== ".DS_Store" && !entry.name.startsWith("."));
}

async function runThesisKickoff(env: NodeJS.ProcessEnv): Promise<void> {
  const thesisEntrypoint = path.join(ROOT_DIR, "terminal", "thesis", "main.tsx");
  if (!existsSync(thesisEntrypoint)) {
    throw new Error(`terminal thesis entrypoint not found at ${thesisEntrypoint}`);
  }

  const bunBinary = process.execPath;
  const terminalDir = path.join(ROOT_DIR, "terminal");
  await runOrThrow(bunBinary, ["thesis/main.tsx"], {
    cwd: terminalDir,
    env,
    stdio: "inherit",
    errorPrefix: "thesis kickoff failed",
  });
}

async function runTerminal(args: string[]): Promise<void> {
  const terminalEntrypoint = path.join(ROOT_DIR, "terminal", "app", "main.tsx");
  if (!existsSync(terminalEntrypoint)) {
    throw new Error(`terminal entrypoint not found at ${terminalEntrypoint}`);
  }

  await loadNorthbrookSecrets();
  const parsed = parseRunArgs(args);

  if (parsed.daemonHelpRequested) {
    const brokerStart = path.join(ROOT_DIR, "broker", "start.sh");
    assertExecutable(brokerStart, `broker/start.sh not found or not executable at ${brokerStart}`);
    await runOrThrow(brokerStart, ["--help"], {
      stdio: "inherit",
      env: process.env,
    });
    return;
  }

  const daemonArgs = [...parsed.daemonArgs];
  if (!hasExplicitGatewayOrMode(daemonArgs)) {
    daemonArgs.push(await defaultDaemonModeArg());
  }
  if (!parsed.hasIbWait) {
    daemonArgs.push("--ib-wait=0");
  }

  await mkdir(path.join(NORTHBROOK_STATE_HOME, "logs"), { recursive: true });

  const bootstrapId = `${Date.now()}-${process.pid}-${Math.floor(Math.random() * 1_000_000)}`;
  const bootstrapStateFile = path.join(NORTHBROOK_STATE_HOME, "logs", `nb-bootstrap-${bootstrapId}.state`);
  const bootstrapLogFile = path.join(NORTHBROOK_STATE_HOME, "logs", `nb-bootstrap-${bootstrapId}.log`);

  await writeFile(bootstrapStateFile, "running\n", "utf-8");
  await writeFile(bootstrapLogFile, "", "utf-8");

  const env = {
    ...process.env,
    NORTHBROOK_BOOTSTRAP_STATE_FILE: bootstrapStateFile,
    NORTHBROOK_BOOTSTRAP_LOG_FILE: bootstrapLogFile,
  };

  const hasSessions = await hasPersistedSessions();

  await startBootstrapInBackground(daemonArgs, env);

  if (!hasSessions) {
    const bootstrapOutcome = await waitForBootstrapOutcome(bootstrapStateFile);
    if (bootstrapOutcome === "ok") {
      if (!(await hasPersistedSessions())) {
        await runThesisKickoff(env);
      }
    } else if (bootstrapOutcome === "error") {
      console.error("Skipping thesis kickoff because broker/agents bootstrap failed.");
    } else {
      console.error("Skipping thesis kickoff because broker/agents bootstrap timed out.");
    }
  }

  const bunBinary = process.execPath;
  const terminalDir = path.join(ROOT_DIR, "terminal");
  const result = await runCommand(bunBinary, ["app/main.tsx", ...parsed.terminalArgs], {
    cwd: terminalDir,
    env,
    stdio: "inherit",
  });

  process.exit(result.code);
}

function configuredKeyLabel(value: unknown): "yes" | "no" {
  return typeof value === "string" && value.trim() ? "yes" : "no";
}

function configuredSkillKey(config: NorthbrookConfig, skillName: "xApi" | "braveSearchApi"): "yes" | "no" {
  const apiKey = config.skills?.[skillName]?.apiKey;
  return configuredKeyLabel(apiKey);
}

function configuredSecUserAgent(config: NorthbrookConfig): "yes" | "no" {
  const sec = config.sec;
  if (!sec) {
    return "no";
  }
  const explicit = asNonEmptyString(sec.userAgent);
  const hasIdentity =
    asNonEmptyString(sec.name).length > 0 ||
    asNonEmptyString(sec.email).length > 0 ||
    asNonEmptyString(sec.company).length > 0;
  return explicit || hasIdentity ? "yes" : "no";
}

function statusSymbol(ok: boolean): string {
  return ok ? "●" : "○";
}

async function commandStatus(): Promise<void> {
  await loadNorthbrookSecrets();

  const brokerBin = resolveBrokerBin();
  let brokerRaw = "";
  if (brokerBin) {
    const brokerResult = await runCommand(brokerBin, ["--json", "daemon", "status"], {
      stdio: "pipe",
      env: process.env,
    });
    brokerRaw = brokerResult.stdout.trim();
  }

  const agentsRaw = await runAgentsStatusJson();
  const config = await readConfig();

  let broker: Record<string, unknown> | null = null;
  if (brokerRaw) {
    try {
      const parsed = JSON.parse(brokerRaw) as Record<string, unknown>;
      if (typeof parsed === "object" && parsed && parsed.connection) {
        broker = parsed;
      }
    } catch {
      broker = null;
    }
  }

  let agents: Record<string, unknown> | null = null;
  if (agentsRaw) {
    try {
      const parsed = JSON.parse(agentsRaw) as Record<string, unknown>;
      if (typeof parsed === "object" && parsed) {
        agents = parsed;
      }
    } catch {
      agents = null;
    }
  }

  console.log("Northbrook Platform Status");
  console.log("────────────────────────────────────────────────────────");

  if (!broker) {
    console.log(`${statusSymbol(false)} Gateway        disconnected`);
    console.log(`${statusSymbol(false)} Broker daemon  stopped`);
  } else {
    const connection = (broker.connection ?? {}) as Record<string, unknown>;
    const connected = Boolean(connection.connected);
    const host = typeof connection.host === "string" ? connection.host : "127.0.0.1";
    const port = typeof connection.port === "number" || typeof connection.port === "string" ? String(connection.port) : "n/a";

    const uptime =
      typeof broker.uptime_seconds === "number" ? `${Math.trunc(broker.uptime_seconds)}s` : "-";

    console.log(`${statusSymbol(connected)} Gateway        ${connected ? "connected" : "disconnected"} (${host}:${port})`);
    console.log(`${statusSymbol(true)} Broker daemon  running (uptime ${uptime})`);
    console.log(`  risk_halted: ${Boolean(broker.risk_halted)}`);
  }

  if (!agents) {
    console.log(`${statusSymbol(false)} Agents daemon  stopped`);
  } else {
    const running = Boolean(agents.running);
    const jobs = typeof agents.jobs === "object" && agents.jobs ? (agents.jobs as Record<string, unknown>) : {};
    const scheduled = typeof jobs.scheduled === "number" ? jobs.scheduled : 0;
    const queued = typeof jobs.queued_for_pi_dev === "number" ? jobs.queued_for_pi_dev : 0;

    const uptime = running && typeof agents.uptime_seconds === "number" ? `${Math.trunc(agents.uptime_seconds)}s` : "-";

    const framework = typeof agents.framework === "string" ? agents.framework : "pi.dev";
    const mode = typeof agents.mode === "string" ? agents.mode : "stub";

    console.log(`${statusSymbol(running)} Agents daemon  ${running ? "running" : "stopped"} (uptime ${uptime})`);
    console.log(`  jobs: scheduled=${scheduled} queued_for_pi_dev=${queued}`);
    console.log(`  framework: ${framework} (${mode})`);
  }

  const provider = asNonEmptyString(config.aiProvider?.provider) || "not set";
  const mode = asNonEmptyString(config.ibkrGatewayMode) || "paper";

  console.log("────────────────────────────────────────────────────────");
  console.log(`AI provider : ${provider}`);
  console.log(`IB mode     : ${mode}`);
  console.log(`Workspace   : ${NORTHBROOK_WORKSPACE}`);
  console.log("Configured keys");
  console.log(`- aiProvider.apiKey: ${configuredKeyLabel(config.aiProvider?.apiKey)}`);
  console.log(`- skills.xApi: ${configuredSkillKey(config, "xApi")}`);
  console.log(`- skills.braveSearchApi: ${configuredSkillKey(config, "braveSearchApi")}`);
  console.log(`- sec.userAgent: ${configuredSecUserAgent(config)}`);
}

async function commandReset(yes: boolean): Promise<void> {
  assertSafeDeleteTarget("NORTHBROOK_HOME", NORTHBROOK_HOME);
  assertSafeDeleteTarget("NORTHBROOK_STATE_HOME", NORTHBROOK_STATE_HOME);
  assertSafeDeleteTarget("NORTHBROOK_DATA_HOME", NORTHBROOK_DATA_HOME);

  if (!yes) {
    if (!stdin.isTTY || !stdout.isTTY) {
      throw new Error("nb reset requires explicit approval. Re-run with --yes for non-interactive use.");
    }

    console.log(`This will permanently delete: ${NORTHBROOK_HOME}`);
    console.log(`This will also clear runtime state: ${NORTHBROOK_STATE_HOME}`);
    console.log(`This will also clear local runtime data: ${NORTHBROOK_DATA_HOME}`);
    console.log("Running broker/agents services will be stopped first.");

    const rl = createInterface({ input: stdin, output: stdout });
    const confirmation = await rl.question("Type RESET to confirm: ");
    rl.close();

    if (confirmation !== "RESET") {
      throw new Error("Reset cancelled.");
    }
  }

  try {
    await runAgentsStop(true);
  } catch {
    // ignore
  }
  try {
    await runCommand(path.join(ROOT_DIR, "broker", "stop.sh"), [], {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    // ignore
  }

  await rm(NORTHBROOK_HOME, { recursive: true, force: true });
  await rm(NORTHBROOK_STATE_HOME, { recursive: true, force: true });
  await rm(NORTHBROOK_DATA_HOME, { recursive: true, force: true });

  await mkdir(NORTHBROOK_WORKSPACE, { recursive: true });
  await mkdir(path.join(NORTHBROOK_STATE_HOME, "logs"), { recursive: true });
  await mkdir(NORTHBROOK_DATA_HOME, { recursive: true });

  if (!commandExists("git")) {
    throw new Error(`git is required to reinitialize ${NORTHBROOK_WORKSPACE}.`);
  }

  const workspaceGit = path.join(NORTHBROOK_WORKSPACE, ".git");
  if (!existsSync(workspaceGit)) {
    const initMain = await runCommand("git", ["init", "-b", "main", NORTHBROOK_WORKSPACE], {
      stdio: "pipe",
      env: process.env,
    });
    if (initMain.code !== 0) {
      await runOrThrow("git", ["init", NORTHBROOK_WORKSPACE], { stdio: "pipe", env: process.env });
      await runCommand("git", ["-C", NORTHBROOK_WORKSPACE, "checkout", "-b", "main"], {
        stdio: "pipe",
        env: process.env,
      });
    }
  }

  const riskJson = path.join(NORTHBROOK_WORKSPACE, "risk.json");
  if (!existsSync(riskJson)) {
    await writeFile(
      riskJson,
      `${JSON.stringify(
        {
          max_position_pct: 10.0,
          max_order_value: 50_000,
          max_daily_loss_pct: 2.0,
        },
        null,
        2
      )}\n`,
      "utf-8"
    );
  }

  const workspaceReadme = path.join(NORTHBROOK_WORKSPACE, "README.md");
  if (!existsSync(workspaceReadme)) {
    await writeFile(
      workspaceReadme,
      [
        "# Northbrook Workspace",
        "",
        "Instance-specific files belong here (for example `risk.json`).",
        "This directory is a git repository so you can commit/push your local policy and strategy files.",
        "",
      ].join("\n"),
      "utf-8"
    );
  }

  const config = {
    aiProvider: {
      provider: "anthropic",
      apiKey: "",
      model: "claude-sonnet-4-5",
    },
    heartbeat: {
      enabled: true,
      intervalMinutes: 30,
    },
    skills: {},
    sec: {
      appName: "Northbrook",
      name: "",
      email: "",
      company: "",
      userAgent: "Northbrook/1.0",
    },
    ibkrUsername: "",
    ibkrPassword: "",
    ibkrGatewayMode: "paper",
    ibkrAutoLogin: false,
  };

  await writeFile(NORTHBROOK_CONFIG_JSON, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  await chmod(NORTHBROOK_CONFIG_JSON, 0o600);

  console.log("Reset complete.");
  console.log(`Reinitialized ${NORTHBROOK_HOME} (config/workspace), ${NORTHBROOK_STATE_HOME} (runtime), and ${NORTHBROOK_DATA_HOME} (data).`);
  console.log("Run `nb setup` to configure credentials and providers.");
}

async function commandUpdate(): Promise<void> {
  if (!commandExists("git")) {
    throw new Error("git is required for nb update. Run ./install/main.sh first.");
  }

  const gitDir = path.join(ROOT_DIR, ".git");
  if (!existsSync(gitDir)) {
    console.error(`No git metadata at ${ROOT_DIR}; rerunning installer.`);
    await runOrThrow(path.join(ROOT_DIR, "install", "main.sh"), ["--skip-onboarding"], {
      stdio: "inherit",
      env: process.env,
    });
    return;
  }

  const dirtyWorktree = await runCommand("git", ["-C", ROOT_DIR, "diff", "--quiet"], {
    stdio: "pipe",
    env: process.env,
  });
  const dirtyIndex = await runCommand("git", ["-C", ROOT_DIR, "diff", "--cached", "--quiet"], {
    stdio: "pipe",
    env: process.env,
  });

  if (dirtyWorktree.code !== 0 || dirtyIndex.code !== 0) {
    throw new Error(`Local changes detected in ${ROOT_DIR}; commit/stash before running nb update.`);
  }

  await runOrThrow("git", ["-C", ROOT_DIR, "fetch", "--depth=1", "origin", "main"], {
    stdio: "inherit",
    env: process.env,
    errorPrefix: "git fetch failed",
  });
  await runOrThrow("git", ["-C", ROOT_DIR, "merge", "--ff-only", "origin/main"], {
    stdio: "inherit",
    env: process.env,
    errorPrefix: "git merge failed",
  });

  await runOrThrow(path.join(ROOT_DIR, "install", "main.sh"), ["--skip-onboarding"], {
    stdio: "inherit",
    env: process.env,
  });
}

async function commandSetup(extraArgs: string[]): Promise<void> {
  await runOrThrow(path.join(ROOT_DIR, "install", "main.sh"), ["--onboarding-only", ...extraArgs], {
    stdio: "inherit",
    env: process.env,
  });
}

async function commandStart(extraArgs: string[]): Promise<void> {
  await loadNorthbrookSecrets();
  await runBrokerStart(extraArgs);
  await runAgentsStart();
}

async function commandRestart(extraArgs: string[]): Promise<void> {
  await loadNorthbrookSecrets();

  await runAgentsStop(true);
  await runCommand(path.join(ROOT_DIR, "broker", "stop.sh"), [], {
    stdio: "pipe",
    env: process.env,
  });

  await runBrokerStart(extraArgs);
  await runAgentsStart();
}

async function commandStop(extraArgs: string[]): Promise<void> {
  await runAgentsStop(false);
  await runBrokerStop(extraArgs);
}

function configureProgram(): Command {
  const program = new Command();

  program
    .name("nb")
    .description("Northbrook CLI for terminal launch, service lifecycle, onboarding, and maintenance.")
    .showHelpAfterError("\nRun `nb --help` to see available commands.")
    .addHelpText(
      "after",
      [
        "",
        "Primary workflows:",
        "  nb                     Launch terminal and bootstrap broker/agents daemons",
        "  nb status              Show gateway + daemon health and key configuration status",
        "  nb start --paper       Start broker and agents daemons",
        "  nb restart --live      Restart services in live mode",
        "  nb setup               Re-run onboarding wizard",
        "",
        "Agent jobs scheduling is intentionally not exposed through `nb`.",
        "Use the scheduled-jobs skill (or agents tooling) for that workflow.",
      ].join("\n")
    );

  program
    .command("run")
    .description("Launch terminal app and bootstrap broker/agents in the background.")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "Pass-through args for daemon and terminal")
    .addHelpText("after", `\n${printRunExamples()}`)
    .action(async (args: string[]) => {
      await runTerminal(args ?? []);
    });

  program
    .command("setup")
    .description("Run onboarding wizard to configure provider keys and IB credentials.")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "Extra args passed to install/main.sh")
    .action(async (args: string[]) => {
      await commandSetup(args ?? []);
    });

  program
    .command("start")
    .description("Start broker and agents daemons.")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "Forwarded to broker/start.sh (e.g., --paper, --live, --gateway)")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  nb start --paper",
        "  nb start --live --gateway 127.0.0.1:4001",
        "  nb start --no-launch-ib --gateway 127.0.0.1:4002",
      ].join("\n")
    )
    .action(async (args: string[]) => {
      await commandStart(args ?? []);
    });

  program
    .command("restart")
    .description("Restart broker and agents daemons.")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "Forwarded to broker/start.sh")
    .action(async (args: string[]) => {
      await commandRestart(args ?? []);
    });

  program
    .command("stop")
    .description("Stop broker and agents daemons.")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "Forwarded to broker/stop.sh")
    .action(async (args: string[]) => {
      await commandStop(args ?? []);
    });

  program
    .command("status")
    .description("Display gateway connectivity plus broker/agents daemon health.")
    .action(async () => {
      await commandStatus();
    });

  program
    .command("update")
    .description("Fast-forward local repo to origin/main and rerun installer.")
    .action(async () => {
      await commandUpdate();
    });

  program
    .command("reset")
    .description("Reset Northbrook config/workspace plus local runtime state/data.")
    .option("-y, --yes", "Skip interactive confirmation")
    .addHelpText(
      "after",
      [
        "",
        "This command permanently deletes ~/.northbrook and Northbrook state/data directories.",
        "Running broker/agents services are stopped before deletion.",
      ].join("\n")
    )
    .action(async (options: { yes?: boolean }) => {
      await commandReset(Boolean(options.yes));
    });

  return program;
}

export async function main(): Promise<void> {
  const program = configureProgram();
  const argv = process.argv.slice(2);

  const knownCommands = new Set(["run", "setup", "start", "restart", "stop", "status", "update", "reset", "help"]);

  if (argv.length === 0) {
    await runTerminal([]);
    return;
  }

  const first = argv[0];

  if (first === "-h" || first === "--help") {
    await program.parseAsync(process.argv);
    return;
  }

  if (knownCommands.has(first)) {
    await program.parseAsync(process.argv);
    return;
  }

  if (first.startsWith("-")) {
    await runTerminal(argv);
    return;
  }

  await program.parseAsync(process.argv);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
