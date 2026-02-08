import { Box, Text } from "ink";
import React from "react";
import type { ScreenName } from "../lib/keymap.js";
import { screens } from "../lib/keymap.js";
import { colors } from "../lib/theme.js";
import { useTerminal } from "../store/index.js";

const labels: Record<ScreenName, string> = {
  command: "Command",
  strategies: "Strategies",
  positions: "Positions",
  research: "Research",
};

export function TabBar() {
  const screen = useTerminal((s) => s.screen);

  return (
    <Box paddingTop={1} paddingX={1}>
      <Text bold color={colors.brand}>
        NB
      </Text>
      <Text color={colors.textDim}> </Text>
      {screens.map((s, i) => {
        const active = s === screen;
        return (
          <React.Fragment key={s}>
            {i > 0 && <Text color={colors.textMuted}> </Text>}
            <Text
              bold={active}
              color={active ? colors.textBright : colors.textDim}

            >
              {labels[s]}
            </Text>
          </React.Fragment>
        );
      })}
      <Box flexGrow={1} />
      <Text color={colors.textMuted}>tab</Text>
    </Box>
  );
}
