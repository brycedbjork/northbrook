import { Box, Text, useStdout } from "ink";
import { colors } from "../lib/theme.js";
import { MarkdownRenderer } from "./markdown-renderer.js";

export type DetailViewProps = {
  title: string;
  content: string;
  scrollOffset: number;
};

export function DetailView({ title, content, scrollOffset }: DetailViewProps) {
  const { stdout } = useStdout();
  const rows = stdout.rows ?? 24;
  const maxMarkdownLines = Math.max(6, rows - 14);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box>
        <Text bold color={colors.textBright}>
          {title}
        </Text>
      </Box>
      <Text color={colors.border}>{"─".repeat(60)}</Text>
      <Box flexGrow={1}>
        <MarkdownRenderer
          content={content}
          maxLines={maxMarkdownLines}
          scrollOffset={scrollOffset}
        />
      </Box>
    </Box>
  );
}
