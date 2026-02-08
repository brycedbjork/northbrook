import { Box, Text } from "ink";
import { colors } from "../lib/theme.js";

export type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const normalized = content.replaceAll("\r\n", "\n").trimEnd();
  const lines = normalized.split("\n");

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => {
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
