/**
 * Risk status panel — shows current risk limits, halted state, and gauges.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { Gauge } from "../components/gauge.js";
import { Badge } from "../components/badge.js";
import { useTerminal } from "../store/index.js";
import { colors, symbols } from "../lib/theme.js";
import { num, usd } from "../lib/format.js";

export function RiskStatusPanel({ focused }: { focused?: boolean }) {
  const limits = useTerminal((s) => s.limits);
  const halted = useTerminal((s) => s.halted);

  const status = halted ? "error" : limits ? "ok" : "info";

  return (
    <Panel title="Risk" focused={focused} status={status}>
      {halted && (
        <Box marginBottom={1}>
          <Text color={colors.red} bold>
            {symbols.warning} TRADING HALTED
          </Text>
        </Box>
      )}

      {limits ? (
        <Box flexDirection="column">
          <Gauge label="Position %" value={limits.max_position_pct / 100} maxWidth={16} />
          <Gauge label="Daily Loss %" value={limits.max_daily_loss_pct / 100} maxWidth={16} />
          <Gauge
            label="Sector Exp %"
            value={limits.max_sector_exposure_pct / 100}
            maxWidth={16}
          />
          <Box marginTop={1} flexDirection="column">
            <Box gap={1}>
              <Text color={colors.textDim}>Max Order Value</Text>
              <Text color={colors.text}>{usd(limits.max_order_value)}</Text>
            </Box>
            <Box gap={1}>
              <Text color={colors.textDim}>Max Open Orders</Text>
              <Text color={colors.text}>{num(limits.max_open_orders, 0)}</Text>
            </Box>
            <Box gap={1}>
              <Text color={colors.textDim}>Rate Limit</Text>
              <Text color={colors.text}>{num(limits.order_rate_limit, 0)}/min</Text>
            </Box>
          </Box>
        </Box>
      ) : (
        <Text color={colors.textDim}>Loading risk limits...</Text>
      )}
    </Panel>
  );
}
