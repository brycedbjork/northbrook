export type ScreenName = "command" | "strategies" | "positions" | "research";

export const screens: ScreenName[] = [
  "command",
  "strategies",
  "positions",
  "research",
];

export type KeyBinding = {
  key: string;
  label: string;
  description: string;
};

export const globalKeys: KeyBinding[] = [
  { key: "tab", label: "Tab", description: "Switch screen" },
  { key: "up/down", label: "↑/↓", description: "Navigate" },
  { key: "enter", label: "Enter", description: "Open / Send" },
  { key: "esc", label: "Esc", description: "Go back" },
  { key: "type", label: "Type", description: "Chat input" },
];
