import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const AGENTS_ROOT = path.resolve(import.meta.dir, "..");
export const REPO_ROOT = path.resolve(AGENTS_ROOT, "..");

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type TestFixture = {
  tempRoot: string;
  homeDir: string;
  stateDir: string;
  workspaceDir: string;
  binDir: string;
  env: NodeJS.ProcessEnv;
};

export async function makeFixture(label: string): Promise<TestFixture> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `northbrook-agents-${label}-`));
  const homeDir = path.join(tempRoot, "home");
  const stateBaseDir = path.join(tempRoot, "state");
  const stateDir = path.join(stateBaseDir, "northbrook");
  const workspaceDir = path.join(homeDir, "workspace");
  const binDir = path.join(tempRoot, "bin");

  await mkdir(homeDir, { recursive: true });
  await mkdir(stateBaseDir, { recursive: true });
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(binDir, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NORTHBROOK_HOME: homeDir,
    XDG_STATE_HOME: stateBaseDir,
    NORTHBROOK_WORKSPACE: workspaceDir,
    PATH: `${binDir}:${process.env.PATH || ""}`
  };

  return {
    tempRoot,
    homeDir,
    stateDir,
    workspaceDir,
    binDir,
    env
  };
}

export async function cleanupFixture(fixture: TestFixture): Promise<void> {
  await rm(fixture.tempRoot, { recursive: true, force: true });
}

export async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, "utf8");
  await chmod(filePath, 0o755);
}

export async function runBunScript(
  scriptRelativePath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd = AGENTS_ROOT
): Promise<RunResult> {
  const scriptPath = path.join(AGENTS_ROOT, scriptRelativePath);
  const proc = Bun.spawn({
    cmd: [process.execPath, scriptPath, ...args],
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  return { code, stdout, stderr };
}

export async function runShellScript(
  scriptRelativePath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd = AGENTS_ROOT
): Promise<RunResult> {
  const scriptPath = path.join(AGENTS_ROOT, scriptRelativePath);
  const proc = Bun.spawn({
    cmd: ["/usr/bin/env", "bash", scriptPath, ...args],
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  return { code, stdout, stderr };
}

export async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
  intervalMs = 100
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await Bun.sleep(intervalMs);
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}
