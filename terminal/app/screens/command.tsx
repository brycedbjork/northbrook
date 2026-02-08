import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import packageJson from "../../package.json" with { type: "json" };
import { Panel } from "../components/panel.js";
import { type Column, Table } from "../components/table.js";
import { useDaemonBootstrapState } from "../hooks/use-daemon-bootstrap.js";
import { usd } from "../lib/format.js";
import { colors } from "../lib/theme.js";
import { useTerminal } from "../store/index.js";
import type { StrategyEntry } from "../store/types.js";

function gainLossColor(value: number): string {
  return value >= 0 ? colors.green : colors.red;
}

const columns: Column<StrategyEntry>[] = [
  {
    header: "Strategy",
    width: 24,
    render: (r) => r.name,
  },
  {
    header: "Status",
    width: 12,
    render: (r) => r.status,
    color: (r) => (r.status === "active" ? colors.green : colors.textDim),
  },
  {
    header: "Positions",
    width: 12,
    align: "right",
    render: (r) => String(r.positionCount),
  },
  {
    header: "Day G/L",
    width: 14,
    align: "right",
    render: (r) => usd(r.dayGainLoss),
    color: (r) => gainLossColor(r.dayGainLoss),
  },
  {
    header: "Total G/L",
    width: 14,
    align: "right",
    render: (r) => usd(r.totalGainLoss),
    color: (r) => gainLossColor(r.totalGainLoss),
  },
];

export function CommandScreen() {
  const daemonBootstrapState = useDaemonBootstrapState();
  const strategies = useTerminal((s) => s.strategies);
  const portfolioDayGainLoss = useTerminal((s) => s.portfolioDayGainLoss);
  const portfolioTotalGainLoss = useTerminal((s) => s.portfolioTotalGainLoss);
  const portfolioTotalValue = useTerminal((s) => s.portfolioTotalValue);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Panel
        title={
          <>
            <Text bold color={colors.textBright}>
              North Brook
            </Text>
            <Text color={colors.textDim}> v{packageJson.version}</Text>
          </>
        }
        titleRight={
          daemonBootstrapState === "running" ? (
            <Box>
              <Text color={colors.textDim}>
                <Spinner type="dots" />
              </Text>
              <Text color={colors.textDim}> Starting services</Text>
            </Box>
          ) : daemonBootstrapState === "error" ? (
            <Text color={colors.red}>Startup failed</Text>
          ) : null
        }
      >
        <Table
          columns={columns}
          emptyMessage="No strategies yet."
          rows={strategies}
        />
        {strategies.length > 0 && (
          <Box paddingTop={1}>
            <Text color={colors.textDim}>Portfolio </Text>
            <Text color={colors.textBright}>{usd(portfolioTotalValue)}</Text>
            <Text color={colors.textDim}>{" · Day "}</Text>
            <Text color={portfolioDayGainLoss >= 0 ? colors.green : colors.red}>
              {usd(portfolioDayGainLoss)}
            </Text>
            <Text color={colors.textDim}>{" · Total "}</Text>
            <Text
              color={portfolioTotalGainLoss >= 0 ? colors.green : colors.red}
            >
              {usd(portfolioTotalGainLoss)}
            </Text>
          </Box>
        )}
      </Panel>
    </Box>
  );
}
