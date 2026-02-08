import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  getPiRpcClient,
  type PiRpcEvent,
  type PiStreamingBehavior,
} from "../lib/pi-rpc.js";
import {
  loadPositions,
  loadResearch,
  loadStrategies,
} from "../lib/data-loader.js";
import { screens } from "../lib/keymap.js";
import type {
  BrokerOrder,
  BrokerPosition,
  ChatMessage,
  ChatSession,
  PositionEntry,
  StrategyEntry,
  TerminalStore,
} from "./types.js";

let _msgId = 0;
let _chatRuntimeInitialized = false;
let _chatUnsubscribe: (() => void) | null = null;
let _assistantMessageId: string | null = null;

function nextMessageId(): string {
  _msgId += 1;
  return `msg-${_msgId.toString()}`;
}

function createSession(originScreen: TerminalStore["screen"]): ChatSession {
  return {
    id: `session-${Date.now().toString()}`,
    originScreen,
    messages: [],
    createdAt: Date.now(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function extractAssistantText(message: unknown): string {
  if (!isRecord(message)) {
    return "";
  }
  if (message.role !== "assistant") {
    return "";
  }

  const content = message.content;
  if (!Array.isArray(content)) {
    return "";
  }

  const textBlocks = content
    .filter(isRecord)
    .filter((block) => block.type === "text")
    .map((block) => asString(block.text) ?? "");

  return textBlocks.join("");
}

function ensureAssistantMessage(state: TerminalStore): {
  session: ChatSession;
  assistantMessageId: string;
} {
  const session = state.activeSession ?? createSession(state.screen);

  if (_assistantMessageId) {
    const existing = session.messages.find((message) => message.id === _assistantMessageId);
    if (existing) {
      return {
        session,
        assistantMessageId: _assistantMessageId,
      };
    }
  }

  const assistantMessage: ChatMessage = {
    id: nextMessageId(),
    role: "assistant",
    content: "",
    timestamp: Date.now(),
  };
  _assistantMessageId = assistantMessage.id;

  return {
    session: {
      ...session,
      messages: [...session.messages, assistantMessage],
    },
    assistantMessageId: assistantMessage.id,
  };
}

function appendAssistantDelta(state: TerminalStore, delta: string): ChatSession {
  const { session, assistantMessageId } = ensureAssistantMessage(state);

  return {
    ...session,
    messages: session.messages.map((message) => {
      if (message.id !== assistantMessageId) {
        return message;
      }
      return {
        ...message,
        content: `${message.content}${delta}`,
      };
    }),
  };
}

function finalizeAssistantText(state: TerminalStore, text: string): ChatSession | null {
  if (!text.trim()) {
    return state.activeSession;
  }

  const { session, assistantMessageId } = ensureAssistantMessage(state);

  return {
    ...session,
    messages: session.messages.map((message) => {
      if (message.id !== assistantMessageId) {
        return message;
      }
      if (message.content.trim().length > 0) {
        return message;
      }
      return {
        ...message,
        content: text,
      };
    }),
  };
}

function initializeChatRuntime(
  set: (next: Partial<TerminalStore> | ((state: TerminalStore) => Partial<TerminalStore>)) => void,
  get: () => TerminalStore
): void {
  if (_chatRuntimeInitialized) {
    return;
  }

  const client = getPiRpcClient();
  _chatRuntimeInitialized = true;

  _chatUnsubscribe = client.onEvent((event: PiRpcEvent) => {
    const eventType = asString(event.type) ?? "";

    if (eventType === "pi_process_started") {
      set({
        chatConnected: true,
        chatError: null,
      });
      return;
    }

    if (eventType === "pi_process_stopped") {
      _assistantMessageId = null;
      set({
        chatConnected: false,
        chatStreaming: false,
        chatActiveTool: null,
        chatStatus: null,
        chatError: asString(event.error) ?? "pi RPC process stopped",
      });
      return;
    }

    if (eventType === "agent_start") {
      set((state) => {
        const { session } = ensureAssistantMessage(state);
        return {
          activeSession: session,
          chatStreaming: true,
          chatActiveTool: null,
          chatStatus: "Agent running",
          viewMode: "chat",
        };
      });
      return;
    }

    if (eventType === "message_update") {
      const assistantMessageEvent = isRecord(event.assistantMessageEvent)
        ? event.assistantMessageEvent
        : null;
      if (!assistantMessageEvent) {
        return;
      }

      if (assistantMessageEvent.type !== "text_delta") {
        return;
      }

      const delta = asString(assistantMessageEvent.delta);
      if (!delta) {
        return;
      }

      set((state) => {
        const session = appendAssistantDelta(state, delta);
        return {
          activeSession: session,
        };
      });
      return;
    }

    if (eventType === "message_end") {
      const text = extractAssistantText(event.message);
      if (!text) {
        return;
      }

      set((state) => {
        const session = finalizeAssistantText(state, text);
        return {
          activeSession: session,
        };
      });
      return;
    }

    if (eventType === "tool_execution_start") {
      set({
        chatActiveTool: asString(event.toolName) ?? "tool",
      });
      return;
    }

    if (eventType === "tool_execution_end") {
      set({
        chatActiveTool: null,
      });
      return;
    }

    if (eventType === "agent_end") {
      _assistantMessageId = null;
      set({
        chatStreaming: false,
        chatActiveTool: null,
        chatStatus: null,
      });
      return;
    }

    if (eventType === "extension_error") {
      set({
        chatError: asString(event.error) ?? "pi extension error",
      });
      return;
    }

    if (eventType === "extension_ui_request") {
      const method = asString(event.method) ?? "";

      if (method === "setStatus") {
        set({ chatStatus: asString(event.statusText) });
        return;
      }

      if (method === "setWidget") {
        set({ chatWidgetLines: asStringArray(event.widgetLines) });
        return;
      }

      if (method === "notify") {
        const message = asString(event.message);
        if (!message) {
          return;
        }
        const notifyType = asString(event.notifyType) ?? "info";
        if (notifyType === "error") {
          set({ chatError: message });
        } else {
          set({ chatStatus: message });
        }
      }
    }
  });

  void client.start().catch((error) => {
    _chatRuntimeInitialized = false;
    if (_chatUnsubscribe) {
      _chatUnsubscribe();
      _chatUnsubscribe = null;
    }

    set({
      chatConnected: false,
      chatError: error instanceof Error ? error.message : String(error),
      chatStreaming: false,
      chatActiveTool: null,
      chatStatus: null,
    });
  });

  // Touch get() to keep function used and satisfy future evolution hooks.
  get();
}

function listLengthForScreen(state: TerminalStore): number {
  switch (state.screen) {
    case "strategies":
      return state.strategies.length;
    case "positions":
      return state.positions.length;
    case "research":
      return state.research.length;
    default:
      return 0;
  }
}

/** Build a symbol→BrokerPosition lookup from the broker positions array. */
function buildPositionMap(
  positions: BrokerPosition[]
): Map<string, BrokerPosition> {
  const map = new Map<string, BrokerPosition>();
  for (const p of positions) {
    map.set(p.symbol.toUpperCase(), p);
  }
  return map;
}

/** Merge raw markdown positions with live broker data. */
function mergePositions(state: TerminalStore): {
  positions: PositionEntry[];
  totalValue: number;
} {
  const rawPositions = loadPositions();
  const brokerMap = buildPositionMap(state.brokerPositions);
  let totalValue = 0;

  const positions: PositionEntry[] = rawPositions.map((raw) => {
    const bp = brokerMap.get(raw.symbol.toUpperCase());
    const isOpen = bp != null && bp.qty > 0;
    const marketValue = bp?.marketValue ?? 0;
    totalValue += marketValue;

    return {
      ...raw,
      status: isOpen ? "open" : "closed",
      qty: bp?.qty ?? 0,
      avgCost: bp?.avgCost ?? 0,
      marketValue,
      unrealizedPnl: bp?.unrealizedPnl ?? null,
      marketPrice: bp?.marketPrice ?? null,
    };
  });

  return { positions, totalValue };
}

/** Merge raw markdown strategies with live broker data. */
function mergeStrategies(brokerPositions: BrokerPosition[]): {
  strategies: StrategyEntry[];
  dayGL: number;
  totalGL: number;
} {
  const rawStrategies = loadStrategies();
  const brokerMap = buildPositionMap(brokerPositions);
  let dayGL = 0;
  let totalGL = 0;

  const strategies: StrategyEntry[] = rawStrategies.map((raw) => {
    let dayGainLoss = 0;
    let totalGainLoss = 0;
    let positionCount = 0;

    for (const sym of raw.positions) {
      const bp = brokerMap.get(sym.toUpperCase());
      if (bp && bp.qty > 0) {
        positionCount++;
        dayGainLoss += bp.unrealizedPnl ?? 0;
        totalGainLoss += bp.unrealizedPnl ?? 0;
      }
    }

    dayGL += dayGainLoss;
    totalGL += totalGainLoss;

    return {
      ...raw,
      dayGainLoss,
      totalGainLoss,
      positionCount,
    };
  });

  return { strategies, dayGL, totalGL };
}

export const store = createStore<TerminalStore>()((set, get) => ({
  // ── Data ──────────────────────────────────────────────────────
  strategies: [],
  positions: [],
  research: [],
  portfolioDayGainLoss: 0,
  portfolioTotalGainLoss: 0,
  portfolioTotalValue: 0,

  loadAll() {
    const state = get();
    const research = loadResearch();

    const { positions, totalValue } = mergePositions(state);
    const { strategies, dayGL, totalGL } = mergeStrategies(
      state.brokerPositions
    );

    // Use broker balance for total value when available, else sum of position market values
    const portfolioTotalValue =
      state.brokerBalance?.netLiquidation ?? totalValue;

    set({
      strategies,
      positions,
      research,
      portfolioDayGainLoss: dayGL,
      portfolioTotalGainLoss: totalGL,
      portfolioTotalValue,
    });
  },

  // ── Navigation ────────────────────────────────────────────────
  screen: "command",
  viewMode: "list",
  selectedIndex: 0,
  scrollOffset: 0,

  setScreen(screen) {
    set({
      screen,
      viewMode: "list",
      selectedIndex: 0,
      scrollOffset: 0,
      chatFocused: screen === "command",
    });
  },

  moveSelection(delta) {
    const state = get();
    const len = listLengthForScreen(state);
    if (len === 0) {
      return;
    }
    const next = Math.max(0, Math.min(len - 1, state.selectedIndex + delta));
    set({ selectedIndex: next });
  },

  openDetail() {
    const state = get();
    if (state.screen === "command") {
      return;
    }
    const len = listLengthForScreen(state);
    if (len === 0) {
      return;
    }
    set({ viewMode: "detail", scrollOffset: 0 });
  },

  goBack() {
    const state = get();
    if (state.viewMode === "chat") {
      set({
        viewMode: "list",
        chatFocused: state.screen === "command",
        chatInput: "",
      });
      return;
    }
    if (state.viewMode === "detail") {
      set({ viewMode: "list", scrollOffset: 0 });
      return;
    }
  },

  cycleTab() {
    const state = get();
    const idx = screens.indexOf(state.screen);
    const next = screens[(idx + 1) % screens.length];
    set({
      screen: next,
      viewMode: "list",
      selectedIndex: 0,
      scrollOffset: 0,
      chatFocused: next === "command",
      chatInput: "",
    });
  },

  scroll(delta) {
    set((s) => ({ scrollOffset: Math.max(0, s.scrollOffset + delta) }));
  },

  // ── Chat ──────────────────────────────────────────────────────
  activeSession: null,
  chatInput: "",
  chatFocused: true,
  chatConnected: false,
  chatStreaming: false,
  chatError: null,
  chatStatus: null,
  chatWidgetLines: [],
  chatActiveTool: null,

  setChatInput(value) {
    set({ chatInput: value });
  },

  focusChat() {
    set({ chatFocused: true });
  },

  blurChat() {
    set({ chatFocused: false });
  },

  submitChat() {
    const state = get();
    const text = state.chatInput.trim();
    if (!text) {
      return;
    }

    initializeChatRuntime(set, get);

    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const session = state.activeSession ?? createSession(state.screen);

    set({
      activeSession: {
        ...session,
        messages: [...session.messages, userMessage],
      },
      chatInput: "",
      chatFocused: false,
      chatError: null,
      viewMode: "chat",
    });

    const streamingBehavior: PiStreamingBehavior | undefined = state.chatStreaming
      ? "followUp"
      : undefined;

    void getPiRpcClient()
      .prompt(text, streamingBehavior)
      .catch((error) => {
        set({
          chatError:
            error instanceof Error
              ? `Failed to send prompt to pi: ${error.message}`
              : "Failed to send prompt to pi",
          chatStreaming: false,
          chatActiveTool: null,
          chatStatus: null,
        });
      });
  },

  exitChat() {
    const state = get();
    set({
      viewMode: "list",
      activeSession: null,
      chatFocused: state.screen === "command",
      chatInput: "",
      chatError: null,
      chatStatus: null,
      chatWidgetLines: [],
      chatActiveTool: null,
      chatStreaming: false,
    });
  },

  // ── Connection ────────────────────────────────────────────────
  connected: false,
  error: null,
  lastPing: null,
  brokerPositions: [],
  brokerBalance: null,
  brokerOrders: [],

  async fetchBrokerData() {
    try {
      const { getBrokerClient } = await import("../lib/broker.js");
      const client = await getBrokerClient();

      const [posRes, balRes, ordRes] = await Promise.allSettled([
        client.positions(),
        client.balance(),
        client.orders("all"),
      ]);

      const brokerPositions: BrokerPosition[] =
        posRes.status === "fulfilled"
          ? posRes.value.positions.map((p) => ({
              symbol: p.symbol,
              qty: p.qty,
              avgCost: p.avg_cost,
              marketPrice: p.market_price,
              marketValue: p.market_value,
              unrealizedPnl: p.unrealized_pnl,
              realizedPnl: p.realized_pnl,
            }))
          : [];

      const brokerBalance =
        balRes.status === "fulfilled"
          ? {
              netLiquidation: balRes.value.balance.net_liquidation,
              cash: balRes.value.balance.cash,
            }
          : null;

      const brokerOrders: BrokerOrder[] =
        ordRes.status === "fulfilled"
          ? ordRes.value.orders.map((o) => ({
              clientOrderId: (o.client_order_id as string) ?? "",
              symbol: (o.symbol as string) ?? "",
              status: (o.status as string) ?? "",
              side: (o.side as string) ?? "",
              qty: (o.qty as number) ?? 0,
              filledAt: (o.filled_at as string) ?? null,
            }))
          : [];

      set({
        brokerPositions,
        brokerBalance,
        brokerOrders,
        connected: true,
        error: null,
        lastPing: Date.now(),
      });
    } catch {
      set({
        connected: false,
        brokerPositions: [],
        brokerBalance: null,
        brokerOrders: [],
      });
    }
  },
}));

export function useTerminal(): TerminalStore;
export function useTerminal<T>(selector: (s: TerminalStore) => T): T;
export function useTerminal<T>(selector?: (s: TerminalStore) => T) {
  // biome-ignore lint/style/noNonNullAssertion: overloaded selector pattern requires assertion
  return useStore(store, selector!);
}

export type { TerminalStore } from "./types.js";
