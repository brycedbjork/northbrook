/**
 * Badge — a small colored label for status indicators.
 */

import { Text } from "ink";
import { colors } from "../lib/theme.js";

export type BadgeProps = {
  label: string;
  variant: "success" | "warning" | "error" | "info" | "muted";
};

const variantColors: Record<BadgeProps["variant"], string> = {
  success: colors.green,
  warning: colors.yellow,
  error: colors.red,
  info: colors.blue,
  muted: colors.textDim,
};

export function Badge({ label, variant }: BadgeProps) {
  return (
    <Text bold={variant !== "muted"} color={variantColors[variant]}>
      [{label}]
    </Text>
  );
}
