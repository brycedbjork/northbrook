import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import researchSubagentExtension from "../extensions/research-subagent/index.js";
import { cleanupFixture, makeFixture, writeExecutable, type TestFixture } from "./helpers.js";

type RegisteredTool = {
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: (partial: { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }) => void,
    ctx?: { ui?: { setStatus?: (key: string, value?: string) => void } }
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }>;
};

type RegisteredCommand = {
  handler: (
    args: string,
    ctx: { ui?: { notify?: (message: string, type?: "info" | "warning" | "error") => void } }
  ) => Promise<void>;
};

let fixture: TestFixture;
let originalPath: string | undefined;
let originalWorkspace: string | undefined;
let originalSessionsDir: string | undefined;
let originalHome: string | undefined;
let originalConfigJson: string | undefined;
let originalModel: string | undefined;

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === "string") {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
}

beforeEach(async () => {
  fixture = await makeFixture("research-ext");
  fixture.env.NB_PI_ARGS_LOG = path.join(fixture.tempRoot, "pi-args.log");
  originalPath = process.env.PATH;
  originalWorkspace = process.env.NORTHBROOK_WORKSPACE;
  originalSessionsDir = process.env.NORTHBROOK_SESSIONS_DIR;
  originalHome = process.env.NORTHBROOK_HOME;
  originalConfigJson = process.env.NORTHBROOK_CONFIG_JSON;
  originalModel = process.env.NORTHBROOK_AI_MODEL;
  process.env.PATH = `${fixture.binDir}:${originalPath || ""}`;
  process.env.NORTHBROOK_WORKSPACE = fixture.workspaceDir;
  process.env.NORTHBROOK_SESSIONS_DIR = path.join(fixture.workspaceDir, "sessions");
  process.env.NORTHBROOK_HOME = fixture.homeDir;
  process.env.NORTHBROOK_CONFIG_JSON = path.join(fixture.homeDir, "northbrook.json");
  delete process.env.NORTHBROOK_AI_MODEL;
  process.env.NB_PI_ARGS_LOG = fixture.env.NB_PI_ARGS_LOG;

  await Bun.write(
    process.env.NORTHBROOK_CONFIG_JSON,
    `${JSON.stringify({ aiProvider: { model: "configured-model" } }, null, 2)}\n`
  );

  await writeExecutable(
    path.join(fixture.binDir, "pi"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "\${NB_PI_ARGS_LOG:?}"
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"mock research output"}]}}'
echo '{"type":"turn_end","message":{"stopReason":"end_turn"}}'
`
  );
});

afterEach(async () => {
  restoreEnv("PATH", originalPath);
  restoreEnv("NORTHBROOK_WORKSPACE", originalWorkspace);
  restoreEnv("NORTHBROOK_SESSIONS_DIR", originalSessionsDir);
  restoreEnv("NORTHBROOK_HOME", originalHome);
  restoreEnv("NORTHBROOK_CONFIG_JSON", originalConfigJson);
  restoreEnv("NORTHBROOK_AI_MODEL", originalModel);
  delete process.env.NB_PI_ARGS_LOG;
  await cleanupFixture(fixture);
});

describe("research-subagent extension", () => {
  test("registers tool and executes single workflow", async () => {
    const tools = new Map<string, RegisteredTool>();
    const statuses: Array<{ key: string; value?: string }> = [];

    researchSubagentExtension({
      registerTool(tool) {
        tools.set(tool.name, tool as RegisteredTool);
      }
    });

    const tool = tools.get("research_subagent");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("research_subagent tool missing");
    }

    const result = await tool.execute(
      "call-1",
      { mode: "single", agent: "scout", task: "summarize semis" },
      undefined,
      undefined,
      {
        ui: {
          setStatus(key: string, value?: string) {
            statuses.push({ key, value });
          }
        }
      }
    );

    const text = result?.content[0]?.text ?? "";
    expect(text).toContain("Research subagent run complete (single)");
    expect(text).toContain("OK scout");
    expect(text).toContain("mock research output");
    expect(statuses.some((entry) => entry.key === "research-subagent")).toBe(true);
    expect(statuses[statuses.length - 1]?.value).toBeUndefined();

    const argsLog = await Bun.file(fixture.env.NB_PI_ARGS_LOG || "").text();
    expect(argsLog).toContain("--session-dir");
    expect(argsLog).toContain(path.join(fixture.workspaceDir, "sessions"));
    expect(argsLog).toContain("--model configured-model");
    expect(argsLog).toContain("--skill");
    expect(argsLog).toContain(path.join("agents", "skills", "web-search", "SKILL.md"));
    expect(argsLog).toContain(path.join("agents", "skills", "public-company-filings", "SKILL.md"));
  });

  test("executes parallel and chain workflows", async () => {
    const tools = new Map<string, RegisteredTool>();

    researchSubagentExtension({
      registerTool(tool) {
        tools.set(tool.name, tool as RegisteredTool);
      }
    });

    const tool = tools.get("research_subagent");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("research_subagent tool missing");
    }

    const parallel = await tool.execute("call-p", {
      mode: "parallel",
      tasks: [
        { agent: "scout", task: "task 1" },
        { agent: "planner", task: "task 2" }
      ]
    });
    expect(parallel?.content[0]?.text).toContain("Research subagent run complete (parallel)");
    expect(parallel?.content[0]?.text).toContain("OK scout");
    expect(parallel?.content[0]?.text).toContain("OK planner");

    const chain = await tool.execute("call-c", {
      mode: "chain",
      chain: [
        { agent: "scout", task: "step one" },
        { agent: "synthesizer", task: "step two with {previous}" }
      ]
    });
    expect(chain?.content[0]?.text).toContain("Research subagent run complete (chain)");
    expect(chain?.content[0]?.text).toContain("OK scout");
    expect(chain?.content[0]?.text).toContain("OK synthesizer");
  });

  test("rejects invalid workflow arguments", async () => {
    const tools = new Map<string, RegisteredTool>();
    researchSubagentExtension({
      registerTool(tool) {
        tools.set(tool.name, tool as RegisteredTool);
      }
    });

    const tool = tools.get("research_subagent");
    if (!tool) {
      throw new Error("research_subagent tool missing");
    }
    await expect(
      tool.execute("bad-1", { mode: "single", agent: "unknown", task: "x" } as Record<string, unknown>)
    ).rejects.toThrow("unknown research agent");
    await expect(
      tool.execute("bad-2", { mode: "parallel", tasks: [] } as Record<string, unknown>)
    ).rejects.toThrow("parallel mode requires non-empty tasks[]");
  });

  test("registers command and reports parse/runtime errors", async () => {
    const commands = new Map<string, RegisteredCommand>();
    const sentMessages: string[] = [];
    const notifications: Array<{ message: string; type?: string }> = [];
    let sessionStartHandler:
      | ((_event: unknown, ctx: { ui?: { setStatus?: (key: string, value?: string) => void } }) => void)
      | null = null;
    const statuses: Array<{ key: string; value?: string }> = [];

    researchSubagentExtension({
      registerCommand(name, command) {
        commands.set(name, command as RegisteredCommand);
      },
      sendMessage(message) {
        sentMessages.push(message.content);
      },
      on(event, handler) {
        if (event === "session_start") {
          sessionStartHandler = handler;
        }
      }
    });

    const command = commands.get("research-workflow");
    expect(command).toBeDefined();
    if (!command) {
      throw new Error("research-workflow command missing");
    }

    await command.handler("", {
      ui: {
        notify(message: string, type?: "info" | "warning" | "error") {
          notifications.push({ message, type });
        }
      }
    });
    expect(notifications[0]?.message).toContain("requires JSON args");

    await command.handler("{bad-json", {
      ui: {
        notify(message: string, type?: "info" | "warning" | "error") {
          notifications.push({ message, type });
        }
      }
    });
    expect(notifications.some((note) => note.message.includes("must be valid JSON"))).toBe(true);

    await command.handler('{"mode":"single","agent":"scout","task":"quick check"}', {
      ui: {
        notify(message: string, type?: "info" | "warning" | "error") {
          notifications.push({ message, type });
        }
      }
    });
    expect(sentMessages.some((message) => message.includes("Research subagent run complete"))).toBe(true);

    sessionStartHandler?.(
      {},
      {
        ui: {
          setStatus(key: string, value?: string) {
            statuses.push({ key, value });
          }
        }
      }
    );
    expect(statuses).toContainEqual({ key: "research-subagent", value: undefined });
  });
});
