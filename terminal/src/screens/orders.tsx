/**
 * Orders screen — full order management view with history and fills.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { Table, type Column } from "../components/table.js";
import { useTerminal } from "../store/index.js";
import { usd, num, shortTime, dateTime } from "../lib/format.js";
import { colors } from "../lib/theme.js";
import type { OrderRecord, FillRecord } from "@northbrook/broker-sdk-typescript";

const orderColumns: Column<OrderRecord>[] = [
  { header: "Time", width: 12, render: (r) => shortTime(r.submitted_at) },
  { header: "ID", width: 10, render: (r) => r.client_order_id.slice(0, 8) },
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
  { header: "Stop", width: 10, align: "right", render: (r) => usd(r.stop_price) },
  { header: "TIF", width: 5, render: (r) => r.tif },
  { header: "Status", width: 12, render: (r) => r.status },
  { header: "Fill Px", width: 10, align: "right", render: (r) => usd(r.fill_price) },
];

const fillColumns: Column<FillRecord>[] = [
  { header: "Time", width: 12, render: (r) => shortTime(r.timestamp) },
  { header: "Symbol", width: 10, render: (r) => r.symbol },
  { header: "Qty", width: 8, align: "right", render: (r) => num(r.qty, 0) },
  { header: "Price", width: 10, align: "right", render: (r) => usd(r.price) },
  { header: "Commission", width: 12, align: "right", render: (r) => usd(r.commission) },
  { header: "Order", width: 10, render: (r) => r.client_order_id.slice(0, 8) },
];

export function OrdersScreen() {
  const orders = useTerminal((s) => s.orders);
  const fills = useTerminal((s) => s.fills);
  const focus = useTerminal((s) => s.focusedPanel);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Panel title="All Orders" focused={focus === 0}>
        <Table columns={orderColumns} rows={orders} emptyMessage="No orders" maxRows={15} />
      </Panel>
      <Panel title="Recent Fills" focused={focus === 1}>
        <Table columns={fillColumns} rows={fills} emptyMessage="No fills" maxRows={8} />
      </Panel>
      <Box paddingX={1}>
        <Text color={colors.textDim}>
          n=new order  c=cancel selected  C=cancel all  j/k=navigate  Enter=details
        </Text>
      </Box>
    </Box>
  );
}
