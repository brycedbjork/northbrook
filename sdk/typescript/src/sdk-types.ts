import type { JsonValue } from "./types.js";

export const ORDER_SIDES = ["buy", "sell"] as const;
export const TIME_IN_FORCE_VALUES = ["DAY", "GTC", "IOC"] as const;
export const HISTORY_PERIODS = ["1d", "5d", "30d", "90d", "1y"] as const;
export const BAR_SIZES = ["1m", "5m", "15m", "1h", "1d"] as const;
export const OPTION_TYPES = ["call", "put"] as const;
export const ORDER_STATUS_FILTERS = ["active", "filled", "cancelled", "all"] as const;
export const EXPOSURE_GROUPS = ["sector", "asset_class", "currency", "symbol"] as const;
export const AGENT_TOPICS = ["orders", "fills", "positions", "pnl", "risk", "connection"] as const;
export const AUDIT_TABLES = ["orders", "commands", "risk"] as const;
export const AUDIT_SOURCES = ["cli", "sdk", "agent", "ts_sdk"] as const;
export const RISK_PARAMS = [
  "max_position_pct",
  "max_order_value",
  "max_daily_loss_pct",
  "max_sector_exposure_pct",
  "max_single_name_pct",
  "max_open_orders",
  "order_rate_limit",
  "duplicate_window_seconds",
  "symbol_allowlist",
  "symbol_blocklist"
] as const;

export type OrderSide = (typeof ORDER_SIDES)[number];
export type TimeInForce = (typeof TIME_IN_FORCE_VALUES)[number];
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];
export type BarSize = (typeof BAR_SIZES)[number];
export type OptionType = (typeof OPTION_TYPES)[number];
export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];
export type ExposureGroupBy = (typeof EXPOSURE_GROUPS)[number];
export type AgentTopic = (typeof AGENT_TOPICS)[number];
export type AuditTable = (typeof AUDIT_TABLES)[number];
export type AuditSource = (typeof AUDIT_SOURCES)[number];
export type RiskParam = (typeof RISK_PARAMS)[number];

export interface Quote {
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  timestamp: string;
  exchange: string | null;
  currency: string;
}

