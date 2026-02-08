import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

export type PiStreamingBehavior = "steer" | "followUp";

export type PiRpcResponse = {
  type: "response";
  id?: string;
  command?: string;
  success?: boolean;
  error?: string;
  data?: unknown;
};

export type PiRpcEvent = {
  type: string;
  [key: string]: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PiRpcListener = (event: PiRpcEvent) => void;

function asNonEmptyString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(typeof value === "string" ? value : JSON.stringify(value));
}

function resolveNorthbrookConfigPath(): string {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_CONFIG_JSON);
  if (fromEnv) {
    return fromEnv;
  }

  const home = asNonEmptyString(process.env.NORTHBROOK_HOME) ?? path.join(homedir(), ".northbrook");
  return path.join(home, "northbrook.json");
}

function resolveConfiguredModel(): string | null {
  const configPath = resolveNorthbrookConfigPath();
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw) as { aiProvider?: { model?: unknown } };
      const model = parsed?.aiProvider?.model;
      if (typeof model === "string" && model.trim().length > 0) {
        return model.trim();
      }
    } catch {
      // ignore malformed config and fall back to env
    }
  }

  return asNonEmptyString(process.env.NORTHBROOK_AI_MODEL);
}

function defaultSkillPaths(): string[] {
  const terminalDir = process.cwd();
  const skillsRoot = path.resolve(terminalDir, "..", "agents", "skills");
  if (!existsSync(skillsRoot)) {
    return [];
  }

  const stack = [skillsRoot];
  const skills: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry);
      let stats: ReturnType<typeof statSync> | null = null;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry === "SKILL.md") {
        skills.push(fullPath);
      }
    }
  }

  return skills.sort();
}

function defaultExtensionPaths(): string[] {
  const terminalDir = process.cwd();
  const extensionsRoot = path.resolve(terminalDir, "..", "agents", "extensions");
  if (!existsSync(extensionsRoot)) {
    return [];
  }

  const stack = [extensionsRoot];
  const extensions: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry);
      let stats: ReturnType<typeof statSync> | null = null;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.endsWith(".ts") || entry.endsWith(".js")) {
        extensions.push(fullPath);
      }
    }
  }

  return extensions.sort();
}

function defaultPromptTemplatePaths(): string[] {
  const subagentsRoot = resolveSubagentsRootPath();
  if (!subagentsRoot) {
    return [];
  }

  const stack = [subagentsRoot];
  const prompts: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry);
      let stats: ReturnType<typeof statSync> | null = null;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.endsWith(".md")) {
        continue;
      }

      if (entry === "README.md") {
        continue;
      }

      if (entry.endsWith(".agent.md")) {
        continue;
      }

      prompts.push(fullPath);
    }
  }

  return prompts.sort();
}

