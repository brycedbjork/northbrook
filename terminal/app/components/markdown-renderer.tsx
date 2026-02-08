import { Box, Text } from "ink";
import { colors } from "../lib/theme.js";

export type MarkdownRendererProps = {
  content: string;
  scrollOffset?: number;
  maxLines?: number;
};

export function MarkdownRenderer({
  content,
  scrollOffset = 0,
  maxLines,
}: MarkdownRendererProps) {
  const normalized = content.replaceAll("\r\n", "\n").trimEnd();
  const lines = normalized.split("\n");
  const clampedOffset = Math.max(0, scrollOffset);
  const visibleLines =
    typeof maxLines === "number" && maxLines > 0
      ? lines.slice(clampedOffset, clampedOffset + maxLines)
      : lines;

  return (
    <Box flexDirection="column">
      {visibleLines.map((line, visibleIndex) => {
        const index = clampedOffset + visibleIndex;
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
          return (
            <Text key={`line-${index.toString()}`} bold color={colors.textBright}>
              {heading[2]}
            </Text>
          );
        }

        if (/^\s*[-*]\s+/.test(line)) {
          return (
            <Text key={`line-${index.toString()}`} color={colors.text}>
              {line.replace(/^\s*[-*]\s+/, "• ")}
            </Text>
          );
        }

        if (line.startsWith("> ")) {
          return (
            <Text key={`line-${index.toString()}`} color={colors.textDim}>
              {line.slice(2)}
            </Text>
          );
        }

        if (line === "```") {
          return (
            <Text key={`line-${index.toString()}`} color={colors.border}>
              {"─".repeat(40)}
            </Text>
          );
        }

        return (
          <Text key={`line-${index.toString()}`} color={colors.text}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
