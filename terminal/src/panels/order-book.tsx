/**
 * Order book panel — shows active orders with status coloring.
 */

import React from "react";
import { Panel } from "../components/panel.js";
import { Table, type Column } from "../components/table.js";
import { useTerminal } from "../store/index.js";
import { usd, num, shortTime } from "../lib/format.js";
import { colors } from "../lib/theme.js";
import type { OrderRecord } from "@northbrook/broker-sdk-typescript";

const statusColors: Record<string, string> = {
  submitted: colors.blue,
  pending: colors.yellow,
  filled: colors.green,
  cancelled: colors.textDim,
  rejected: colors.red,
  error: colors.red,
};

const columns: Column<OrderRecord>[] = [
  { header: "Time", width: 10, render: (r) => shortTime(r.submitted_at) },
  {
    header: "Side",
    width: 6,
    render: (r) => r.side.toUpperCase(),
    color: (r) => (r.side === "buy" ? colors.green : colors.red),
  },
  { header: "Symbol", width: 10, render: (r) => r.symbol },
  { header: "Qty", width: 8, align: "right", render: (r) => num(r.qty, 0) },
  { header: "Type", width: 8, render: (r) => r.order_type },
  { header: "Limit", width: 10, align: "right", render: (r) => usd(r.limit_price) },
  {
    header: "Status",
    width: 12,
    render: (r) => r.status,
    color: (r) => statusColors[r.status] ?? colors.textDim,
  },
];

export function OrderBookPanel({ focused }: { focused?: boolean }) {
  const orders = useTerminal((s) => s.orders);
  const active = orders.filter((o) => ["submitted", "pending"].includes(o.status));

  return (
    <Panel title="Active Orders" focused={focused} status={active.length > 0 ? "info" : "ok"}>
      <Table columns={columns} rows={active} emptyMessage="No active orders" maxRows={8} />
    </Panel>
  );
}
