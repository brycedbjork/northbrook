#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Box, Text, render, useApp } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useState } from "react";
import { getPiRpcClient } from "../app/lib/pi-rpc.js";

type Stage = "editing" | "submitting" | "done";
const THESIS_SUFFIX_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "THESIS.md");

async function loadThesisPromptSuffix(): Promise<string> {
  const raw = await readFile(THESIS_SUFFIX_PATH, "utf-8");
  const suffix = raw.trim();
  if (!suffix) {
    throw new Error(`Thesis prompt suffix is empty at ${THESIS_SUFFIX_PATH}`);
  }
  return suffix;
}

async function buildThesisKickoffPrompt(thesis: string): Promise<string> {
  const thesisText = thesis.trim();
  if (!thesisText) {
    throw new Error("Investment thesis cannot be empty.");
  }

  const suffix = await loadThesisPromptSuffix();

  return [
    "The user has declared the following investment thesis:",
    thesisText,
    "",
    suffix,
  ].join("\n");
}

async function kickoffThesisSession(thesis: string): Promise<void> {
  const prompt = await buildThesisKickoffPrompt(thesis);
  const client = getPiRpcClient();

  try {
    await client.prompt(prompt, undefined, 180_000);
  } finally {
    client.dispose();
  }
}

function ThesisApp() {
  const { exit } = useApp();
  const [thesis, setThesis] = useState("");
  const [stage, setStage] = useState<Stage>("editing");
  const [error, setError] = useState<string | null>(null);

  const submitting = stage === "submitting";

  const submitThesis = useCallback(
    async (value: string) => {
      const next = value.trim();
      if (!next || submitting) {
        return;
      }

      setThesis(next);
      setStage("submitting");
      setError(null);

      try {
        await kickoffThesisSession(next);
        setStage("done");
        setTimeout(() => exit(), 150);
      } catch (thesisError) {
        setStage("editing");
        setError(thesisError instanceof Error ? thesisError.message : String(thesisError));
      }
    },
    [exit, submitting]
  );

  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyanBright">Northbrook thesis kickoff</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="whiteBright">Declare your investment thesis</Text>
          <Text color="gray">We will use this to seed your first strategies and positions.</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">Thesis:</Text>
        </Box>

        {submitting ? (
          <Text color="yellow">Seeding first agentic session...</Text>
        ) : stage === "done" ? (
          <Text color="green">Kickoff complete. Loading terminal...</Text>
        ) : (
          <TextInput
            value={thesis}
            onChange={setThesis}
            onSubmit={(value) => {
              void submitThesis(value);
            }}
            placeholder="Example: Concentrate on AI infrastructure leaders with disciplined downside risk."
          />
        )}

        {error ? (
          <Box marginTop={1}>
            <Text color="red">Kickoff failed: {error}</Text>
          </Box>
        ) : null}

        <Box marginTop={1}>
          <Text color="magenta">Enter to kickoff | Ctrl+C to cancel launch</Text>
        </Box>
      </Box>
    </Box>
  );
}

const app = render(<ThesisApp />, { exitOnCtrlC: true });
await app.waitUntilExit();
