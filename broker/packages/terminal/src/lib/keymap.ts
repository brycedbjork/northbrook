/**
 * Key binding definitions for the TUI.
 *
 * All keyboard shortcuts are defined here so they can be displayed
 * in the help overlay and referenced from a single location.
 */

export interface KeyBinding {
  key: string;
  label: string;
  description: string;
}

/** Global key bindings available on every screen. */
export const globalKeys: KeyBinding[] = [
  { key: "1", label: "1", description: "Dashboard" },
  { key: "2", label: "2", description: "Orders" },
  { key: "3", label: "3", description: "Strategy" },
  { key: "4", label: "4", description: "Risk" },
  { key: "5", label: "5", description: "Agents" },
  { key: "6", label: "6", description: "Audit" },
  { key: "?", label: "?", description: "Help" },
  { key: ":", label: ":", description: "Command palette" },
  { key: "q", label: "q", description: "Quit" },
];

/** Dashboard-specific key bindings. */
export const dashboardKeys: KeyBinding[] = [
  { key: "tab", label: "Tab", description: "Cycle panel focus" },
  { key: "r", label: "r", description: "Refresh all data" },
];

/** Order screen key bindings. */
export const orderKeys: KeyBinding[] = [
  { key: "n", label: "n", description: "New order" },
  { key: "c", label: "c", description: "Cancel selected" },
  { key: "C", label: "C", description: "Cancel all" },
  { key: "j", label: "j/k", description: "Navigate orders" },
  { key: "enter", label: "Enter", description: "Order details" },
];

/** Risk screen key bindings. */
export const riskKeys: KeyBinding[] = [
  { key: "h", label: "h", description: "Halt trading" },
  { key: "H", label: "H", description: "Resume trading" },
  { key: "e", label: "e", description: "Edit limit" },
];

/** Strategy screen key bindings. */
export const strategyKeys: KeyBinding[] = [
  { key: "n", label: "n", description: "New strategy" },
  { key: "d", label: "d", description: "Deploy selected" },
  { key: "s", label: "s", description: "Stop selected" },
  { key: "enter", label: "Enter", description: "Strategy details" },
];

export type ScreenName = "dashboard" | "orders" | "strategy" | "risk" | "agents" | "audit";

/** Map screen numbers (1-6) to screen names. */
export const screenMap: Record<string, ScreenName> = {
  "1": "dashboard",
  "2": "orders",
  "3": "strategy",
  "4": "risk",
  "5": "agents",
  "6": "audit",
};
