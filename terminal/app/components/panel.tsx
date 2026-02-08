/**
 * Panel — a bordered box with a title bar.
 *
 * The fundamental layout primitive for the command center.
 * Supports focus highlighting and optional status indicators.
 */

import { Box, Text } from "ink";
import type React from "react";
import { colors, symbols } from "../lib/theme.js";

export type PanelProps = {
  title: React.ReactNode;
  titleRight?: React.ReactNode;
  focused?: boolean;
  status?: "ok" | "warning" | "error" | "info";
  width?: number | string;
  height?: number | string;
  minHeight?: number | string;
  children: React.ReactNode;
};

const statusIndicator: Record<string, { symbol: string; color: string }> = {
  ok: { symbol: symbols.connected, color: colors.green },
  warning: { symbol: symbols.warning, color: colors.yellow },
  error: { symbol: symbols.error, color: colors.red },
  info: { symbol: symbols.connected, color: colors.blue },
};

export function Panel({
  title,
  titleRight,
  focused,
  status,
  width,
  height,
  minHeight = 10,
  children,
}: PanelProps) {
  const borderColor = focused ? colors.borderFocus : colors.border;
  const si = status ? statusIndicator[status] : null;
  const titleNode =
    typeof title === "string" ? (
      <Text bold color={focused ? colors.brand : colors.textBright}>
        {title}
      </Text>
    ) : (
      title
    );

  return (
    <Box
      borderColor={borderColor}
      borderStyle="round"
      flexDirection="column"
      height={height}
      minHeight={minHeight}
      paddingX={1}
      width={width}
    >
      <Box>
        {titleNode}
        <Box flexGrow={1} />
        {titleRight}
        {si && <Text color={si.color}> {si.symbol}</Text>}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
}
