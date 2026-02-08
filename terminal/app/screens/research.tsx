import { Box, Text } from "ink";
import { DetailView } from "../components/detail-view.js";
import { NavigableList } from "../components/navigable-list.js";
import { Panel } from "../components/panel.js";
import { colors } from "../lib/theme.js";
import { timeAgo } from "../lib/time.js";
import { useTerminal } from "../store/index.js";
import type { ResearchEntry } from "../store/types.js";

function renderItem(item: ResearchEntry, _index: number, selected: boolean) {
  return (
    <Box>
      <Text bold={selected} color={selected ? colors.textBright : colors.text}>
        {item.title}
      </Text>
      {item.completedAt && (
        <Text color={colors.textDim}>
          {" · completed "}
          {timeAgo(item.completedAt)}
        </Text>
      )}
      {item.tags.length > 0 && (
        <Text color={colors.brand}>
          {" · "}
          {item.tags.join(", ")}
        </Text>
      )}
    </Box>
  );
}

export function ResearchScreen() {
  const research = useTerminal((s) => s.research);
  const viewMode = useTerminal((s) => s.viewMode);
  const selectedIndex = useTerminal((s) => s.selectedIndex);
  const scrollOffset = useTerminal((s) => s.scrollOffset);
  const entry = research[selectedIndex];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Panel title="Research">
        {viewMode === "detail" && entry ? (
          <DetailView
            content={entry.content}
            scrollOffset={scrollOffset}
            title={entry.title}
          />
        ) : (
          <NavigableList
            emptyMessage="No research."
            items={research}
            renderItem={renderItem}
            selectedIndex={selectedIndex}
          />
        )}
      </Panel>
    </Box>
  );
}
