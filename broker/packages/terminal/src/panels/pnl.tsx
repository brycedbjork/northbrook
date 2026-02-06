/**
 * P&L panel — shows daily realized, unrealized, and total P&L.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { useTerminal } from "../store/index.js";
import { usd } from "../lib/format.js";
import { colors, symbols } from "../lib/theme.js";

function PnLRow({ label, value }: { label: string; value: number | null | undefined }) {
  const color =
    value == null ? colors.textDim : value >= 0 ? colors.green : colors.red;
  const arrow =
    value == null ? "" : value > 0 ? symbols.sparkUp : value < 0 ? symbols.sparkDown : symbols.sparkFlat;

  return (
    <Box gap={1}>
      <Text color={colors.textDim}>{label.padEnd(12)}</Text>
      <Text color={color} bold>
        {usd(value)} {arrow}
      </Text>
    </Box>
  );
}

export function PnLPanel({ focused }: { focused?: boolean }) {
  const pnl = useTerminal((s) => s.pnl);

  const status =
    pnl == null ? "info" : pnl.total >= 0 ? "ok" : "warning";

  return (
    <Panel title="P&L" focused={focused} status={status}>
      <PnLRow label="Realized" value={pnl?.realized} />
      <PnLRow label="Unrealized" value={pnl?.unrealized} />
      <Box marginTop={1}>
        <PnLRow label="Total" value={pnl?.total} />
      </Box>
    </Panel>
  );
}
