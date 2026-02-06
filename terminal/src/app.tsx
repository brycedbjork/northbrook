/**
 * Root application component.
 *
 * Manages screen routing, global key bindings, data polling,
 * and the event stream subscription. This is the top-level
 * orchestrator for the entire command center.
 */

import React from "react";
import { Box } from "ink";
import { Header } from "./components/header.js";
import { StatusBar } from "./components/status-bar.js";
import { HelpOverlay } from "./components/help-overlay.js";
import { DashboardScreen } from "./screens/dashboard.js";
import { OrdersScreen } from "./screens/orders.js";
import { StrategyScreen } from "./screens/strategy.js";
import { RiskScreen } from "./screens/risk.js";
import { AgentsScreen } from "./screens/agents.js";
import { AuditScreen } from "./screens/audit.js";
import { useKeybinds } from "./hooks/use-keybinds.js";
import { usePolling } from "./hooks/use-polling.js";
import { useStream } from "./hooks/use-stream.js";
import { useTerminal } from "./store/index.js";

const screens = {
  dashboard: DashboardScreen,
  orders: OrdersScreen,
  strategy: StrategyScreen,
  risk: RiskScreen,
  agents: AgentsScreen,
  audit: AuditScreen,
} as const;

export function App({ onExit }: { onExit: () => void }) {
  const screen = useTerminal((s) => s.screen);
  const showHelp = useTerminal((s) => s.showHelp);

  // Wire up global systems
  useKeybinds(onExit);
  usePolling(5_000);
  useStream();

  const ScreenComponent = screens[screen];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header />

      <Box flexGrow={1}>
        {showHelp ? <HelpOverlay /> : <ScreenComponent />}
      </Box>

      <StatusBar />
    </Box>
  );
}
