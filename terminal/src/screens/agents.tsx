/**
 * Agents screen — full agent observation and management view.
 *
 * Shows all registered agents (manager, traders, analysts), their
 * heartbeat status, current tasks, and communication history.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { AgentStatusPanel } from "../panels/agent-status.js";
import { EventFeedPanel } from "../panels/event-feed.js";
import { Badge } from "../components/badge.js";
import { useTerminal } from "../store/index.js";
import { colors, symbols } from "../lib/theme.js";

export function AgentsScreen() {
  const agents = useTerminal((s) => s.agents);
  const focus = useTerminal((s) => s.focusedPanel);
  const daemon = useTerminal((s) => s.daemon);

  const online = agents.filter((a) => a.status === "online").length;
  const total = agents.length;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Summary bar */}
      <Box paddingX={1} gap={2}>
        <Text color={colors.textBright} bold>
          Agent Fleet
        </Text>
        <Badge label={`${online}/${total} online`} variant={online === total ? "success" : "warning"} />
        {daemon && (
          <Text color={colors.textDim}>
            IB {daemon.connection.connected ? "connected" : "disconnected"}
            {daemon.connection.account_id ? ` (${daemon.connection.account_id})` : ""}
          </Text>
        )}
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        {/* Agent list */}
        <Box flexGrow={2}>
          <AgentStatusPanel focused={focus === 0} />
        </Box>

        {/* Agent event feed */}
        <Box flexGrow={1}>
          <EventFeedPanel focused={focus === 1} maxRows={20} />
        </Box>
      </Box>

      <Panel title="Agent Architecture">
        <Box flexDirection="column">
          <Text color={colors.purple}>{symbols.arrowRight} Manager</Text>
          <Text color={colors.textDim}>    Allocation, risk oversight, performance auditing</Text>
          <Text color={colors.blue}>{symbols.arrowRight} Trader(s)</Text>
          <Text color={colors.textDim}>    Strategy execution, order placement, analyst coordination</Text>
          <Text color={colors.cyan}>{symbols.arrowRight} Analyst(s)</Text>
          <Text color={colors.textDim}>    Deep research, sentiment analysis, filings review</Text>
        </Box>
      </Panel>
    </Box>
  );
}
