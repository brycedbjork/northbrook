/**
 * Risk screen — full risk monitoring and configuration view.
 */

import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { Gauge } from "../components/gauge.js";
import { Badge } from "../components/badge.js";
import { Table, type Column } from "../components/table.js";
import { useTerminal } from "../store/index.js";
import { colors, symbols } from "../lib/theme.js";
import { usd, num } from "../lib/format.js";

interface LimitRow {
  param: string;
  value: string;
  limit: string;
  usage: number;
}

export function RiskScreen() {
  const limits = useTerminal((s) => s.limits);
  const halted = useTerminal((s) => s.halted);
  const focus = useTerminal((s) => s.focusedPanel);

  const rows: LimitRow[] = limits
    ? [
        {
          param: "Max Position %",
          value: `${limits.max_position_pct}%`,
          limit: `${limits.max_position_pct}%`,
          usage: 0,
        },
        {
          param: "Max Order Value",
          value: usd(limits.max_order_value),
          limit: usd(limits.max_order_value),
          usage: 0,
        },
        {
          param: "Daily Loss %",
          value: `${limits.max_daily_loss_pct}%`,
          limit: `${limits.max_daily_loss_pct}%`,
          usage: 0,
        },
        {
          param: "Sector Exposure %",
          value: `${limits.max_sector_exposure_pct}%`,
          limit: `${limits.max_sector_exposure_pct}%`,
          usage: 0,
        },
        {
          param: "Single Name %",
          value: `${limits.max_single_name_pct}%`,
          limit: `${limits.max_single_name_pct}%`,
          usage: 0,
        },
        {
          param: "Max Open Orders",
          value: num(limits.max_open_orders, 0),
          limit: num(limits.max_open_orders, 0),
          usage: 0,
        },
        {
          param: "Rate Limit",
          value: `${limits.order_rate_limit}/min`,
          limit: `${limits.order_rate_limit}/min`,
          usage: 0,
        },
      ]
    : [];

  const limitColumns: Column<LimitRow>[] = [
    { header: "Parameter", width: 22, render: (r) => r.param },
    { header: "Limit", width: 16, align: "right", render: (r) => r.limit },
    { header: "Current", width: 16, align: "right", render: (r) => r.value },
  ];

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Halted banner */}
      {halted && (
        <Box
          borderStyle="double"
          borderColor={colors.red}
          justifyContent="center"
          paddingX={2}
        >
          <Text color={colors.red} bold>
            {symbols.warning} ALL TRADING IS HALTED {symbols.warning}
          </Text>
        </Box>
      )}

      <Box flexDirection="row" flexGrow={1}>
        <Box flexGrow={2}>
          <Panel title="Risk Limits" focused={focus === 0}>
            <Table columns={limitColumns} rows={rows} emptyMessage="Loading..." />
          </Panel>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Panel title="Status" focused={focus === 1}>
            <Box gap={1}>
              <Text color={colors.textDim}>Trading</Text>
              <Badge
                label={halted ? "HALTED" : "ACTIVE"}
                variant={halted ? "error" : "success"}
              />
            </Box>
            {limits && (
              <Box flexDirection="column" marginTop={1}>
                <Text color={colors.textDim}>Allowlist: {limits.symbol_allowlist.length > 0 ? limits.symbol_allowlist.join(", ") : "none"}</Text>
                <Text color={colors.textDim}>Blocklist: {limits.symbol_blocklist.length > 0 ? limits.symbol_blocklist.join(", ") : "none"}</Text>
              </Box>
            )}
          </Panel>
        </Box>
      </Box>

      <Box paddingX={1}>
        <Text color={colors.textDim}>
          h=halt trading  H=resume trading  e=edit limit
        </Text>
      </Box>
    </Box>
  );
}
