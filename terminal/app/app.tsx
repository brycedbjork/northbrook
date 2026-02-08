import { Box } from "ink";
import { ChatInput } from "./components/chat-input.js";
import { ChatView } from "./components/chat-view.js";
import { TabBar } from "./components/tab-bar.js";
import { useKeybinds } from "./hooks/use-keybinds.js";
import { POLL_INTERVAL_MS, usePolling } from "./hooks/use-polling.js";
import { CommandScreen } from "./screens/command.js";
import { PositionsScreen } from "./screens/positions.js";
import { ResearchScreen } from "./screens/research.js";
import { StrategiesScreen } from "./screens/strategies.js";
import { useTerminal } from "./store/index.js";

const screenComponents = {
  command: CommandScreen,
  strategies: StrategiesScreen,
  positions: PositionsScreen,
  research: ResearchScreen,
} as const;

export function App({ onExit }: { onExit: () => void }) {
  const screen = useTerminal((s) => s.screen);
  const viewMode = useTerminal((s) => s.viewMode);

  useKeybinds(onExit);
  usePolling(POLL_INTERVAL_MS);

  const ScreenComponent = screenComponents[screen];

  return (
    <Box flexDirection="column" height="100%" width="100%">
      <Box flexGrow={1}>
        {viewMode === "chat" ? <ChatView /> : <ScreenComponent />}
      </Box>
      <ChatInput />
      <TabBar />
    </Box>
  );
}
