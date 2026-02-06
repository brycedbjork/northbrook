/**
 * StatusBar — bottom bar showing connection state, screen, and key hints.
 */

import React from "react";
import { Box, Text } from "ink";
import { colors, symbols } from "../lib/theme.js";
import { duration } from "../lib/format.js";
import { useTerminal } from "../store/index.js";

export function StatusBar() {
  const screen = useTerminal((s) => s.screen);
  const connected = useTerminal((s) => s.connected);
  const halted = useTerminal((s) => s.halted);
  const daemon = useTerminal((s) => s.daemon);
  const toasts = useTerminal((s) => s.toasts);

  const uptime = daemon?.uptime_seconds ? duration(daemon.uptime_seconds) : "—";
  const connSymbol = connected ? symbols.connected : symbols.disconnected;
  const connColor = connected ? colors.green : colors.red;

  const latestToast = toasts.length > 0 ? toasts[toasts.length - 1] : null;
  const toastColor =
    latestToast?.level === "error"
      ? colors.red
      : latestToast?.level === "warning"
        ? colors.yellow
        : latestToast?.level === "success"
          ? colors.green
          : colors.blue;

  return (
    <Box width="100%" justifyContent="space-between">
      <Box gap={2}>
        <Text color={connColor}>
          {connSymbol} {connected ? "CONNECTED" : "DISCONNECTED"}
        </Text>
        {halted && (
          <Text color={colors.red} bold>
            {symbols.warning} HALTED
          </Text>
        )}
        <Text color={colors.textDim}>up {uptime}</Text>
      </Box>

      <Box gap={2}>
        {latestToast && (
          <Text color={toastColor}>{latestToast.message}</Text>
        )}
        <Text color={colors.textDim}>
          [{screen.toUpperCase()}] ?=help :=cmd q=quit
        </Text>
      </Box>
    </Box>
  );
}
