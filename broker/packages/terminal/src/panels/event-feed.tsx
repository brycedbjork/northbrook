/**
 * Event feed panel — scrolling live event stream from the daemon.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { useTerminal } from "../store/index.js";
import { colors } from "../lib/theme.js";

const topicColors: Record<string, string> = {
  orders: colors.blue,
  fills: colors.green,
  positions: colors.cyan,
  pnl: colors.yellow,
  risk: colors.red,
  connection: colors.purple,
};

export function EventFeedPanel({ focused, maxRows = 12 }: { focused?: boolean; maxRows?: number }) {
  const events = useTerminal((s) => s.events);
  const visible = events.slice(0, maxRows);

  return (
    <Panel title="Event Feed" focused={focused}>
      {visible.length === 0 ? (
        <Text color={colors.textDim}>Waiting for events...</Text>
      ) : (
        visible.map((evt) => {
          const time = new Date(evt.timestamp).toLocaleTimeString("en-US", { hour12: false });
          const topicColor = topicColors[evt.topic] ?? colors.textDim;
          return (
            <Box key={evt.id} gap={1}>
              <Text color={colors.textDim}>{time}</Text>
              <Text color={topicColor}>{evt.topic.padEnd(11)}</Text>
              <Text color={colors.text}>{evt.summary}</Text>
            </Box>
          );
        })
      )}
    </Panel>
  );
}
