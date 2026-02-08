#!/usr/bin/env bun

import { homedir } from "node:os";
import path from "node:path";
import { Box, Text, render, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useMemo, useState } from "react";
import { configuredFlag, loadConfig, saveConfig } from "./config.js";
import {
  DEFAULT_MODELS,
  GATEWAY_MODE_OPTIONS,
  PROVIDER_OPTIONS,
  SKILL_OPTIONS,
} from "./options.js";
import type { ProviderId, SkillId, WizardConfig } from "./types.js";

type Stage =
  | "ibkrUsername"
  | "ibkrPassword"
  | "gatewayMode"
  | "autoLogin"
  | "provider"
  | "providerApiKey"
  | "providerModel"
  | "skills"
  | "skillApiKey"
  | "secAppName"
  | "secName"
  | "secEmail"
  | "secCompany"
  | "review"
  | "done";

type FrameProps = {
  step: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  hint?: string;
  children: React.ReactNode;
};

type TextEntryStepProps = {
  step: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  label: string;
  initialValue: string;
  isSecret?: boolean;
  existingValue?: string;
  onSubmit: (value: string) => void;
  onBack?: () => void;
};

type ChoiceOption<T extends string> = {
  id: T;
  label: string;
  description: string;
};

type SingleChoiceStepProps<T extends string> = {
  step: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  initialValue: T;
  options: Array<ChoiceOption<T>>;
  onSubmit: (value: T) => void;
  onBack?: () => void;
};

type MultiChoiceStepProps<T extends string> = {
  step: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  options: Array<ChoiceOption<T>>;
  initialSelected: T[];
  onSubmit: (selected: T[]) => void;
  onBack?: () => void;
};

const STAGE_ORDER: Stage[] = [
  "ibkrUsername",
  "ibkrPassword",
  "gatewayMode",
  "autoLogin",
  "provider",
  "providerApiKey",
  "providerModel",
  "skills",
  "skillApiKey",
  "secAppName",
  "secName",
  "secEmail",
  "secCompany",
  "review",
  "done",
];

function stageNumber(stage: Stage): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx + 1;
}

function progressBar(step: number, total: number, width = 26): string {
  const ratio = Math.max(0, Math.min(1, step / total));
  const filled = Math.round(width * ratio);
  return `[${"=".repeat(filled)}${"-".repeat(Math.max(width - filled, 0))}]`;
}

function maskSecret(value: string): string {
  if (!value.trim()) {
    return "not set";
  }
  return "********";
}

function buildSecUserAgent(input: {
  appName: string;
  name: string;
  email: string;
  company: string;
}): string {
  const appName = input.appName.trim() || "Northbrook";
  const base = `${appName}/1.0`;
  const contactParts = [input.name.trim(), input.company.trim(), input.email.trim()].filter(
    (part) => part.length > 0
  );
  if (contactParts.length === 0) {
    return base;
  }
  return `${base} (${contactParts.join(", ")})`;
}

