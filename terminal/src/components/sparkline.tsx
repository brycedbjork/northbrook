/**
 * Sparkline — inline mini-chart using Unicode block characters.
 */

import React from "react";
import { Text } from "ink";
import { colors } from "../lib/theme.js";

const TICKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export interface SparklineProps {
  data: number[];
  width?: number;
  color?: string;
}

export function Sparkline({ data, width, color = colors.brand }: SparklineProps) {
  if (data.length === 0) return <Text color={colors.textDim}>—</Text>;

  const values = width && data.length > width ? data.slice(-width) : data;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const chars = values.map((v) => {
    const idx = Math.round(((v - min) / range) * (TICKS.length - 1));
    return TICKS[idx]!;
  });

  return <Text color={color}>{chars.join("")}</Text>;
}
