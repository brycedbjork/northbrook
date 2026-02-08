import { useInput } from "ink";
import { store, useTerminal } from "../store/index.js";

const SCROLL_STEP = 3;

function handleChatEscape(viewMode: string, goBack: () => void): void {
  if (viewMode === "chat") {
    goBack();
  } else {
    store.getState().setChatInput("");
    store.getState().blurChat();
  }
}

function handleArrow(
  direction: "up" | "down",
  viewMode: string,
  scroll: (d: number) => void,
  moveSelection: (d: number) => void
): void {
  const delta = direction === "up" ? -1 : 1;
  if (viewMode === "detail") {
    scroll(delta * SCROLL_STEP);
  } else if (viewMode === "list") {
    moveSelection(delta);
  }
}

function handleReturn(
  chatInput: string,
  viewMode: string,
  submitChat: () => void,
  openDetail: () => void
): void {
  if (chatInput.trim()) {
    submitChat();
  } else if (viewMode === "list") {
    openDetail();
  }
}

export function useKeybinds(onQuit: () => void): void {
  const viewMode = useTerminal((s) => s.viewMode);
  const chatFocused = useTerminal((s) => s.chatFocused);
  const chatInput = useTerminal((s) => s.chatInput);
  const cycleTab = useTerminal((s) => s.cycleTab);
  const moveSelection = useTerminal((s) => s.moveSelection);
  const openDetail = useTerminal((s) => s.openDetail);
  const goBack = useTerminal((s) => s.goBack);
  const scroll = useTerminal((s) => s.scroll);
  const submitChat = useTerminal((s) => s.submitChat);
  const focusChat = useTerminal((s) => s.focusChat);
  const setChatInput = useTerminal((s) => s.setChatInput);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keyboard dispatch is inherently branchy
  useInput((input, key) => {
    if (input === "c" && key.ctrl) {
      onQuit();
      return;
    }

    if (key.tab) {
      cycleTab();
      return;
    }

    if (chatFocused) {
      if (key.escape) {
        handleChatEscape(viewMode, goBack);
      }
      return;
    }

    if (key.escape) {
      goBack();
      return;
    }

    if (key.upArrow) {
      handleArrow("up", viewMode, scroll, moveSelection);
      return;
    }
    if (key.downArrow) {
      handleArrow("down", viewMode, scroll, moveSelection);
      return;
    }

    if (key.return) {
      handleReturn(chatInput, viewMode, submitChat, openDetail);
      return;
    }

    if (input && !key.ctrl && !key.meta && viewMode !== "chat") {
      focusChat();
      setChatInput(chatInput + input);
    }
  });
}