export interface Bar {
  symbol: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionChainEntry {
  symbol: string;
  right: "C" | "P";
  strike: number;
  expiry: string;
  bid?: number | null;
  ask?: number | null;
  implied_vol?: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
}

export interface OptionChainResponse {
  symbol: string;
  underlying_price: number | null;
  entries: OptionChainEntry[];
}

export interface Position {
  symbol: string;
  qty: number;
  avg_cost: number;
  market_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  realized_pnl: number | null;
  currency: string;
}

export interface Balance {
  account_id: string | null;
  net_liquidation: number | null;
  cash: number | null;
  buying_power: number | null;
  margin_used: number | null;
  margin_available: number | null;
  currency: string;
}

export interface PnLSummary {
  date: string;
  realized: number;
  unrealized: number;
  total: number;
}

export interface ExposureEntry {
  key: string;
  exposure_value: number;
  exposure_pct: number;
}

export interface OrderRecord {
  client_order_id: string;
  ib_order_id: number | null;
  symbol: string;
  side: OrderSide;
  qty: number;
  order_type: string;
  limit_price: number | null;
  stop_price: number | null;
  tif: TimeInForce;
  status: string;
  submitted_at: string;
  filled_at: string | null;
  fill_price: number | null;
  fill_qty: number;
  commission: number | null;
  risk_check_result: Record<string, JsonValue>;
}

export interface FillRecord {
  fill_id: string;
  client_order_id: string;
  ib_order_id: number | null;
  symbol: string;
  qty: number;
  price: number;
  commission?: number | null;
  timestamp: string;
}

export interface RiskCheckResult {
  ok: boolean;
  reasons: string[];
  details: Record<string, JsonValue>;
  suggestion?: string | null;
}

export interface RiskConfigSnapshot {
  max_position_pct: number;
  max_order_value: number;
  max_daily_loss_pct: number;
  max_sector_exposure_pct: number;
  max_single_name_pct: number;
  max_open_orders: number;
  order_rate_limit: number;
  duplicate_window_seconds: number;
  symbol_allowlist: string[];
  symbol_blocklist: string[];
  halted: boolean;
}

export interface RiskOverride {
  param: string;
  value: number;
  reason: string;
  created_at: string;
  expires_at: string;
}

export interface DaemonStatusResponse {
  uptime_seconds: number;
  connection: {
    connected: boolean;
    host: string;
    port: number;
    client_id: number;
    connected_at: string | null;
    server_version: number | null;
    account_id: string | null;
    last_error: string | null;
  };
  risk_halted: boolean;
  time_sync_delta_ms: number | null;
  socket: string;
}

export interface DaemonStopResponse {
  stopping: boolean;
}

export interface QuoteSnapshotResponse {
  quotes: Quote[];
}

export interface MarketHistoryResponse {
  bars: Bar[];
}

export interface PortfolioPositionsResponse {
  positions: Position[];
}

export interface PortfolioBalanceResponse {
  balance: Balance;
}

export interface PortfolioPnLResponse {
  pnl: PnLSummary;
}

export interface PortfolioExposureResponse {
  exposure: ExposureEntry[];
  by: string;
}

export interface OrderPlaceResponse {
  order: OrderRecord;
}

export interface OrderBracketResponse {
  client_order_id: string;
  ib_order_ids: number[];
  status: string;
}

export interface OrderStatusResponse {
  order: OrderRecord | Record<string, JsonValue>;
}

export interface OrdersListResponse {
  orders: Array<OrderRecord | Record<string, JsonValue>>;
}

export interface OrderCancelResponse {
  client_order_id?: string;
  cancelled: boolean;
  ib_order_id?: number | null;
}

export interface OrdersCancelAllResponse {
  cancelled: boolean;
}

export interface FillsListResponse {
  fills: FillRecord[];
}

export interface RiskLimitsResponse {
  limits: RiskConfigSnapshot;
}

export interface RiskSetResponse {
  limits: RiskConfigSnapshot;
}

export interface RiskHaltResponse {
  halted: boolean;
}

export interface RiskResumeResponse {
  halted: boolean;
}

export interface RiskOverrideResponse {
  override: RiskOverride;
}

export interface AgentHeartbeatResponse {
  ok: boolean;
  latency_ms: number | null;
  connected: boolean;
  halted: boolean;
}

export interface AuditCommandsRow {
  timestamp: string;
  source: string;
  command: string;
  arguments: string;
  result_code: number;
}

export interface AuditOrdersRow {
  id: number;
  client_order_id: string;
  ib_order_id: number | null;
  symbol: string;
  side: string;
  qty: number;
  order_type: string;
  limit_price: number | null;
  stop_price: number | null;
  tif: string;
  status: string;
  submitted_at: string;
  filled_at: string | null;
  fill_price: number | null;
  fill_qty: number | null;
  commission: number | null;
  risk_check_result: string;
}

export interface AuditRiskRow {
  timestamp: string;
  event_type: string;
  details: string;
}

export interface AuditCommandsResponse {
  commands: AuditCommandsRow[];
}

export interface AuditOrdersResponse {
  orders: AuditOrdersRow[];
}

export interface AuditRiskResponse {
  risk_events: AuditRiskRow[];
}

export interface AuditExportResponse {
  output: string;
  rows: number;
}

export interface EventPayload {
  topic: string;
  data: Record<string, JsonValue>;
  request_id?: string | null;
}

export interface OrderInput {
  side: OrderSide;
  symbol: string;
  qty: number;
  limit?: number;
  stop?: number;
  tif?: TimeInForce;
  client_order_id?: string;
}

export interface BracketInput {
  side: OrderSide;
  symbol: string;
  qty: number;
  entry: number;
  tp: number;
  sl: number;
  tif?: TimeInForce;
}

export interface RiskCheckInput {
  side: OrderSide;
  symbol: string;
  qty: number;
  limit?: number;
  stop?: number;
  tif?: TimeInForce;
}
