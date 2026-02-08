import { Box, Text } from "ink";
import { colors, symbols } from "../lib/theme.js";
import { useTerminal } from "../store/index.js";

function renderConnectionLabel(connected: boolean): string {
  return connected ? "connected" : "disconnected";
}

export function ChatView() {
  const session = useTerminal((s) => s.activeSession);
  const chatConnected = useTerminal((s) => s.chatConnected);
  const chatStreaming = useTerminal((s) => s.chatStreaming);
  const chatError = useTerminal((s) => s.chatError);
  const chatStatus = useTerminal((s) => s.chatStatus);
  const chatWidgetLines = useTerminal((s) => s.chatWidgetLines);
  const chatActiveTool = useTerminal((s) => s.chatActiveTool);

  if (!session) {
    return (
      <Box paddingX={1}>
        <Text color={colors.textDim}>No active chat session.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box>
        <Text bold color={colors.textBright}>
          Pi Chat
        </Text>
        <Text color={colors.textDim}> on {session.originScreen}</Text>
        <Box flexGrow={1} />
        <Text color={chatConnected ? colors.green : colors.red}>
          {chatConnected ? symbols.connected : symbols.disconnected}{" "}
          {renderConnectionLabel(chatConnected)}
        </Text>
        {chatStreaming && <Text color={colors.yellow}>{" · streaming"}</Text>}
        <Text color={colors.textMuted}>{" · esc to exit"}</Text>
      </Box>
      <Text color={colors.border}>{"─".repeat(60)}</Text>

      {(chatActiveTool || chatStatus) && (
        <Box paddingBottom={1}>
          {chatActiveTool && <Text color={colors.blue}>Tool: {chatActiveTool}</Text>}
          {chatActiveTool && chatStatus && <Text color={colors.textDim}>{" · "}</Text>}
          {chatStatus && <Text color={colors.textDim}>{chatStatus}</Text>}
        </Box>
      )}

      {chatWidgetLines.length > 0 && (
        <Box flexDirection="column" paddingBottom={1}>
          {chatWidgetLines.map((line, index) => (
            <Text key={`widget-${index.toString()}`} color={colors.textDim}>
              {line}
            </Text>
          ))}
        </Box>
      )}

      {chatError && (
        <Box paddingBottom={1}>
          <Text color={colors.red}>{chatError}</Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} paddingTop={1}>
        {session.messages.map((msg) => (
          <Box key={msg.id} paddingBottom={1}>
            <Text color={msg.role === "user" ? colors.text : colors.brand}>
              {msg.role === "user" ? "You" : "PI"}
            </Text>
            <Text color={colors.textDim}>{" · "}</Text>
            <Text
              color={msg.role === "user" ? colors.text : colors.brand}
              wrap="wrap"
            >
              {msg.content || (msg.role === "assistant" && chatStreaming ? "…" : "")}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
