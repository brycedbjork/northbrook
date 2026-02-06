/**
 * Positions panel — shows current portfolio positions with P&L coloring.
 */

import React from "react";
import { Panel } from "../components/panel.js";
import { Table, type Column } from "../components/table.js";
import { useTerminal } from "../store/index.js";
import { usd, num, pct } from "../lib/format.js";
import { colors } from "../lib/theme.js";
import type { Position } from "@northbrook/broker-sdk-typescript";

const columns: Column<Position>[] = [
  { header: "Symbol", width: 10, render: (r) => r.symbol },
  { header: "Qty", width: 8, align: "right", render: (r) => num(r.qty, 0) },
  { header: "Avg Cost", width: 12, align: "right", render: (r) => usd(r.avg_cost) },
  { header: "Mkt Price", width: 12, align: "right", render: (r) => usd(r.market_price) },
  { header: "Mkt Value", width: 12, align: "right", render: (r) => usd(r.market_value) },
  {
    header: "Unrl P&L",
    width: 12,
    align: "right",
    render: (r) => usd(r.unrealized_pnl),
    color: (r) =>
      r.unrealized_pnl == null
        ? colors.textDim
        : r.unrealized_pnl >= 0
          ? colors.green
          : colors.red,
  },
];

export function PositionsPanel({ focused }: { focused?: boolean }) {
  const positions = useTerminal((s) => s.positions);

  return (
    <Panel title="Positions" focused={focused} status={positions.length > 0 ? "ok" : "info"}>
      <Table columns={columns} rows={positions} emptyMessage="No positions" maxRows={10} />
    </Panel>
  );
}
