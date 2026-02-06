/**
 * Header — top bar with application title and screen tabs.
 */

import React from "react";
import { Box, Text } from "ink";
import { colors } from "../lib/theme.js";
import type { ScreenName } from "../lib/keymap.js";
import { useTerminal } from "../store/index.js";

const tabs: { key: string; screen: ScreenName; label: string }[] = [
  { key: "1", screen: "dashboard", label: "Dashboard" },
  { key: "2", screen: "orders", label: "Orders" },
  { key: "3", screen: "strategy", label: "Strategy" },
  { key: "4", screen: "risk", label: "Risk" },
  { key: "5", screen: "agents", label: "Agents" },
  { key: "6", screen: "audit", label: "Audit" },
];

export function Header() {
  const currentScreen = useTerminal((s) => s.screen);

  return (
    <Box width="100%" justifyContent="space-between">
      <Box gap={1}>
        <Text bold color={colors.brand}>
          NORTHBROOK
        </Text>
        <Text color={colors.textDim}>│</Text>
        {tabs.map((tab) => {
          const active = currentScreen === tab.screen;
          return (
            <Box key={tab.key}>
              <Text
                color={active ? colors.brand : colors.textDim}
                bold={active}
                underline={active}
              >
                {tab.key}:{tab.label}
              </Text>
              <Text> </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
