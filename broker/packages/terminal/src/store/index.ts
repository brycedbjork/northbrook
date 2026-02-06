/**
 * Zustand store — single source of truth for the entire TUI.
 *
 * Each domain slice is defined inline for co-location. The store
 * is consumed via React hooks in components.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { getBrokerClient } from "../lib/broker.js";
import type { TerminalStore, EventEntry, AgentInfo, ToastEntry } from "./types.js";

let _eventId = 0;
let _toastId = 0;

export const store = createStore<TerminalStore>()((set, get) => ({
  // ── Portfolio ──────────────────────────────────────────────────
  positions: [],
  balance: null,
  pnl: null,
  exposure: [],
  lastUpdated: null,

  async fetchPositions() {
    const client = await getBrokerClient();
    const res = await client.positions();
    set({ positions: res.positions });
  },
  async fetchBalance() {
    const client = await getBrokerClient();
    const res = await client.balance();
    set({ balance: res.balance });
  },
  async fetchPnl() {
    const client = await getBrokerClient();
    const res = await client.pnl();
    set({ pnl: res.pnl });
  },
  async fetchExposure() {
    const client = await getBrokerClient();
    const res = await client.exposure();
    set({ exposure: res.exposure });
  },
  async fetchAll() {
    const s = get();
    await Promise.allSettled([
      s.fetchPositions(),
      s.fetchBalance(),
      s.fetchPnl(),
      s.fetchExposure(),
      s.fetchOrders(),
      s.fetchFills(),
      s.fetchLimits(),
      s.fetchStatus(),
    ]);
    set({ lastUpdated: Date.now() });
  },

  // ── Orders ─────────────────────────────────────────────────────
  orders: [],
  fills: [],
  selectedOrderId: null,

  async fetchOrders() {
    const client = await getBrokerClient();
    const res = await client.orders("all");
    set({
      orders: res.orders as TerminalStore["orders"],
      lastUpdated: Date.now(),
    });
  },
  async fetchFills() {
    const client = await getBrokerClient();
    const res = await client.fills();
    set({ fills: res.fills });
  },
  selectOrder(id) {
    set({ selectedOrderId: id });
  },

  // ── Risk ───────────────────────────────────────────────────────
  limits: null,
  overrides: [],
  halted: false,

  async fetchLimits() {
    const client = await getBrokerClient();
    const res = await client.riskLimits();
    set({
      limits: res.limits,
      halted: res.limits.halted,
      lastUpdated: Date.now(),
    });
  },
  async halt() {
    const client = await getBrokerClient();
    await client.riskHalt();
    set({ halted: true });
    get().addToast({ level: "warning", message: "Trading halted" });
  },
  async resume() {
    const client = await getBrokerClient();
    await client.riskResume();
    set({ halted: false });
    get().addToast({ level: "success", message: "Trading resumed" });
  },

  // ── Agents ─────────────────────────────────────────────────────
  agents: [],

  registerAgent(agent: AgentInfo) {
    set((s) => ({ agents: [...s.agents, agent] }));
  },
  updateAgent(name: string, patch: Partial<AgentInfo>) {
    set((s) => ({
      agents: s.agents.map((a) => (a.name === name ? { ...a, ...patch } : a)),
    }));
  },
  removeAgent(name: string) {
    set((s) => ({ agents: s.agents.filter((a) => a.name !== name) }));
  },

  // ── Events ─────────────────────────────────────────────────────
  events: [],
  maxEvents: 200,

  pushEvent(topic: string, summary: string, data: Record<string, unknown>) {
    const entry: EventEntry = {
      id: ++_eventId,
      timestamp: Date.now(),
      topic,
      summary,
      data,
    };
    set((s) => ({
      events: [entry, ...s.events].slice(0, s.maxEvents),
    }));
  },
  clearEvents() {
    set({ events: [] });
  },

  // ── Connection ─────────────────────────────────────────────────
  daemon: null,
  connected: false,
  error: null,
  lastPing: null,

  async fetchStatus() {
    try {
      const client = await getBrokerClient();
      const res = await client.daemonStatus();
      set({
        daemon: res,
        connected: true,
        error: null,
        lastPing: Date.now(),
      });
    } catch (err) {
      set({
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
  async ping() {
    try {
      const client = await getBrokerClient();
      const res = await client.heartbeat();
      set({ connected: res.connected, lastPing: Date.now() });
    } catch {
      set({ connected: false });
    }
  },

  // ── UI ─────────────────────────────────────────────────────────
  screen: "dashboard",
  focusedPanel: 0,
  panelCount: 4,
  showHelp: false,
  showCommandPalette: false,
  modalContent: null,
  toasts: [],

  setScreen(screen) {
    set({ screen, focusedPanel: 0 });
  },
  cycleFocus() {
    set((s) => ({ focusedPanel: (s.focusedPanel + 1) % s.panelCount }));
  },
  setFocus(index) {
    set({ focusedPanel: index });
  },
  toggleHelp() {
    set((s) => ({ showHelp: !s.showHelp }));
  },
  toggleCommandPalette() {
    set((s) => ({ showCommandPalette: !s.showCommandPalette }));
  },
  showModal(content) {
    set({ modalContent: content });
  },
  closeModal() {
    set({ modalContent: null });
  },
  addToast(toast: Omit<ToastEntry, "id" | "timestamp">) {
    const entry: ToastEntry = { ...toast, id: ++_toastId, timestamp: Date.now() };
    set((s) => ({ toasts: [...s.toasts, entry] }));
    // Auto-dismiss after 5 seconds
    setTimeout(() => get().dismissToast(entry.id), 5000);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** React hook to select state from the store. */
export function useTerminal(): TerminalStore;
export function useTerminal<T>(selector: (s: TerminalStore) => T): T;
export function useTerminal<T>(selector?: (s: TerminalStore) => T) {
  return useStore(store, selector!);
}

export type { TerminalStore } from "./types.js";
