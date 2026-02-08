import path from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

const HOME = process.env.NORTHBROOK_HOME ?? path.join(homedir(), ".northbrook");
const STATE_BASE = process.env.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state");
const STATE_HOME = process.env.NORTHBROOK_STATE_HOME ?? path.join(STATE_BASE, "northbrook");
const AGENTS_HOME = process.env.NORTHBROOK_AGENTS_HOME ?? path.join(STATE_HOME, "agents");
const WORKSPACE = process.env.NORTHBROOK_WORKSPACE ?? path.join(HOME, "workspace");

function resolveSubagentsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "agents", "subagents"),
    path.resolve(process.cwd(), "subagents"),
    path.resolve(process.cwd(), "..", "agents", "subagents")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? path.resolve(process.cwd(), "agents", "subagents");
}

function resolveSkillsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "agents", "skills"),
    path.resolve(process.cwd(), "skills"),
    path.resolve(process.cwd(), "..", "agents", "skills")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? path.resolve(process.cwd(), "agents", "skills");
}

export const paths = {
  northbrookHome: HOME,
  stateHome: STATE_HOME,
  workspaceDir: WORKSPACE,
  sessionsDir: process.env.NORTHBROOK_SESSIONS_DIR ?? path.join(WORKSPACE, "sessions"),
  agentsDir: AGENTS_HOME,
  researchDir: process.env.NORTHBROOK_RESEARCH_DIR ?? path.join(WORKSPACE, "research"),
  subagentsDir: process.env.NORTHBROOK_AGENTS_SUBAGENTS_DIR ?? resolveSubagentsDir(),
  skillsDir: process.env.NORTHBROOK_AGENTS_SKILLS_DIR ?? resolveSkillsDir(),
  jobsFile: process.env.NORTHBROOK_JOBS_FILE ?? path.join(WORKSPACE, "scheduled-jobs.json"),
  pidFile: process.env.NORTHBROOK_AGENTS_PID_FILE ?? path.join(AGENTS_HOME, "agents-daemon.pid"),
  statusFile:
    process.env.NORTHBROOK_AGENTS_STATUS_FILE ?? path.join(AGENTS_HOME, "agents-daemon.status.json"),
  logFile: process.env.NORTHBROOK_AGENTS_LOG_FILE ?? path.join(AGENTS_HOME, "agents-daemon.log"),
  artifactsDir: process.env.NORTHBROOK_AGENTS_ARTIFACTS_DIR ?? path.join(AGENTS_HOME, "artifacts"),
  executionsLogFile:
    process.env.NORTHBROOK_AGENTS_EXECUTIONS_LOG_FILE ??
    path.join(AGENTS_HOME, "scheduled-job-executions.jsonl")
};
