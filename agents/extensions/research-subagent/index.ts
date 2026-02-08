import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

type AgentTemplate = {
  name: string;
  description: string;
  tools?: string[];
  systemPrompt: string;
  sourcePath: string;
};

type ResearchStep = {
  agent: string;
  task: string;
};

type ResearchParams = {
  mode?: "single" | "parallel" | "chain";
  agent?: string;
  task?: string;
  tasks?: ResearchStep[];
  chain?: ResearchStep[];
  cwd?: string;
};

type ResearchResult = {
  agent: string;
  task: string;
  ok: boolean;
  output: string;
  error?: string;
  durationMs: number;
  stopReason?: string;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

const RUNTIME_STATUS_KEY = "research-subagent";
const TOOL_NAME = "research_subagent";
const MAX_STEPS = 6;
const PARALLEL_CONCURRENCY = 3;

const TOOL_PARAMETERS = {
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["single", "parallel", "chain"],
      description: "Execution mode",
    },
    agent: {
      type: "string",
      description: "Agent name for single mode",
    },
    task: {
      type: "string",
      description: "Task text for single mode",
    },
    tasks: {
      type: "array",
      description: "Parallel steps",
      items: {
        type: "object",
        properties: {
          agent: { type: "string" },
          task: { type: "string" },
        },
        required: ["agent", "task"],
      },
    },
    chain: {
      type: "array",
      description: "Sequential chain; supports {previous} interpolation",
      items: {
        type: "object",
        properties: {
          agent: { type: "string" },
          task: { type: "string" },
        },
        required: ["agent", "task"],
      },
    },
    cwd: {
      type: "string",
      description: "Optional working directory",
    },
  },
  required: ["mode"],
} as const;

function resolveTemplateRoot(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "agents", "subagents"),
    path.resolve(cwd, "..", "agents", "subagents"),
    path.resolve(cwd, "subagents"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? path.resolve(cwd, "agents", "subagents");
}

function resolveSkillsRoot(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "agents", "skills"),
    path.resolve(cwd, "..", "agents", "skills"),
    path.resolve(cwd, "skills"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function defaultSkillPaths(): string[] {
  const root = resolveSkillsRoot();
  if (!root) {
    return [];
  }

  const stack = [root];
  const skillPaths: string[] = [];

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
        skillPaths.push(fullPath);
      }
    }
  }

  return skillPaths.sort();
}

function resolveSessionsDir(): string {
  const explicit = process.env.NORTHBROOK_SESSIONS_DIR?.trim();
  if (explicit) {
    return explicit;
  }

  const workspace = process.env.NORTHBROOK_WORKSPACE?.trim() || path.join(os.homedir(), ".northbrook", "workspace");
  return path.join(workspace, "sessions");
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveNorthbrookConfigPath(): string {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_CONFIG_JSON);
  if (fromEnv) {
    return fromEnv;
  }

  const home = asNonEmptyString(process.env.NORTHBROOK_HOME) ?? path.join(os.homedir(), ".northbrook");
  return path.join(home, "northbrook.json");
}

function resolveConfiguredModel(): string | null {
  const configPath = resolveNorthbrookConfigPath();
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw) as { aiProvider?: { model?: unknown } };
      const model = parsed?.aiProvider?.model;
      return asNonEmptyString(model);
    } catch {
      // ignore malformed config and fall back to env
    }
  }

  return asNonEmptyString(process.env.NORTHBROOK_AI_MODEL);
}

function trimOuterQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  if (!raw.startsWith("---\n")) {
    return { fields: {}, body: raw.trim() };
  }

  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return { fields: {}, body: raw.trim() };
  }

  const fm = raw.slice(4, end).trim();
  const body = raw.slice(end + 5).trim();
  const fields: Record<string, string> = {};

  for (const line of fm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = trimOuterQuotes(line.slice(idx + 1).trim());
    if (key && value) {
      fields[key] = value;
    }
  }

  return { fields, body };
}

function loadAgentTemplates(): AgentTemplate[] {
  const root = resolveTemplateRoot();
  if (!existsSync(root)) {
    return [];
  }

  const stack = [root];
  const templates: AgentTemplate[] = [];

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

      if (!entry.endsWith(".agent.md")) {
        continue;
      }

      let raw = "";
      try {
        raw = readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }

      const parsed = parseFrontmatter(raw);
      const name = parsed.fields.name || entry.replace(/\.agent\.md$/, "");
      if (!name) {
        continue;
      }

      const tools = parsed.fields.tools
        ? parsed.fields.tools
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : undefined;

      templates.push({
        name,
        description: parsed.fields.description || `${name} research template`,
        tools,
        systemPrompt: parsed.body,
        sourcePath: fullPath,
      });
    }
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

function coerceStep(value: unknown): ResearchStep | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { agent?: unknown; task?: unknown };
  if (typeof record.agent !== "string" || typeof record.task !== "string") {
    return null;
  }
  if (!record.agent.trim() || !record.task.trim()) {
    return null;
  }
  return {
    agent: record.agent.trim(),
    task: record.task,
  };
}

