import chalk from "chalk";
import { Box, Text, useInput, useStdout } from "ink";
import { useEffect, useState } from "react";
import { colors } from "../lib/theme.js";
import { useTerminal } from "../store/index.js";

type CursorState = {
  cursorOffset: number;
  cursorWidth: number;
};

type InputKey = {
  upArrow?: boolean;
  downArrow?: boolean;
  ctrl?: boolean;
  tab?: boolean;
  shift?: boolean;
  return?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  backspace?: boolean;
  delete?: boolean;
  meta?: boolean;
};

type InputChange = {
  nextValue: string;
  nextCursor: CursorState;
  submit: boolean;
};

const PROMPT = "› ";
const PROMPT_WIDTH = PROMPT.length;
const DEFAULT_TERMINAL_WIDTH = 80;
const EMPTY_CURSOR_WIDTH = 0;
const PLACEHOLDER_TEXT = "Chat with portfolio manager";
const WHITESPACE_PATTERN = /\s/;

function clampCursor(valueLength: number, cursorOffset: number): number {
  return Math.max(0, Math.min(valueLength, cursorOffset));
}

function findPreviousWordStart(value: string, cursorOffset: number): number {
  let index = cursorOffset;
  while (index > 0 && WHITESPACE_PATTERN.test(value[index - 1] ?? "")) {
    index--;
  }
  while (index > 0 && !WHITESPACE_PATTERN.test(value[index - 1] ?? "")) {
    index--;
  }
  return index;
}

function deleteRangeLeft(
  value: string,
  cursorOffset: number,
  rangeStart: number
): { value: string; cursorOffset: number } {
  const nextValue = value.slice(0, rangeStart) + value.slice(cursorOffset);
  return {
    value: nextValue,
    cursorOffset: rangeStart,
  };
}

function shouldIgnoreKey(input: string, key: InputKey): boolean {
  return !!(
    key.upArrow ||
    key.downArrow ||
    (key.ctrl && input === "c") ||
    key.tab ||
    (key.shift && key.tab)
  );
}

function asInputChange(
  nextValue: string,
  cursorOffset: number,
  cursorWidth = EMPTY_CURSOR_WIDTH
): InputChange {
  return {
    nextValue,
    nextCursor: {
      cursorOffset: clampCursor(nextValue.length, cursorOffset),
      cursorWidth,
    },
    submit: false,
  };
}

function deleteToLineStart(value: string, cursorOffset: number): InputChange {
  const updated = deleteRangeLeft(value, cursorOffset, 0);
  return asInputChange(updated.value, updated.cursorOffset);
}

function deletePreviousWord(value: string, cursorOffset: number): InputChange {
  const wordStart = findPreviousWordStart(value, cursorOffset);
  const updated = deleteRangeLeft(value, cursorOffset, wordStart);
  return asInputChange(updated.value, updated.cursorOffset);
}

function deletePreviousChar(value: string, cursorOffset: number): InputChange {
  if (cursorOffset <= 0) {
    return asInputChange(value, cursorOffset);
  }
  const updated = deleteRangeLeft(value, cursorOffset, cursorOffset - 1);
  return asInputChange(updated.value, updated.cursorOffset);
}

function insertAtCursor(
  value: string,
  cursorOffset: number,
  input: string
): InputChange {
  const nextValue =
    value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
  const nextCursorOffset = cursorOffset + input.length;
  const nextCursorWidth = input.length > 1 ? input.length : EMPTY_CURSOR_WIDTH;
  return asInputChange(nextValue, nextCursorOffset, nextCursorWidth);
}

function isDeleteWordShortcut(input: string, key: InputKey): boolean {
  const ctrlWordDelete = key.ctrl === true && input === "w";
  const metaDelete =
    (key.backspace === true || key.delete === true) && key.meta === true;
  return ctrlWordDelete || metaDelete;
}

