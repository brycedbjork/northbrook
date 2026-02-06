/**
 * Panel — a bordered box with a title bar.
 *
 * The fundamental layout primitive for the command center.
 * Supports focus highlighting and optional status indicators.
 */

import React from "react";
import { Box, Text } from "ink";
import { colors, symbols } from "../lib/theme.js";

export interface PanelProps {
  title: string;
  focused?: boolean;
  status?: "ok" | "warning" | "error" | "info";
  width?: number | string;
  height?: number | string;
  children: React.ReactNode;
}

const statusIndicator: Record<string, { symbol: string; color: string }> = {
  ok: { symbol: symbols.connected, color: colors.green },
  warning: { symbol: symbols.warning, color: colors.yellow },
  error: { symbol: symbols.error, color: colors.red },
  info: { symbol: symbols.connected, color: colors.blue },
};

export function Panel({ title, focused, status, width, height, children }: PanelProps) {
  const borderColor = focused ? colors.borderFocus : colors.border;
  const si = status ? statusIndicator[status] : null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      width={width}
      height={height}
      paddingX={1}
    >
      <Box>
        <Text bold color={focused ? colors.brand : colors.textBright}>
          {title}
        </Text>
        {si && (
          <Text color={si.color}> {si.symbol}</Text>
        )}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}