function frame({ step, totalSteps, title, subtitle, hint, children }: FrameProps) {
  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyanBright">Northbrook onboarding wizard</Text>
        <Text color="gray">{progressBar(step, totalSteps)} {step}/{totalSteps}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="whiteBright">{title}</Text>
          <Text color="gray">{subtitle}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          {children}
        </Box>
        {hint ? (
          <Box marginTop={1}>
            <Text color="magenta">{hint}</Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function TextEntryStep({
  step,
  totalSteps,
  title,
  subtitle,
  label,
  initialValue,
  isSecret,
  existingValue,
  onSubmit,
  onBack,
}: TextEntryStepProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useInput((_, key) => {
    if (key.escape) {
      onBack?.();
    }
  });

  const hintParts: string[] = ["Enter to continue"];
  if (onBack) {
    hintParts.push("Esc to go back");
  }

  return frame({
    step,
    totalSteps,
    title,
    subtitle,
    hint: hintParts.join(" | "),
    children: (
      <>
        <Text color="gray">{label}</Text>
        {isSecret && existingValue ? (
          <Text color="yellow">Leave blank and press Enter to keep current value.</Text>
        ) : null}
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(nextValue) => onSubmit(nextValue.trim())}
          mask={isSecret ? "*" : undefined}
        />
      </>
    ),
  });
}

function SingleChoiceStep<T extends string>({
  step,
  totalSteps,
  title,
  subtitle,
  initialValue,
  options,
  onSubmit,
  onBack,
}: SingleChoiceStepProps<T>) {
  const initialIndex = Math.max(
    0,
    options.findIndex((option) => option.id === initialValue),
  );
  const [cursor, setCursor] = useState(initialIndex);

  useEffect(() => {
    setCursor(initialIndex);
  }, [initialIndex]);

  useInput((input, key) => {
    if (key.upArrow || input === "k" || input === "K") {
      setCursor((value) => (value - 1 + options.length) % options.length);
      return;
    }
    if (key.downArrow || input === "j" || input === "J") {
      setCursor((value) => (value + 1) % options.length);
      return;
    }
    if (key.return) {
      onSubmit(options[cursor]?.id ?? options[0].id);
      return;
    }
    if (key.escape) {
      onBack?.();
    }
  });

  return frame({
    step,
    totalSteps,
    title,
    subtitle,
    hint: onBack
      ? "Up/Down (or j/k) to move | Enter to continue | Esc to go back"
      : "Up/Down (or j/k) to move | Enter to continue",
    children: (
      <Box flexDirection="column">
        {options.map((option, index) => {
          const isCursor = cursor === index;
          return (
            <Box key={option.id} flexDirection="column" marginBottom={1}>
              <Text color={isCursor ? "cyanBright" : "white"}>
                {isCursor ? ">" : " "} ({isCursor ? "*" : " "}) {option.label}
              </Text>
              <Text color="gray">  {option.description}</Text>
            </Box>
          );
        })}
      </Box>
    ),
  });
}

function MultiChoiceStep<T extends string>({
  step,
  totalSteps,
  title,
  subtitle,
  options,
  initialSelected,
  onSubmit,
  onBack,
}: MultiChoiceStepProps<T>) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<T>>(new Set(initialSelected));

  useEffect(() => {
    setSelected(new Set(initialSelected));
    setCursor(0);
  }, [initialSelected]);

  useInput((input, key) => {
    if (key.upArrow || input === "k" || input === "K") {
      setCursor((value) => (value - 1 + options.length) % options.length);
      return;
    }
    if (key.downArrow || input === "j" || input === "J") {
      setCursor((value) => (value + 1) % options.length);
      return;
    }
    if (input === " ") {
      const option = options[cursor];
      if (!option) {
        return;
      }
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(option.id)) {
          next.delete(option.id);
        } else {
          next.add(option.id);
        }
        return next;
      });
      return;
    }
    if (key.return) {
      const optionOrder = options.map((item) => item.id);
      const ordered = optionOrder.filter((item) => selected.has(item));
      onSubmit(ordered);
      return;
    }
    if (key.escape) {
      onBack?.();
    }
  });

  return frame({
    step,
    totalSteps,
    title,
    subtitle,
    hint: onBack
      ? "Up/Down (or j/k) to move | Space to toggle | Enter to continue | Esc to go back"
      : "Up/Down (or j/k) to move | Space to toggle | Enter to continue",
    children: (
      <Box flexDirection="column">
        {options.map((option, index) => {
          const isCursor = cursor === index;
          const isSelected = selected.has(option.id);
          return (
            <Box key={option.id} flexDirection="column" marginBottom={1}>
              <Text color={isCursor ? "cyanBright" : "white"}>
                {isCursor ? ">" : " "} [{isSelected ? "x" : " "}] {option.label}
              </Text>
              <Text color="gray">  {option.description}</Text>
            </Box>
          );
        })}
      </Box>
    ),
  });
}

function ReviewStep({
  config,
  configPath,
  step,
  totalSteps,
  saveError,
  onSave,
  onBack,
}: {
  config: WizardConfig;
  configPath: string;
  step: number;
  totalSteps: number;
  saveError: string | null;
  onSave: () => void;
  onBack: () => void;
}) {
  useInput((_, key) => {
    if (key.return) {
      onSave();
      return;
    }
    if (key.escape) {
      onBack();
    }
  });

  const skillKeys = SKILL_OPTIONS
    .filter((skill) => config.skills[skill.id])
    .map((skill) => `${skill.id}=${configuredFlag(config.skills[skill.id]?.apiKey ?? "")}`);

  return frame({
    step,
    totalSteps,
    title: "Review and save",
    subtitle: "Press Enter to write your onboarding config.",
    hint: "Enter to save | Esc to go back",
    children: (
      <Box flexDirection="column">
        <Text color="gray">Config file: {configPath}</Text>
        <Text>AI provider: {config.aiProvider.provider}</Text>
        <Text>AI model: {config.aiProvider.model || "(not set)"}</Text>
        <Text>IB mode: {config.ibkrGatewayMode}</Text>
        <Text>IB username: {config.ibkrUsername || "(not set)"}</Text>
        <Text>IB password: {maskSecret(config.ibkrPassword)}</Text>
        <Text>IBC auto login: {config.ibkrAutoLogin ? "enabled" : "disabled"}</Text>
        <Text>SEC app name: {config.sec.appName || "(not set)"}</Text>
        <Text>SEC contact: {config.sec.name || "(not set)"} | {config.sec.email || "(not set)"}</Text>
        <Text>SEC company: {config.sec.company || "(not set)"}</Text>
        <Text>SEC user agent: {config.sec.userAgent || "(not set)"}</Text>
        <Text>Configured keys:</Text>
        <Text>  aiProvider.apiKey={configuredFlag(config.aiProvider.apiKey)}</Text>
        <Text>
          {skillKeys.length > 0
            ? `  ${skillKeys.join(" ")}`
            : "  skills.xApi=no skills.braveSearchApi=no"}
        </Text>
        {saveError ? <Text color="red">Save failed: {saveError}</Text> : null}
      </Box>
    ),
  });
}

