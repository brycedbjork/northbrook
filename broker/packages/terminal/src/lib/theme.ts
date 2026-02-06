/**
 * Terminal color palette and styling constants.
 *
 * Uses ANSI-256 compatible colors that degrade gracefully.
 * Every visual element in the TUI pulls from this single source of truth.
 */

export const colors = {
  // Backgrounds
  bg: "#0d1117",
  bgPanel: "#161b22",
  bgHighlight: "#1c2333",
  bgSelected: "#264f78",

  // Text
  text: "#c9d1d9",
  textDim: "#6e7681",
  textBright: "#f0f6fc",
  textMuted: "#484f58",

  // Accents
  brand: "#58a6ff",
  brandDim: "#1f6feb",

  // Semantic
  green: "#3fb950",
  greenDim: "#238636",
  red: "#f85149",
  redDim: "#da3633",
  yellow: "#d29922",
  yellowDim: "#9e6a03",
  orange: "#db6d28",
  blue: "#58a6ff",
  purple: "#bc8cff",
  cyan: "#39d2c0",
  pink: "#f778ba",

  // Borders
  border: "#30363d",
  borderFocus: "#58a6ff",
  borderDanger: "#f85149",
  borderSuccess: "#3fb950",
} as const;

export type ColorKey = keyof typeof colors;

export const symbols = {
  // Status indicators
  connected: "●",
  disconnected: "○",
  warning: "▲",
  error: "✖",
  ok: "✔",
  pending: "◌",
  running: "◉",

  // Borders and separators
  horizontalLine: "─",
  verticalLine: "│",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  teeRight: "├",
  teeLeft: "┤",
  teeDown: "┬",
  teeUp: "┴",
  cross: "┼",

  // Arrows
  arrowUp: "▲",
  arrowDown: "▼",
  arrowRight: "▶",
  arrowLeft: "◀",

  // Charts
  barFull: "█",
  barHigh: "▓",
  barMed: "▒",
  barLow: "░",

  // Misc
  bullet: "•",
  ellipsis: "…",
  sparkUp: "↑",
  sparkDown: "↓",
  sparkFlat: "→",
} as const;

/** Standard box-drawing character sets for panel borders. */
export const borderStyle = {
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
  },
  rounded: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
} as const;
