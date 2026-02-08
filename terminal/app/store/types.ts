import type { ScreenName } from "../lib/keymap.js";

// ── Broker data types ────────────────────────────────────────────

export type BrokerPosition = {
  symbol: string;
  qty: number;
  avgCost: number;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
};

export type BrokerOrder = {
  clientOrderId: string;
  symbol: string;
  status: string;
  side: string;
  qty: number;
  filledAt: string | null;
};

// ── Data entities ─────────────────────────────────────────────────

export type PositionEntry = {
  slug: string; // filename without .md (e.g. "aapl-20260113")
  symbol: string; // from frontmatter
  orderIds: string[]; // from frontmatter `order_ids` — links to broker
  strategy: string | null; // from frontmatter `strategy`
  openedAt: string | null; // from frontmatter `opened_at`
  content: string;

  // Broker-derived (merged at load time):
  status: "open" | "closed";
  qty: number;
  avgCost: number;
  marketValue: number;
  unrealizedPnl: number | null;
  marketPrice: number | null;
};

export type StrategyEntry = {
  slug: string;
  name: string;
  status: string;
  lastEvaluatedAt: string | null;
  positions: string[];
  content: string;

  // Broker-derived (aggregated from broker positions matching `positions[]`):
  dayGainLoss: number;
  totalGainLoss: number;
  positionCount: number;
};

export type ResearchEntry = {
  slug: string;
  title: string;
  completedAt: string | null;
  tags: string[];
  content: string;
};

// ── Chat ──────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type ChatSession = {
  id: string;
  originScreen: ScreenName;
  messages: ChatMessage[];
  createdAt: number;
};

// ── Store slices ──────────────────────────────────────────────────

export type ViewMode = "list" | "detail" | "chat";

export type DataSlice = {
  strategies: StrategyEntry[];
  positions: PositionEntry[];
  research: ResearchEntry[];
  portfolioDayGainLoss: number;
  portfolioTotalGainLoss: number;
  portfolioTotalValue: number;
  loadAll(): void;
};

export type NavigationSlice = {
  screen: ScreenName;
  viewMode: ViewMode;
  selectedIndex: number;
  scrollOffset: number;
  setScreen(screen: ScreenName): void;
  moveSelection(delta: number): void;
  openDetail(): void;
  goBack(): void;
  cycleTab(): void;
  scroll(delta: number): void;
};

export type ChatSlice = {
  activeSession: ChatSession | null;
  chatInput: string;
  chatFocused: boolean;
  chatConnected: boolean;
  chatStreaming: boolean;
  chatError: string | null;
  chatStatus: string | null;
  chatWidgetLines: string[];
  chatActiveTool: string | null;
  setChatInput(value: string): void;
  focusChat(): void;
  blurChat(): void;
  submitChat(): void;
  exitChat(): void;
};

export type ConnectionSlice = {
  connected: boolean;
  error: string | null;
  lastPing: number | null;
  brokerPositions: BrokerPosition[];
  brokerBalance: {
    netLiquidation: number | null;
    cash: number | null;
  } | null;
  brokerOrders: BrokerOrder[];
  fetchBrokerData(): Promise<void>;
};

// ── Combined store ────────────────────────────────────────────────

export type TerminalStore = DataSlice &
  NavigationSlice &
  ChatSlice &
  ConnectionSlice;