function resolveSubagentsRootPath(): string | null {
  const terminalDir = process.cwd();
  const candidates = [
    path.resolve(terminalDir, "..", "agents", "subagents"),
    path.resolve(terminalDir, "agents", "subagents"),
    path.resolve(terminalDir, "subagents")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveSystemPromptPath(): string | null {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_SYSTEM_PROMPT);
  if (fromEnv) {
    return existsSync(fromEnv) ? fromEnv : null;
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "..", "agents", "SYSTEM.md"),
    path.resolve(cwd, "agents", "SYSTEM.md"),
    path.resolve(cwd, "SYSTEM.md")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveSessionsDir(): string {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_SESSIONS_DIR);
  if (fromEnv) {
    return fromEnv;
  }

  const workspace =
    asNonEmptyString(process.env.NORTHBROOK_WORKSPACE) ?? path.join(homedir(), ".northbrook", "workspace");
  return path.join(workspace, "sessions");
}

export class PiRpcClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private requestCounter = 0;
  private pending = new Map<string, PendingRequest>();
  private listeners = new Set<PiRpcListener>();
  private startupPromise: Promise<void> | null = null;
  private cleanupRegistered = false;

  async start(): Promise<void> {
    if (this.process) {
      return;
    }
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = new Promise<void>((resolve, reject) => {
      const piBin = asNonEmptyString(process.env.NORTHBROOK_PI_BIN) ?? "pi";
      const sessionsDir = resolveSessionsDir();
      mkdirSync(sessionsDir, { recursive: true });
      const args = ["--mode", "rpc", "--session-dir", sessionsDir];

      const provider = asNonEmptyString(process.env.NORTHBROOK_AI_PROVIDER);
      if (provider) {
        args.push("--provider", provider);
      }

      const model = resolveConfiguredModel();
      if (model) {
        args.push("--model", model);
      }

      const systemPromptPath = resolveSystemPromptPath();
      if (systemPromptPath) {
        args.push("--append-system-prompt", systemPromptPath);
      }

      for (const skillPath of defaultSkillPaths()) {
        args.push("--skill", skillPath);
      }
      for (const extensionPath of defaultExtensionPaths()) {
        args.push("--extension", extensionPath);
      }
      for (const promptPath of defaultPromptTemplatePaths()) {
        args.push("--prompt-template", promptPath);
      }

      const proc = spawn(piBin, args, {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          NORTHBROOK_SESSIONS_DIR: sessionsDir
        },
      });

      this.process = proc;
      this.registerCleanupHandlers();

      let resolved = false;
      const finishStart = (error?: Error) => {
        if (resolved) {
          return;
        }
        resolved = true;
        this.startupPromise = null;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      proc.once("spawn", () => {
        this.emit({ type: "pi_process_started" });
        finishStart();
      });

      proc.once("error", (error) => {
        this.handleProcessStop(error);
        finishStart(toError(error));
      });

      proc.once("close", (code, signal) => {
        this.handleProcessStop(new Error(`pi RPC process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`));
      });

      const stdoutReader = createInterface({ input: proc.stdout });
      stdoutReader.on("line", (line) => {
        this.handleStdoutLine(line);
      });

      const stderrReader = createInterface({ input: proc.stderr });
      stderrReader.on("line", (line) => {
        if (!line.trim()) {
          return;
        }
        this.emit({ type: "pi_stderr", line });
      });
    });

    return this.startupPromise;
  }

  dispose(): void {
    for (const [id, request] of this.pending.entries()) {
      clearTimeout(request.timer);
      request.reject(new Error(`RPC request ${id} aborted: client disposed`));
    }
    this.pending.clear();

    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.startupPromise = null;
  }

  private registerCleanupHandlers(): void {
    if (this.cleanupRegistered) {
      return;
    }
    this.cleanupRegistered = true;

    process.once("exit", () => {
      this.dispose();
    });
  }

  onEvent(listener: PiRpcListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async prompt(message: string, streamingBehavior?: PiStreamingBehavior, timeoutMs = 60_000): Promise<void> {
    const payload: Record<string, unknown> = {
      type: "prompt",
      message,
    };
    if (streamingBehavior) {
      payload.streamingBehavior = streamingBehavior;
    }
    await this.send(payload, timeoutMs);
  }

  private async send(payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    await this.start();

    if (!this.process) {
      throw new Error("pi RPC process is not available");
    }

    const id = `rpc-${++this.requestCounter}`;
    const fullPayload = {
      ...payload,
      id,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC request timed out: ${String(payload.type)}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve,
        reject,
        timer,
      });

      this.process?.stdin.write(`${JSON.stringify(fullPayload)}\n`, (error) => {
        if (!error) {
          return;
        }
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(toError(error));
      });
    });
  }

  private handleStdoutLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let payload: PiRpcResponse | PiRpcEvent;
    try {
      payload = JSON.parse(line) as PiRpcResponse | PiRpcEvent;
    } catch {
      this.emit({ type: "pi_unparsed_stdout", line });
      return;
    }

    if (payload.type === "response") {
      this.handleResponse(payload as PiRpcResponse);
      return;
    }

    if (payload.type === "extension_ui_request") {
      this.handleExtensionUiRequest(payload);
    }

    this.emit(payload);
  }

  private handleResponse(response: PiRpcResponse): void {
    const id = response.id;
    if (!id) {
      return;
    }

    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (response.success === false) {
      pending.reject(new Error(response.error ?? `RPC command failed: ${response.command ?? "unknown"}`));
      return;
    }

    pending.resolve(response.data);
  }

  private handleExtensionUiRequest(event: PiRpcEvent): void {
    const method = typeof event.method === "string" ? event.method : "";
    const id = typeof event.id === "string" ? event.id : "";

    if (!this.process || !id) {
      return;
    }

    if (method === "confirm") {
      this.process.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id, confirmed: false })}\n`);
      return;
    }

    if (method === "select") {
      this.process.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id, cancelled: true })}\n`);
      return;
    }

    if (method === "input" || method === "editor") {
      this.process.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id, cancelled: true })}\n`);
    }
  }

  private handleProcessStop(error: Error): void {
    for (const [id, request] of this.pending.entries()) {
      clearTimeout(request.timer);
      request.reject(new Error(`RPC request ${id} failed: ${error.message}`));
    }
    this.pending.clear();

    this.process = null;
    this.startupPromise = null;

    this.emit({ type: "pi_process_stopped", error: error.message });
  }

  private emit(event: PiRpcEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

let _client: PiRpcClient | null = null;

export function getPiRpcClient(): PiRpcClient {
  if (_client) {
    return _client;
  }
  _client = new PiRpcClient();
  return _client;
}
