/**
 * Agent status panel — shows registered agents, heartbeats, and roles.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { Badge } from "../components/badge.js";
import { useTerminal } from "../store/index.js";
import { colors, symbols } from "../lib/theme.js";
import { duration } from "../lib/format.js";
import type { AgentInfo } from "../store/types.js";

const roleColors: Record<string, string> = {
  manager: colors.purple,
  trader: colors.blue,
  analyst: colors.cyan,
};

function AgentRow({ agent }: { agent: AgentInfo }) {
  const statusVariant =
    agent.status === "online"
      ? "success"
      : agent.status === "degraded"
        ? "warning"
        : "error";

  const sinceHeartbeat = agent.lastHeartbeat
    ? duration((Date.now() - agent.lastHeartbeat) / 1000)
    : "never";

  return (
    <Box gap={1}>
      <Text color={roleColors[agent.role] ?? colors.text} bold>
        {agent.name.padEnd(16)}
      </Text>
      <Badge label={agent.role} variant="info" />
      <Badge label={agent.status} variant={statusVariant} />
      <Text color={colors.textDim}>
        {agent.latencyMs != null ? `${agent.latencyMs}ms` : "—"}
      </Text>
      <Text color={colors.textDim}>({sinceHeartbeat} ago)</Text>
      {agent.taskDescription && (
        <Text color={colors.textDim}>{symbols.arrowRight} {agent.taskDescription}</Text>
      )}
    </Box>
  );
}

export function AgentStatusPanel({ focused }: { focused?: boolean }) {
  const agents = useTerminal((s) => s.agents);

  return (
    <Panel title="Agents" focused={focused}>
      {agents.length === 0 ? (
        <Text color={colors.textDim}>No agents registered</Text>
      ) : (
        agents.map((a) => <AgentRow key={a.name} agent={a} />)
      )}
    </Panel>
  );
}
