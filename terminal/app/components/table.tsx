/**
 * Table — renders aligned columnar data.
 *
 * Supports column alignment, color coding, and optional row selection.
 */

import { Box, Text } from "ink";
import { colors } from "../lib/theme.js";

export type Column<T> = {
  header: string;
  width: number;
  align?: "left" | "right";
  render: (row: T) => string;
  color?: (row: T) => string;
};

export type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  selectedIndex?: number;
  maxRows?: number;
  emptyMessage?: string;
};

export function Table<T>({
  columns,
  rows,
  selectedIndex,
  maxRows,
  emptyMessage = "No data",
}: TableProps<T>) {
  const visible = maxRows ? rows.slice(0, maxRows) : rows;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {columns.map((col, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: columns are static
          <Box key={i} width={col.width}>
            <Text bold dimColor>
              {col.align === "right"
                ? col.header.padStart(col.width - 1)
                : col.header.padEnd(col.width - 1)}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Rows */}
      {visible.length === 0 ? (
        <Box paddingX={1} paddingY={1}>
          <Text color={colors.textDim}>{emptyMessage}</Text>
        </Box>
      ) : (
        visible.map((row, ri) => {
          const isSelected = ri === selectedIndex;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows keyed by position
            <Box key={ri}>
              {columns.map((col, ci) => {
                const value = col.render(row);
                const cellColor =
                  col.color?.(row) ?? (isSelected ? colors.brand : colors.text);
                const formatted =
                  col.align === "right"
                    ? value.padStart(col.width - 1)
                    : value.padEnd(col.width - 1);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are static
                  <Box key={ci} width={col.width}>
                    <Text
                      backgroundColor={
                        isSelected ? colors.bgSelected : undefined
                      }
                      bold={isSelected}
                      color={cellColor}
                    >
                      {formatted}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          );
        })
      )}

      {/* Overflow indicator */}
      {maxRows && rows.length > maxRows && (
        <Text color={colors.textDim}>+{rows.length - maxRows} more</Text>
      )}
    </Box>
  );
}
