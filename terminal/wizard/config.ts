import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, DEFAULT_MODELS } from "./options.js";
import type { GatewayMode, ProviderId, SkillId, WizardConfig } from "./types.js";

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "google"];
const SKILLS: SkillId[] = ["xApi", "braveSearchApi"];
const GATEWAY_MODES: GatewayMode[] = ["paper", "live"];

function asNonEmptyString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function normalizeProvider(value: unknown): ProviderId {
  const normalized = asNonEmptyString(value).toLowerCase();
  if (PROVIDERS.includes(normalized as ProviderId)) {
    return normalized as ProviderId;
  }
  return "anthropic";
}

function normalizeGatewayMode(value: unknown): GatewayMode {
  const normalized = asNonEmptyString(value).toLowerCase();
  if (GATEWAY_MODES.includes(normalized as GatewayMode)) {
    return normalized as GatewayMode;
  }
  return "paper";
}

function normalizeHeartbeatInterval(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_CONFIG.heartbeat.intervalMinutes;
}

function buildSecUserAgent(input: {
  appName: string;
  name: string;
  email: string;
  company: string;
}): string {
  const appName = asNonEmptyString(input.appName) || "Northbrook";
  const base = `${appName}/1.0`;
  const contactParts = [input.name, input.company, input.email]
    .map((value) => asNonEmptyString(value))
    .filter((value) => value.length > 0);
  if (contactParts.length === 0) {
    return base;
  }
  return `${base} (${contactParts.join(", ")})`;
}

export function normalizeConfig(raw: unknown): WizardConfig {
  const source = isRecord(raw) ? raw : {};

  const aiProviderRaw = isRecord(source.aiProvider) ? source.aiProvider : {};
  const provider = normalizeProvider(aiProviderRaw.provider);
  const model = asNonEmptyString(aiProviderRaw.model) || DEFAULT_MODELS[provider];
  const heartbeatRaw = isRecord(source.heartbeat) ? source.heartbeat : {};
  const secRaw = isRecord(source.sec) ? source.sec : {};

  const rawSkills = isRecord(source.skills) ? source.skills : {};
  const skills: WizardConfig["skills"] = {};
  for (const skillId of SKILLS) {
    const skillConfig = rawSkills[skillId];
    if (isRecord(skillConfig)) {
      skills[skillId] = {
        apiKey: asNonEmptyString(skillConfig.apiKey),
      };
    }
  }

  const secAppName = asNonEmptyString(secRaw.appName) || DEFAULT_CONFIG.sec.appName;
  const secName = asNonEmptyString(secRaw.name);
  const secEmail = asNonEmptyString(secRaw.email);
  const secCompany = asNonEmptyString(secRaw.company);
  const secUserAgent =
    asNonEmptyString(secRaw.userAgent) ||
    buildSecUserAgent({
      appName: secAppName,
      name: secName,
      email: secEmail,
      company: secCompany,
    });

  const broker = isRecord(source.broker) ? source.broker : {};

  return {
    aiProvider: {
      provider,
      apiKey: asNonEmptyString(aiProviderRaw.apiKey),
      model,
    },
    heartbeat: {
      enabled: typeof heartbeatRaw.enabled === "boolean" ? heartbeatRaw.enabled : DEFAULT_CONFIG.heartbeat.enabled,
      intervalMinutes: normalizeHeartbeatInterval(heartbeatRaw.intervalMinutes),
    },
    skills,
    broker,
    ibkrUsername: asNonEmptyString(source.ibkrUsername),
    ibkrPassword: asNonEmptyString(source.ibkrPassword),
    ibkrGatewayMode: normalizeGatewayMode(source.ibkrGatewayMode),
    ibkrAutoLogin: Boolean(source.ibkrAutoLogin),
    sec: {
      appName: secAppName,
      name: secName,
      email: secEmail,
      company: secCompany,
      userAgent: secUserAgent,
    },
  };
}

export function loadConfig(configPath: string): WizardConfig {
  try {
    const raw = readFileSync(configPath, "utf-8");
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return normalizeConfig(DEFAULT_CONFIG);
  }
}

export function saveConfig(configPath: string, config: WizardConfig): void {
  const normalized = normalizeConfig(config);
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");

  try {
    chmodSync(configPath, 0o600);
  } catch {
    // best-effort: on non-posix systems chmod may not apply
  }
}

export function configuredFlag(value: string): "yes" | "no" {
  return value.trim() ? "yes" : "no";
}