function DoneStep({ configPath, config }: { configPath: string; config: WizardConfig }) {
  const { exit } = useApp();

  useInput((_, key) => {
    if (key.return || key.escape) {
      exit();
    }
  });

  const skillKeys = SKILL_OPTIONS
    .filter((skill) => config.skills[skill.id])
    .map((skill) => `${skill.id}=${configuredFlag(config.skills[skill.id]?.apiKey ?? "")}`);

  return frame({
    step: STAGE_ORDER.length,
    totalSteps: STAGE_ORDER.length,
    title: "Onboarding complete",
    subtitle: "Your settings were saved.",
    hint: "Press Enter to close",
    children: (
      <Box flexDirection="column">
        <Text color="green">Saved config: {configPath}</Text>
        <Text>AI provider: {config.aiProvider.provider}</Text>
        <Text>AI model: {config.aiProvider.model || "(not set)"}</Text>
        <Text>IB mode: {config.ibkrGatewayMode}</Text>
        <Text>SEC user agent: {config.sec.userAgent || "(not set)"}</Text>
        <Text>Configured keys:</Text>
        <Text>  aiProvider.apiKey={configuredFlag(config.aiProvider.apiKey)}</Text>
        <Text>
          {skillKeys.length > 0
            ? `  ${skillKeys.join(" ")}`
            : "  skills.xApi=no skills.braveSearchApi=no"}
        </Text>
      </Box>
    ),
  });
}

