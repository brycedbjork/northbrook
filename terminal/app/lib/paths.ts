import { homedir } from "node:os";
import path from "node:path";

const HOME = process.env.NORTHBROOK_HOME ?? path.join(homedir(), ".northbrook");
const WORKSPACE = process.env.NORTHBROOK_WORKSPACE ?? path.join(HOME, "workspace");

export const paths = {
  northbrookHome: HOME,
  workspaceDir: WORKSPACE,
  strategiesDir: path.join(WORKSPACE, "strategies"),
  positionsDir: path.join(WORKSPACE, "positions"),
  researchDir: path.join(WORKSPACE, "research"),
  sessionsDir: path.join(WORKSPACE, "sessions"),
} as const;
