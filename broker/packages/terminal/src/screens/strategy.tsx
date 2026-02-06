/**
 * Strategy screen — deploy and monitor trading strategies.
 *
 * This is the "enact strategy" part of the command center. It shows
 * configured strategies, their status, and allows deployment/stopping.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { Badge } from "../components/badge.js";
import { colors, symbols } from "../lib/theme.js";

interface Strategy {
  name: string;
  status: "running" | "stopped" | "paused" | "error";
  agent: string;
  description: string;
  allocatedPct: number;
  tradesTotal: number;
  pnlTotal: number;
}

/** Placeholder strategies — will be populated from agent messages. */
const placeholders: Strategy[] = [];

function StrategyRow({ strategy }: { strategy: Strategy }) {
  const statusVariant =
    strategy.status === "running"
      ? "success"
      : strategy.status === "error"
        ? "error"
        : strategy.status === "paused"
          ? "warning"
          : "muted";

  return (
    <Box gap={1}>
      <Text color={colors.textBright} bold>
        {strategy.name.padEnd(20)}
      </Text>
      <Badge label={strategy.status} variant={statusVariant} />
      <Text color={colors.textDim}>agent={strategy.agent}</Text>
      <Text color={colors.textDim}>alloc={strategy.allocatedPct}%</Text>
      <Text color={colors.textDim}>trades={strategy.tradesTotal}</Text>
      <Text color={strategy.pnlTotal >= 0 ? colors.green : colors.red}>
        P&L={strategy.pnlTotal >= 0 ? "+" : ""}
        {strategy.pnlTotal.toFixed(2)}
      </Text>
    </Box>
  );
}

export function StrategyScreen() {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Panel title="Strategy Deployment">
        {placeholders.length === 0 ? (
          <Box flexDirection="column">
            <Text color={colors.textDim}>
              No strategies configured. Strategies are deployed by the manager
            </Text>
            <Text color={colors.textDim}>
              agent and appear here once registered.
            </Text>
            <Box marginTop={1}>
              <Text color={colors.textDim}>
                The strategy screen will show:
              </Text>
            </Box>
            <Box flexDirection="column" paddingLeft={2} marginTop={1}>
              <Text color={colors.text}>{symbols.bullet} Active strategies and their assignment to trader agents</Text>
              <Text color={colors.text}>{symbols.bullet} Allocation percentages and position limits per strategy</Text>
              <Text color={colors.text}>{symbols.bullet} Real-time P&L attribution per strategy</Text>
              <Text color={colors.text}>{symbols.bullet} Trade count and win rate per strategy</Text>
              <Text color={colors.text}>{symbols.bullet} Deploy, pause, and stop controls</Text>
              <Text color={colors.text}>{symbols.bullet} Strategy parameter editing</Text>
            </Box>
          </Box>
        ) : (
          placeholders.map((s) => <StrategyRow key={s.name} strategy={s} />)
        )}
      </Panel>
      <Box paddingX={1}>
        <Text color={colors.textDim}>
          n=new strategy  d=deploy  s=stop  Enter=details
        </Text>
      </Box>
    </Box>
  );
}