function extractSteps(value: unknown): ResearchStep[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => coerceStep(item)).filter((item): item is ResearchStep => item !== null);
}

function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  if ((message as { role?: unknown }).role !== "assistant") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  const textParts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    if ((block as { type?: unknown }).type !== "text") {
      continue;
    }
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string" && text.trim().length > 0) {
      textParts.push(text.trim());
    }
  }

  return textParts.join("\n").trim();
}

async function runSingleAgent(
  template: AgentTemplate,
  task: string,
  cwd: string,
  signal?: AbortSignal
): Promise<ResearchResult> {
  const startedAt = Date.now();
  const sessionsDir = resolveSessionsDir();
  mkdirSync(sessionsDir, { recursive: true });
  const args = ["--mode", "json", "-p", "--session-dir", sessionsDir];

  const model = resolveConfiguredModel();
  if (model) {
    args.push("--model", model);
  }
  for (const skillPath of defaultSkillPaths()) {
    args.push("--skill", skillPath);
  }
  if (template.tools && template.tools.length > 0) {
    args.push("--tools", template.tools.join(","));
  }

  let tmpDir: string | null = null;
  if (template.systemPrompt.trim().length > 0) {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "northbrook-research-"));
    const promptPath = path.join(tmpDir, `${template.name.replace(/[^a-zA-Z0-9._-]/g, "_")}.md`);
    writeFileSync(promptPath, template.systemPrompt, { encoding: "utf8", mode: 0o600 });
    args.push("--append-system-prompt", promptPath);
  }

  args.push(`Task: ${task}`);

  let lastAssistantText = "";
  let stopReason: string | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("pi", args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          NORTHBROOK_SESSIONS_DIR: sessionsDir,
        },
      });

      let stderr = "";
      const stdoutReader = createInterface({ input: proc.stdout });
      stdoutReader.on("line", (line) => {
        if (!line.trim()) {
          return;
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }

        if (event.type === "message_end") {
          const text = extractTextFromMessage(event.message);
          if (text) {
            lastAssistantText = text;
          }
        }

        if (event.type === "turn_end" && event.message && typeof event.message === "object") {
          const sr = (event.message as { stopReason?: unknown }).stopReason;
          if (typeof sr === "string" && sr.trim().length > 0) {
            stopReason = sr;
          }
        }
      });

      const stderrReader = createInterface({ input: proc.stderr });
      stderrReader.on("line", (line) => {
        if (line.trim().length > 0) {
          stderr += `${line}\n`;
        }
      });

      const abortHandler = () => {
        proc.kill("SIGTERM");
      };
      signal?.addEventListener("abort", abortHandler);

      proc.on("error", (error) => {
        signal?.removeEventListener("abort", abortHandler);
        reject(error);
      });

      proc.on("close", (code) => {
        signal?.removeEventListener("abort", abortHandler);
        if (signal?.aborted) {
          reject(new Error("research subagent aborted"));
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `subagent exited with code ${code ?? "unknown"}`));
      });
    });

    return {
      agent: template.name,
      task,
      ok: true,
      output: lastAssistantText,
      durationMs: Date.now() - startedAt,
      stopReason,
    };
  } catch (error) {
    return {
      agent: template.name,
      task,
      ok: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  fn: (value: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (values.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, values.length));
  const results = new Array<TOutput>(values.length);
  let cursor = 0;

  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) {
        return;
      }
      results[index] = await fn(values[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

function renderResults(mode: string, results: ResearchResult[]): string {
  const lines = [`Research subagent run complete (${mode})`, ""];

  for (const result of results) {
    lines.push(`- ${result.ok ? "OK" : "ERR"} ${result.agent} (${Math.round(result.durationMs)}ms)`);
    lines.push(`  task: ${result.task}`);
    if (result.ok) {
      lines.push(`  output: ${result.output || "(no assistant text)"}`);
      if (result.stopReason) {
        lines.push(`  stopReason: ${result.stopReason}`);
      }
    } else {
      lines.push(`  error: ${result.error || "unknown error"}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function runWorkflow(
  input: ResearchParams,
  signal?: AbortSignal,
  onUpdate?: (partial: ToolResult) => void,
  onStatus?: (value?: string) => void
): Promise<ToolResult> {
  const templates = loadAgentTemplates();
  const byName = new Map(templates.map((template) => [template.name, template]));

  const mode = input.mode ?? "single";
  const cwd = typeof input.cwd === "string" && input.cwd.trim().length > 0 ? input.cwd : process.cwd();

  if (templates.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "research_subagent: no templates found under agents/subagents/*.agent.md",
        },
      ],
      details: {
        mode,
        results: [],
      },
    };
  }

  const emit = (status: string, results: ResearchResult[]) => {
    onStatus?.(status);
    onUpdate?.({
      content: [{ type: "text", text: status }],
      details: { mode, results },
    });
  };

  const results: ResearchResult[] = [];

  if (mode === "single") {
    const agent = typeof input.agent === "string" ? input.agent.trim() : "";
    const task = typeof input.task === "string" ? input.task : "";
    if (!agent || !task.trim()) {
      throw new Error("single mode requires non-empty agent and task");
    }

    const template = byName.get(agent);
    if (!template) {
      throw new Error(`unknown research agent: ${agent}`);
    }

    emit(`running ${template.name}...`, results);
    results.push(await runSingleAgent(template, task, cwd, signal));
  } else if (mode === "parallel") {
    const tasks = extractSteps(input.tasks);
    if (tasks.length === 0) {
      throw new Error("parallel mode requires non-empty tasks[]");
    }
    if (tasks.length > MAX_STEPS) {
      throw new Error(`parallel mode supports up to ${MAX_STEPS} tasks`);
    }

    const resolved = tasks.map((task) => {
      const template = byName.get(task.agent);
      if (!template) {
        throw new Error(`unknown research agent: ${task.agent}`);
      }
      return { template, task: task.task };
    });

    emit(`running ${resolved.length} parallel research steps...`, results);
    const parallel = await mapWithConcurrency(
      resolved,
      PARALLEL_CONCURRENCY,
      async ({ template, task }) => {
        const result = await runSingleAgent(template, task, cwd, signal);
        results.push(result);
        emit(`completed ${results.length}/${resolved.length} steps`, [...results]);
        return result;
      }
    );

    results.length = 0;
    results.push(...parallel);
  } else if (mode === "chain") {
    const chain = extractSteps(input.chain);
    if (chain.length === 0) {
      throw new Error("chain mode requires non-empty chain[]");
    }
    if (chain.length > MAX_STEPS) {
      throw new Error(`chain mode supports up to ${MAX_STEPS} steps`);
    }

    let previous = "";
    for (let i = 0; i < chain.length; i += 1) {
      const step = chain[i];
      const template = byName.get(step.agent);
      if (!template) {
        throw new Error(`unknown research agent: ${step.agent}`);
      }

      const task = step.task.replaceAll("{previous}", previous);
      emit(`running chain step ${i + 1}/${chain.length}: ${template.name}`, [...results]);

      const result = await runSingleAgent(template, task, cwd, signal);
      results.push(result);
      if (!result.ok) {
        break;
      }
      previous = result.output;
    }
  } else {
    throw new Error(`unknown mode: ${String(mode)}`);
  }

  onStatus?.(undefined);

  return {
    content: [{ type: "text", text: renderResults(mode, results) }],
    details: {
      mode,
      results,
      availableAgents: templates.map((template) => ({
        name: template.name,
        description: template.description,
        tools: template.tools,
        sourcePath: template.sourcePath,
      })),
    },
  };
}

export default function researchSubagentExtension(pi: {
  registerTool?: (tool: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (
      toolCallId: string,
      params: ResearchParams,
      signal?: AbortSignal,
      onUpdate?: (partial: ToolResult) => void,
      ctx?: { ui?: { setStatus?: (key: string, value?: string) => void } }
    ) => Promise<ToolResult>;
  }) => void;
  registerCommand?: (
    name: string,
    command: {
      description: string;
      handler: (
        args: string,
        ctx: { ui?: { notify?: (message: string, type?: "info" | "warning" | "error") => void } }
      ) => Promise<void>;
    }
  ) => void;
  on?: (
    event: string,
    handler: (_event: unknown, ctx: { ui?: { setStatus?: (key: string, value?: string) => void } }) => void
  ) => void;
  sendMessage?: (
    message: { customType?: string; content: string; display?: boolean },
    options?: { triggerTurn?: boolean }
  ) => void;
}): void {
  pi.registerTool?.({
    name: TOOL_NAME,
    label: "Research Subagent",
    description:
      "Run delegated research workflows using templates from agents/subagents/*.agent.md",
    parameters: TOOL_PARAMETERS,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return runWorkflow(params, signal, onUpdate, (value) => {
        ctx?.ui?.setStatus?.(RUNTIME_STATUS_KEY, value);
      });
    },
  });

  pi.registerCommand?.("research-workflow", {
    description:
      "Run research_subagent using JSON args. Example: /research-workflow {\"mode\":\"single\",\"agent\":\"scout\",\"task\":\"summarize semis\"}",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui?.notify?.("research-workflow requires JSON args", "warning");
        return;
      }

      let parsed: ResearchParams;
      try {
        parsed = JSON.parse(args) as ResearchParams;
      } catch {
        ctx.ui?.notify?.("research-workflow args must be valid JSON", "error");
        return;
      }

      try {
        const result = await runWorkflow(parsed);
        const text = result.content[0]?.text ?? "research workflow complete";
        pi.sendMessage?.(
          {
            customType: "research-workflow-result",
            content: text,
            display: true,
          },
          { triggerTurn: false }
        );
      } catch (error) {
        ctx.ui?.notify?.(
          error instanceof Error ? `research workflow failed: ${error.message}` : "research workflow failed",
          "error"
        );
      }
    },
  });

  pi.on?.("session_start", (_event, ctx) => {
    ctx.ui?.setStatus?.(RUNTIME_STATUS_KEY, undefined);
  });
}
