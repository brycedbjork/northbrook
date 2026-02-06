/**
 * Hook for global keyboard shortcut handling.
 *
 * Listens for raw key input via Ink's useInput and dispatches
 * screen switches, panel focus, and modal toggles.
 */

import { useInput } from "ink";
import { useTerminal } from "../store/index.js";
import { screenMap } from "../lib/keymap.js";

export function useKeybinds(onQuit: () => void): void {
  const setScreen = useTerminal((s) => s.setScreen);
  const cycleFocus = useTerminal((s) => s.cycleFocus);
  const toggleHelp = useTerminal((s) => s.toggleHelp);
  const toggleCommandPalette = useTerminal((s) => s.toggleCommandPalette);
  const showHelp = useTerminal((s) => s.showHelp);
  const showCommandPalette = useTerminal((s) => s.showCommandPalette);

  useInput((input, key) => {
    // Escape closes any overlay
    if (key.escape) {
      if (showHelp) {
        toggleHelp();
        return;
      }
      if (showCommandPalette) {
        toggleCommandPalette();
        return;
      }
    }

    // Don't process other global keys when overlays are open
    if (showCommandPalette) return;

    // Screen switching (1-6)
    const target = screenMap[input];
    if (target) {
      setScreen(target);
      return;
    }

    // Tab cycles panel focus
    if (key.tab) {
      cycleFocus();
      return;
    }

    // Help toggle
    if (input === "?") {
      toggleHelp();
      return;
    }

    // Command palette
    if (input === ":") {
      toggleCommandPalette();
      return;
    }

    // Quit
    if (input === "q" && !showHelp) {
      onQuit();
    }
  });
}
