/**
 * HelpOverlay — modal showing all available key bindings.
 */

import React from "react";
import { Box, Text } from "ink";
import { colors } from "../lib/theme.js";
import { globalKeys, dashboardKeys, orderKeys, riskKeys, strategyKeys } from "../lib/keymap.js";
import type { KeyBinding } from "../lib/keymap.js";
import { useTerminal } from "../store/index.js";

function KeyGroup({ title, bindings }: { title: string; bindings: KeyBinding[] }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={colors.brand}>
        {title}
      </Text>
      {bindings.map((kb) => (
        <Box key={kb.key} gap={1}>
          <Text color={colors.yellow}>{kb.label.padEnd(8)}</Text>
          <Text color={colors.text}>{kb.description}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function HelpOverlay() {
  const screen = useTerminal((s) => s.screen);

  const contextKeys =
    screen === "dashboard"
      ? dashboardKeys
      : screen === "orders"
        ? orderKeys
        : screen === "risk"
          ? riskKeys
          : screen === "strategy"
            ? strategyKeys
            : [];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={colors.brand}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={colors.textBright}>
        Keyboard Shortcuts
      </Text>
      <Text color={colors.textDim}>Press ? or Esc to close</Text>
      <Box marginTop={1} flexDirection="column">
        <KeyGroup title="Global" bindings={globalKeys} />
        {contextKeys.length > 0 && (
          <KeyGroup title={screen.charAt(0).toUpperCase() + screen.slice(1)} bindings={contextKeys} />
        )}
      </Box>
    </Box>
  );
}
