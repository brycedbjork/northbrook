export type ProviderId = "anthropic" | "openai" | "google";

export type SkillId = "xApi" | "braveSearchApi";

export type GatewayMode = "paper" | "live";

export type SkillEntry = {
  apiKey: string;
};

export type WizardConfig = {
  aiProvider: {
    provider: ProviderId;
    apiKey: string;
    model: string;
  };
  heartbeat: {
    enabled: boolean;
    intervalMinutes: number;
  };
  skills: Partial<Record<SkillId, SkillEntry>>;
  broker: Record<string, unknown>;
  ibkrUsername: string;
  ibkrPassword: string;
  ibkrGatewayMode: GatewayMode;
  ibkrAutoLogin: boolean;
  sec: {
    appName: string;
    name: string;
    email: string;
    company: string;
    userAgent: string;
  };
};
