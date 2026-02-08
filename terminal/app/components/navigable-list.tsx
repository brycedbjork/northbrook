import { Box, Text } from "ink";
import type React from "react";
import { colors } from "../lib/theme.js";

export type NavigableListProps<T> = {
  items: T[];
  selectedIndex: number;
  renderItem: (item: T, index: number, selected: boolean) => React.ReactNode;
  emptyMessage?: string;
};

export function NavigableList<T>({
  items,
  selectedIndex,
  renderItem,
  emptyMessage = "No items",
}: NavigableListProps<T>) {
  if (items.length === 0) {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color={colors.textDim}>{emptyMessage}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {items.map((item, i) => {
        const selected = i === selectedIndex;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: generic list items have no stable key
          <Box key={i}>
            <Text color={selected ? colors.brand : colors.textMuted}>
              {selected ? "> " : "  "}
            </Text>
            {renderItem(item, i, selected)}
          </Box>
        );
      })}
    </Box>
  );
}