function computeInputChange(
  input: string,
  key: InputKey,
  value: string,
  cursor: CursorState
): InputChange {
  if (shouldIgnoreKey(input, key)) {
    return { nextValue: value, nextCursor: cursor, submit: false };
  }

  if (key.return) {
    return { nextValue: value, nextCursor: cursor, submit: true };
  }

  if (key.ctrl && input === "u") {
    return deleteToLineStart(value, cursor.cursorOffset);
  }

  if (isDeleteWordShortcut(input, key)) {
    return deletePreviousWord(value, cursor.cursorOffset);
  }

  if (key.leftArrow) {
    return asInputChange(value, cursor.cursorOffset - 1);
  }
  if (key.rightArrow) {
    return asInputChange(value, cursor.cursorOffset + 1);
  }
  if (key.backspace || key.delete) {
    return deletePreviousChar(value, cursor.cursorOffset);
  }
  if (input && !key.ctrl && !key.meta) {
    return insertAtCursor(value, cursor.cursorOffset, input);
  }

  return asInputChange(value, cursor.cursorOffset, cursor.cursorWidth);
}

function renderFocusedValue(value: string, cursor: CursorState): string {
  const cursorActualWidth = cursor.cursorWidth;
  let rendered = value.length > 0 ? "" : chalk.inverse(" ");

  let i = 0;
  for (const char of value) {
    rendered +=
      i >= cursor.cursorOffset - cursorActualWidth && i <= cursor.cursorOffset
        ? chalk.inverse(char)
        : char;
    i++;
  }

  if (value.length > 0 && cursor.cursorOffset === value.length) {
    rendered += chalk.inverse(" ");
  }

  return rendered;
}

function renderContent(
  value: string,
  focused: boolean,
  cursor: CursorState
): string {
  const placeholder = focused ? PLACEHOLDER_TEXT : "";
  let renderedPlaceholder = chalk.hex(colors.textDim)(placeholder);
  if (focused) {
    if (placeholder.length > 0) {
      renderedPlaceholder =
        chalk.inverse(placeholder[0]) +
        chalk.hex(colors.textDim)(placeholder.slice(1));
    } else {
      renderedPlaceholder = chalk.inverse(" ");
    }
  }
  const renderedValue = focused ? renderFocusedValue(value, cursor) : value;
  const prompt = chalk.hex(focused ? colors.textBright : colors.textDim)(
    PROMPT
  );

  return `${prompt}${value.length > 0 ? renderedValue : renderedPlaceholder}`;
}

function getContentWidth(
  value: string,
  focused: boolean,
  cursor: CursorState
): number {
  const placeholder = focused ? PLACEHOLDER_TEXT : "";
  let width =
    PROMPT_WIDTH + (value.length > 0 ? value.length : placeholder.length);
  if (focused && value.length > 0 && cursor.cursorOffset === value.length) {
    width++;
  }
  return width;
}

export function ChatInput() {
  const chatInput = useTerminal((s) => s.chatInput);
  const chatFocused = useTerminal((s) => s.chatFocused);
  const setChatInput = useTerminal((s) => s.setChatInput);
  const submitChat = useTerminal((s) => s.submitChat);
  const { stdout } = useStdout();
  const [cursor, setCursor] = useState<CursorState>({
    cursorOffset: chatInput.length,
    cursorWidth: 0,
  });

  useEffect(() => {
    if (!chatFocused) {
      return;
    }

    setCursor((previous) => {
      if (previous.cursorOffset <= chatInput.length) {
        return previous;
      }

      return {
        cursorOffset: chatInput.length,
        cursorWidth: EMPTY_CURSOR_WIDTH,
      };
    });
  }, [chatFocused, chatInput]);

  useInput(
    (input, key) => {
      const change = computeInputChange(input, key, chatInput, cursor);
      if (change.submit) {
        if (chatInput.trim()) {
          submitChat();
        }
        return;
      }

      setCursor(change.nextCursor);
      if (change.nextValue !== chatInput) {
        setChatInput(change.nextValue);
      }
    },
    { isActive: chatFocused }
  );

  const content = renderContent(chatInput, chatFocused, cursor);
  const width = Math.max(1, stdout.columns ?? DEFAULT_TERMINAL_WIDTH);
  const contentWidth = getContentWidth(chatInput, chatFocused, cursor);
  const pad = Math.max(0, width - contentWidth);

  const bg = chalk.bgHex(colors.bgHighlight);
  const emptyRow = bg(" ".repeat(width));
  const inputRow = bg(`${content}${" ".repeat(pad)}`);

  return (
    <Box flexDirection="column" width="100%">
      <Text>{emptyRow}</Text>
      <Text wrap="truncate-end">{inputRow}</Text>
      <Text>{emptyRow}</Text>
    </Box>
  );
}
