import type { GatewayMode, ProviderId, SkillId, WizardConfig } from "./types.js";

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-opus-4-6",
  openai: "gpt-5",
  google: "gemini-2.5-pro",
};

export const PROVIDER_OPTIONS: Array<{
  id: ProviderId;
  label: string;
  description: string;
  apiKeyLabel: string;
}> = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models",
    apiKeyLabel: "Anthropic API key",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT models",
    apiKeyLabel: "OpenAI API key",
  },
  {
    id: "google",
    label: "Google",
    description: "Gemini models",
    apiKeyLabel: "Google Gemini API key",
  },
];

export const SKILL_OPTIONS: Array<{
  id: SkillId;
  label: string;
  description: string;
  keyLabel: string;
}> = [
  {
    id: "xApi",
    label: "X API",
    description: "Real-time social/news feed",
    keyLabel: "X API key",
  },
  {
    id: "braveSearchApi",
    label: "Brave Search API",
    description: "Web search integration",
    keyLabel: "Brave Search API key",
  },
];

export const GATEWAY_MODE_OPTIONS: Array<{
  id: GatewayMode;
  label: string;
  description: string;
}> = [
  {
    id: "paper",
    label: "Paper",
    description: "Simulated trading account",
  },
  {
    id: "live",
    label: "Live",
    description: "Real-money execution",
  },
];

export const DEFAULT_CONFIG: WizardConfig = {
  aiProvider: {
    provider: "anthropic",
    apiKey: "",
    model: DEFAULT_MODELS.anthropic,
  },
  heartbeat: {
    enabled: true,
    intervalMinutes: 30,
  },
  skills: {},
  broker: {},
  ibkrUsername: "",
  ibkrPassword: "",
  ibkrGatewayMode: "paper",
  ibkrAutoLogin: false,
  sec: {
    appName: "Northbrook",
    name: "",
    email: "",
    company: "",
    userAgent: "Northbrook/1.0",
  },
};
