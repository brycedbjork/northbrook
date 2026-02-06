/**
 * Dashboard screen — the primary command center view.
 *
 * Layout:
 * ┌─────────────────────────────┬──────────────┐
 * │        Positions            │     P&L      │
 * │                             │              │
 * ├──────────────┬──────────────┤   Account    │
 * │ Active Orders│  Event Feed  │              │
 * │              │              │    Risk      │
 * └──────────────┴──────────────┴──────────────┘
 */

import React from "react";
import { Box } from "ink";
import { PositionsPanel } from "../panels/positions.js";
import { PnLPanel } from "../panels/pnl.js";
import { BalancePanel } from "../panels/balance.js";
import { OrderBookPanel } from "../panels/order-book.js";
import { EventFeedPanel } from "../panels/event-feed.js";
import { RiskStatusPanel } from "../panels/risk-status.js";
import { useTerminal } from "../store/index.js";

export function DashboardScreen() {
  const focus = useTerminal((s) => s.focusedPanel);

  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* Left column: 2/3 width */}
      <Box flexDirection="column" flexGrow={2}>
        <PositionsPanel focused={focus === 0} />
        <Box flexDirection="row">
          <Box flexGrow={1}>
            <OrderBookPanel focused={focus === 1} />
          </Box>
          <Box flexGrow={1}>
            <EventFeedPanel focused={focus === 2} />
          </Box>
        </Box>
      </Box>

      {/* Right column: 1/3 width */}
      <Box flexDirection="column" flexGrow={1}>
        <PnLPanel focused={focus === 3} />
        <BalancePanel focused={focus === 4} />
        <RiskStatusPanel focused={focus === 5} />
      </Box>
    </Box>
  );
}