function WizardApp({ configPath, initialConfig }: { configPath: string; initialConfig: WizardConfig }) {
  const [config, setConfig] = useState<WizardConfig>(initialConfig);
  const [savedConfig, setSavedConfig] = useState<WizardConfig>(initialConfig);
  const [stage, setStage] = useState<Stage>("ibkrUsername");
  const [skillQueue, setSkillQueue] = useState<SkillId[]>([]);
  const [skillCursor, setSkillCursor] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentSkill = skillQueue[skillCursor];
  const providerMeta = useMemo(
    () => PROVIDER_OPTIONS.find((option) => option.id === config.aiProvider.provider),
    [config.aiProvider.provider],
  );

  const goBack = () => {
    setSaveError(null);

    if (stage === "ibkrUsername") {
      return;
    }
    if (stage === "ibkrPassword") {
      setStage("ibkrUsername");
      return;
    }
    if (stage === "gatewayMode") {
      setStage("ibkrPassword");
      return;
    }
    if (stage === "autoLogin") {
      setStage("gatewayMode");
      return;
    }
    if (stage === "provider") {
      setStage("autoLogin");
      return;
    }
    if (stage === "providerApiKey") {
      setStage("provider");
      return;
    }
    if (stage === "providerModel") {
      setStage("providerApiKey");
      return;
    }
    if (stage === "skills") {
      setStage("providerModel");
      return;
    }
    if (stage === "skillApiKey") {
      if (skillCursor > 0) {
        setSkillCursor((value) => value - 1);
      } else {
        setStage("skills");
      }
      return;
    }
    if (stage === "secAppName") {
      if (skillQueue.length > 0) {
        setSkillCursor(Math.max(skillQueue.length - 1, 0));
        setStage("skillApiKey");
      } else {
        setStage("skills");
      }
      return;
    }
    if (stage === "secName") {
      setStage("secAppName");
      return;
    }
    if (stage === "secEmail") {
      setStage("secName");
      return;
    }
    if (stage === "secCompany") {
      setStage("secEmail");
      return;
    }
    if (stage === "review") {
      setStage("secCompany");
      return;
    }
    if (stage === "done") {
      setStage("review");
    }
  };

  if (stage === "ibkrUsername") {
    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="1) Interactive Brokers"
        subtitle="Set your IBKR username for IBC auto-login support."
        label="IBKR username"
        initialValue={config.ibkrUsername}
        onSubmit={(value) => {
          setConfig((current) => ({ ...current, ibkrUsername: value }));
          setStage("ibkrPassword");
        }}
      />
    );
  }

  if (stage === "ibkrPassword") {
    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="1) Interactive Brokers"
        subtitle="Save your IBKR password for optional IBC automated login."
        label="IBKR login password"
        initialValue=""
        existingValue={config.ibkrPassword}
        isSecret
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => ({
            ...current,
            ibkrPassword: value || current.ibkrPassword,
          }));
          setStage("gatewayMode");
        }}
      />
    );
  }

  if (stage === "gatewayMode") {
    return (
      <SingleChoiceStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="1) Interactive Brokers"
        subtitle="Choose which Gateway mode should be used by default."
        initialValue={config.ibkrGatewayMode}
        options={GATEWAY_MODE_OPTIONS}
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => ({ ...current, ibkrGatewayMode: value }));
          setStage("autoLogin");
        }}
      />
    );
  }

  if (stage === "autoLogin") {
    return (
      <SingleChoiceStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="1) Interactive Brokers"
        subtitle="Enable or disable IBC automated login."
        initialValue={config.ibkrAutoLogin ? "enabled" : "disabled"}
        options={[
          { id: "enabled", label: "Enabled", description: "Attempt automated Gateway login." },
          { id: "disabled", label: "Disabled", description: "Manual login only." },
        ]}
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => ({ ...current, ibkrAutoLogin: value === "enabled" }));
          setStage("provider");
        }}
      />
    );
  }

  if (stage === "provider") {
    return (
      <SingleChoiceStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="2) AI provider"
        subtitle="Pick one provider for your default model + key."
        initialValue={config.aiProvider.provider}
        options={PROVIDER_OPTIONS}
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => {
            const nextModel =
              value === current.aiProvider.provider
                ? current.aiProvider.model
                : DEFAULT_MODELS[value as ProviderId];
            return {
              ...current,
              aiProvider: {
                ...current.aiProvider,
                provider: value as ProviderId,
                model: nextModel,
              },
            };
          });
          setStage("providerApiKey");
        }}
      />
    );
  }

  if (stage === "providerApiKey") {
    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="2) AI provider"
        subtitle="Enter the API key for your selected provider."
        label={providerMeta?.apiKeyLabel ?? "API key"}
        initialValue=""
        existingValue={config.aiProvider.apiKey}
        isSecret
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => ({
            ...current,
            aiProvider: {
              ...current.aiProvider,
              apiKey: value || current.aiProvider.apiKey,
            },
          }));
          setStage("providerModel");
        }}
      />
    );
  }

  if (stage === "providerModel") {
    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="2) AI provider"
        subtitle="Choose the default model name used by agents + terminal."
        label="Model"
        initialValue={config.aiProvider.model}
        onBack={goBack}
        onSubmit={(value) => {
          const fallback = DEFAULT_MODELS[config.aiProvider.provider];
          setConfig((current) => ({
            ...current,
            aiProvider: {
              ...current.aiProvider,
              model: value || fallback,
            },
          }));
          setStage("skills");
        }}
      />
    );
  }

  if (stage === "skills") {
    return (
      <MultiChoiceStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="3) Skills (optional)"
        subtitle="Choose optional integrations and set their API keys."
        options={SKILL_OPTIONS}
        initialSelected={SKILL_OPTIONS.filter((skill) => config.skills[skill.id]).map((skill) => skill.id)}
        onBack={goBack}
        onSubmit={(selectedSkills) => {
          setConfig((current) => {
            const nextSkills: WizardConfig["skills"] = {};
            for (const skillId of selectedSkills) {
              nextSkills[skillId] = {
                apiKey: current.skills[skillId]?.apiKey ?? "",
              };
            }
            return {
              ...current,
              skills: nextSkills,
            };
          });

          setSkillQueue(selectedSkills as SkillId[]);
          setSkillCursor(0);
          if (selectedSkills.length === 0) {
            setStage("secAppName");
          } else {
            setStage("skillApiKey");
          }
        }}
      />
    );
  }

  if (stage === "skillApiKey" && currentSkill) {
    const skillMeta = SKILL_OPTIONS.find((skill) => skill.id === currentSkill);
    const skillTitle = `3) Skills (optional) ${skillCursor + 1}/${skillQueue.length}`;

    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title={skillTitle}
        subtitle="Set the API key for each selected skill."
        label={skillMeta?.keyLabel ?? "Skill API key"}
        initialValue=""
        existingValue={config.skills[currentSkill]?.apiKey ?? ""}
        isSecret
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => ({
            ...current,
            skills: {
              ...current.skills,
              [currentSkill]: {
                apiKey: value || current.skills[currentSkill]?.apiKey || "",
              },
            },
          }));

          if (skillCursor + 1 < skillQueue.length) {
            setSkillCursor((index) => index + 1);
            return;
          }
          setStage("secAppName");
        }}
      />
    );
  }

  if (stage === "secAppName") {
    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="4) SEC filing identity"
        subtitle="Set the application name used in SEC request user-agent."
        label="SEC app name"
        initialValue={config.sec.appName}
        onBack={goBack}
        onSubmit={(value) => {
          const appName = value || config.sec.appName || "Northbrook";
          setConfig((current) => {
            const next = {
              ...current.sec,
              appName,
            };
            return {
              ...current,
              sec: {
                ...next,
                userAgent: buildSecUserAgent(next),
              },
            };
          });
          setStage("secName");
        }}
      />
    );
  }

  if (stage === "secName") {
    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="4) SEC filing identity"
        subtitle="Provide the contact name for SEC traffic identification."
        label="Contact name"
        initialValue={config.sec.name}
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => {
            const next = {
              ...current.sec,
              name: value,
            };
            return {
              ...current,
              sec: {
                ...next,
                userAgent: buildSecUserAgent(next),
              },
            };
          });
          setStage("secEmail");
        }}
      />
    );
  }

  if (stage === "secEmail") {
    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="4) SEC filing identity"
        subtitle="Provide a reachable email for SEC user-agent contact."
        label="Contact email"
        initialValue={config.sec.email}
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => {
            const next = {
              ...current.sec,
              email: value,
            };
            return {
              ...current,
              sec: {
                ...next,
                userAgent: buildSecUserAgent(next),
              },
            };
          });
          setStage("secCompany");
        }}
      />
    );
  }

  if (stage === "secCompany") {
    return (
      <TextEntryStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        title="4) SEC filing identity"
        subtitle="Optional organization/company name for SEC user-agent."
        label="Company (optional)"
        initialValue={config.sec.company}
        onBack={goBack}
        onSubmit={(value) => {
          setConfig((current) => {
            const next = {
              ...current.sec,
              company: value,
            };
            return {
              ...current,
              sec: {
                ...next,
                userAgent: buildSecUserAgent(next),
              },
            };
          });
          setStage("review");
        }}
      />
    );
  }

  if (stage === "review") {
    return (
      <ReviewStep
        step={stageNumber(stage)}
        totalSteps={STAGE_ORDER.length}
        configPath={configPath}
        config={config}
        saveError={saveError}
        onBack={goBack}
        onSave={() => {
          setSaveError(null);
          try {
            saveConfig(configPath, config);
            setSavedConfig(config);
            setStage("done");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setSaveError(message);
          }
        }}
      />
    );
  }

  return <DoneStep configPath={configPath} config={savedConfig} />;
}

function resolveConfigPath(args: string[]): string {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--config") {
      const next = args[i + 1];
      if (next) {
        return next;
      }
      continue;
    }
    if (arg.startsWith("--config=")) {
      const [, value] = arg.split("=", 2);
      if (value) {
        return value;
      }
    }
  }

  const envPath = process.env.NORTHBROOK_CONFIG_JSON;
  if (envPath && envPath.trim()) {
    return envPath;
  }

  const home = process.env.NORTHBROOK_HOME?.trim() || path.join(homedir(), ".northbrook");
  return path.join(home, "northbrook.json");
}

function runHeadless(configPath: string): void {
  const normalized = loadConfig(configPath);
  saveConfig(configPath, normalized);
  console.error("No interactive TTY available. Skipping onboarding wizard. Run `nb setup` later.");
}

const configPath = resolveConfigPath(process.argv.slice(2));

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  runHeadless(configPath);
  process.exit(0);
}

const initialConfig = loadConfig(configPath);
const { waitUntilExit } = render(<WizardApp configPath={configPath} initialConfig={initialConfig} />, {
  exitOnCtrlC: true,
});

await waitUntilExit();
