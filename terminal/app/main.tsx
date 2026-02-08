#!/usr/bin/env bun

import { render } from "ink";
import { App } from "./app.js";
import type { ScreenName } from "./lib/keymap.js";
import { store } from "./store/index.js";

// ── CLI argument parsing ────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.exit(0);
}

// Parse --screen flag
const screenArg = args.find((a) => a.startsWith("--screen="));
if (screenArg) {
  const name = screenArg.split("=")[1] as ScreenName;
  const valid: ScreenName[] = [
    "command",
    "strategies",
    "positions",
    "research",
  ];
  if (valid.includes(name)) {
    store.getState().setScreen(name);
  }
}

// ── Render ──────────────────────────────────────────────────────

const { unmount, waitUntilExit } = render(<App onExit={() => unmount()} />, {
  exitOnCtrlC: true,
});

await waitUntilExit();
