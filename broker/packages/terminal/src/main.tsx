#!/usr/bin/env node

/**
 * Northbrook Terminal — Agent Command Center
 *
 * Usage:
 *   northbrook                 Launch the command center
 *   northbrook --screen=risk   Start on a specific screen
 *   northbrook --no-stream     Disable live event streaming
 *   northbrook --help          Show help
 */

import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { store } from "./store/index.js";
import type { ScreenName } from "./lib/keymap.js";

// ── CLI argument parsing ────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Northbrook Terminal — Agent Command Center

Usage:
  northbrook                 Launch the command center
  northbrook --screen=NAME   Start on a specific screen
                             (dashboard, orders, strategy, risk, agents, audit)

Keyboard:
  1-6        Switch screens
  Tab        Cycle panel focus
  ?          Help overlay
  :          Command palette
  q          Quit
`);
  process.exit(0);
}

// Parse --screen flag
const screenArg = args.find((a) => a.startsWith("--screen="));
if (screenArg) {
  const name = screenArg.split("=")[1] as ScreenName;
  const valid: ScreenName[] = ["dashboard", "orders", "strategy", "risk", "agents", "audit"];
  if (valid.includes(name)) {
    store.getState().setScreen(name);
  }
}

// ── Render ──────────────────────────────────────────────────────

const { unmount, waitUntilExit } = render(
  <App onExit={() => unmount()} />,
  { exitOnCtrlC: true },
);

await waitUntilExit();
