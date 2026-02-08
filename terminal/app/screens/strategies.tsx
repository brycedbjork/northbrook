import { Box, Text } from "ink";
import { DetailView } from "../components/detail-view.js";
import { NavigableList } from "../components/navigable-list.js";
import { Panel } from "../components/panel.js";
import { usd } from "../lib/format.js";
import { colors } from "../lib/theme.js";
import { timeAgo } from "../lib/time.js";
import { useTerminal } from "../store/index.js";
import type { StrategyEntry } from "../store/types.js";

function renderItem(item: StrategyEntry, _index: number, selected: boolean) {
  return (
    <>
      <Text bold={selected} color={selected ? colors.textBright : colors.text}>
        {item.name}
      </Text>
      {item.lastEvaluatedAt && (
        <Text color={colors.textDim}>
          {" · evaluated "}
          {timeAgo(item.lastEvaluatedAt)}
        </Text>
      )}
      <Text color={item.dayGainLoss >= 0 ? colors.green : colors.red}>
        {" · "}
        {usd(item.dayGainLoss)}
      </Text>
      <Text color={colors.textDim}>
        {" · "}
        {item.positionCount} pos
      </Text>
    </>
  );
}

export function StrategiesScreen() {
  const strategies = useTerminal((s) => s.strategies);
  const viewMode = useTerminal((s) => s.viewMode);
  const selectedIndex = useTerminal((s) => s.selectedIndex);
  const scrollOffset = useTerminal((s) => s.scrollOffset);
  const entry = strategies[selectedIndex];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Panel title="Strategies">
        {viewMode === "detail" && entry ? (
          <DetailView
            content={entry.content}
            scrollOffset={scrollOffset}
            title={entry.name}
          />
        ) : (
          <NavigableList
            emptyMessage="No strategies."
            items={strategies}
            renderItem={renderItem}
            selectedIndex={selectedIndex}
          />
        )}
      </Panel>
    </Box>
  );
}
