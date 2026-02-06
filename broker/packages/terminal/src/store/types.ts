/**
 * Central state shape for the terminal TUI.
 *
 * Zustand slices are composed into a single store. Each slice manages
 * one domain (portfolio, orders, risk, agents, events, UI).
 */

import type {
  Position,
  Balance,
  PnLSummary,
  OrderRecord,
  FillRecord,
  RiskConfigSnapshot,
  RiskOverride,
  DaemonStatusResponse,
  ExposureEntry,
} from "@northbrook/broker-sdk-typescript";
import type { ScreenName } from "../lib/keymap.js";

// ── Portfolio ──────────────────────────────────────────────────────

export interface PortfolioSlice {
  positions: Position[];
  balance: Balance | null;
  pnl: PnLSummary | null;
  exposure: ExposureEntry[];
  lastUpdated: number | null;

  fetchPositions(): Promise<void>;
  fetchBalance(): Promise<void>;
  fetchPnl(): Promise<void>;
  fetchExposure(): Promise<void>;
  fetchAll(): Promise<void>;
}

// ── Orders ─────────────────────────────────────────────────────────

export interface OrdersSlice {
  orders: OrderRecord[];
  fills: FillRecord[];
  selectedOrderId: string | null;
  lastUpdated: number | null;

  fetchOrders(): Promise<void>;
  fetchFills(): Promise<void>;
  selectOrder(id: string | null): void;
}

// ── Risk ───────────────────────────────────────────────────────────

export interface RiskSlice {
  limits: RiskConfigSnapshot | null;
  overrides: RiskOverride[];
  halted: boolean;
  lastUpdated: number | null;

  fetchLimits(): Promise<void>;
  halt(): Promise<void>;
  resume(): Promise<void>;
}

// ── Agents ─────────────────────────────────────────────────────────

export interface AgentInfo {
  name: string;
  role: "manager" | "trader" | "analyst";
  status: "online" | "offline" | "degraded";
  lastHeartbeat: number | null;
  latencyMs: number | null;
  taskDescription: string | null;
}

export interface AgentsSlice {
  agents: AgentInfo[];
  registerAgent(agent: AgentInfo): void;
  updateAgent(name: string, patch: Partial<AgentInfo>): void;
  removeAgent(name: string): void;
}

// ── Event log ──────────────────────────────────────────────────────

export interface EventEntry {
  id: number;
  timestamp: number;
  topic: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface EventsSlice {
  events: EventEntry[];
  maxEvents: number;
  pushEvent(topic: string, summary: string, data: Record<string, unknown>): void;
  clearEvents(): void;
}

// ── Connection ─────────────────────────────────────────────────────

export interface ConnectionSlice {
  daemon: DaemonStatusResponse | null;
  connected: boolean;
  error: string | null;
  lastPing: number | null;

  fetchStatus(): Promise<void>;
  ping(): Promise<void>;
}

// ── UI ─────────────────────────────────────────────────────────────

export interface UISlice {
  screen: ScreenName;
  focusedPanel: number;
  panelCount: number;
  showHelp: boolean;
  showCommandPalette: boolean;
  modalContent: string | null;
  toasts: ToastEntry[];

  setScreen(screen: ScreenName): void;
  cycleFocus(): void;
  setFocus(index: number): void;
  toggleHelp(): void;
  toggleCommandPalette(): void;
  showModal(content: string): void;
  closeModal(): void;
  addToast(toast: Omit<ToastEntry, "id" | "timestamp">): void;
  dismissToast(id: number): void;
}

export interface ToastEntry {
  id: number;
  timestamp: number;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

// ── Combined store ─────────────────────────────────────────────────

export type TerminalStore = PortfolioSlice &
  OrdersSlice &
  RiskSlice &
  AgentsSlice &
  EventsSlice &
  ConnectionSlice &
  UISlice;
