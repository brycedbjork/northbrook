import { Box, Text } from "ink";
import { colors } from "../lib/theme.js";
import { MarkdownRenderer } from "./markdown-renderer.js";

export type DetailViewProps = {
  title: string;
  content: string;
  scrollOffset: number;
};

export function DetailView({ title, content, scrollOffset }: DetailViewProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box>
        <Text bold color={colors.textBright}>
          {title}
        </Text>
        <Box flexGrow={1} />
        <Text color={colors.textMuted}>esc to go back</Text>
      </Box>
      <Text color={colors.border}>{"─".repeat(60)}</Text>
      <Box flexGrow={1}>
        <MarkdownRenderer content={content} />
      </Box>
    </Box>
  );
}
