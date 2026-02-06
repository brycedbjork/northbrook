/**
 * Gauge — horizontal bar showing a ratio (e.g., exposure %, used margin).
 */

import React from "react";
import { Box, Text } from "ink";
import { colors, symbols } from "../lib/theme.js";

export interface GaugeProps {
  label: string;
  value: number;      // 0..1
  maxWidth?: number;
  warnAt?: number;     // 0..1, threshold for yellow
  critAt?: number;     // 0..1, threshold for red
}

export function Gauge({ label, value, maxWidth = 20, warnAt = 0.7, critAt = 0.9 }: GaugeProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * maxWidth);
  const empty = maxWidth - filled;

  const barColor =
    clamped >= critAt ? colors.red : clamped >= warnAt ? colors.yellow : colors.green;

  return (
    <Box gap={1}>
      <Text color={colors.textDim}>{label.padEnd(12)}</Text>
      <Text color={barColor}>{symbols.barFull.repeat(filled)}</Text>
      <Text color={colors.textMuted}>{symbols.barLow.repeat(empty)}</Text>
      <Text color={barColor}> {(clamped * 100).toFixed(0)}%</Text>
    </Box>
  );
}
