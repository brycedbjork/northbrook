/**
 * Balance panel — account balances, margin, and buying power.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { Gauge } from "../components/gauge.js";
import { useTerminal } from "../store/index.js";
import { usd } from "../lib/format.js";
import { colors } from "../lib/theme.js";

function BalanceRow({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <Box gap={1}>
      <Text color={colors.textDim}>{label.padEnd(16)}</Text>
      <Text color={colors.text}>{usd(value)}</Text>
    </Box>
  );
}

export function BalancePanel({ focused }: { focused?: boolean }) {
  const balance = useTerminal((s) => s.balance);

  const marginPct =
    balance?.margin_used != null && balance?.net_liquidation
      ? balance.margin_used / balance.net_liquidation
      : 0;

  return (
    <Panel title="Account" focused={focused}>
      <BalanceRow label="Net Liquidation" value={balance?.net_liquidation} />
      <BalanceRow label="Cash" value={balance?.cash} />
      <BalanceRow label="Buying Power" value={balance?.buying_power} />
      <BalanceRow label="Margin Used" value={balance?.margin_used} />
      {balance && (
        <Box marginTop={1}>
          <Gauge label="Margin" value={marginPct} maxWidth={16} />
        </Box>
      )}
    </Panel>
  );
}
