import type { JsonValue } from "./types.js";
import type {
  AgentHeartbeatResponse,
  AgentTopic,
  AuditSource,
  AuditCommandsResponse,
  AuditExportResponse,
  AuditTable,
  AuditOrdersResponse,
  AuditRiskResponse,
  BarSize,
  DaemonStatusResponse,
  DaemonStopResponse,
  ExposureGroupBy,
  FillsListResponse,
  HistoryPeriod,
  MarketHistoryResponse,
  OptionType,
  OptionChainResponse,
  OrderBracketResponse,
  OrderCancelResponse,
  OrderSide,
  OrderPlaceResponse,
  OrderStatusFilter,
  OrderStatusResponse,
  OrdersCancelAllResponse,
  OrdersListResponse,
  PortfolioBalanceResponse,
  PortfolioExposureResponse,
  PortfolioPnLResponse,
  PortfolioPositionsResponse,
  QuoteSnapshotResponse,
  RiskParam,
  RiskCheckResult,
  RiskHaltResponse,
  RiskLimitsResponse,
  RiskOverrideResponse,
  RiskResumeResponse,
  TimeInForce,
  RiskSetResponse
} from "./sdk-types.js";

export interface CommandSpec<Params, Result> {
  params: Params;
  result: Result;
}

export interface CommandMap {
  "daemon.status": CommandSpec<Record<string, never>, DaemonStatusResponse>;
  "daemon.stop": CommandSpec<Record<string, never>, DaemonStopResponse>;
  "quote.snapshot": CommandSpec<{ symbols: string[]; force?: boolean }, QuoteSnapshotResponse>;
  "market.history": CommandSpec<
    {
      symbol: string;
      period: HistoryPeriod;
      bar: BarSize;
      rth_only?: boolean;
    },
    MarketHistoryResponse
  >;
  "market.chain": CommandSpec<
    {
      symbol: string;
      expiry?: string;
      strike_range?: string;
      type?: OptionType;
    },
    OptionChainResponse
  >;
  "portfolio.positions": CommandSpec<{ symbol?: string }, PortfolioPositionsResponse>;
  "portfolio.balance": CommandSpec<Record<string, never>, PortfolioBalanceResponse>;
  "portfolio.pnl": CommandSpec<Record<string, never>, PortfolioPnLResponse>;
  "portfolio.exposure": CommandSpec<{ by?: ExposureGroupBy }, PortfolioExposureResponse>;
  "order.place": CommandSpec<
    {
      side: OrderSide;
      symbol: string;
      qty: number;
      tif?: TimeInForce;
      limit?: number;
      stop?: number;
      client_order_id?: string;
    },
    OrderPlaceResponse
  >;
  "order.bracket": CommandSpec<
    {
      side: OrderSide;
      symbol: string;
      qty: number;
      entry: number;
      tp: number;
      sl: number;
      tif?: TimeInForce;
    },
    OrderBracketResponse
  >;
  "order.status": CommandSpec<{ order_id: string }, OrderStatusResponse>;
  "orders.list": CommandSpec<{ status?: OrderStatusFilter; since?: string }, OrdersListResponse>;
  "order.cancel": CommandSpec<{ order_id: string }, OrderCancelResponse>;
  "orders.cancel_all": CommandSpec<{ confirm?: boolean; json_mode?: boolean }, OrdersCancelAllResponse>;
  "fills.list": CommandSpec<{ since?: string; symbol?: string }, FillsListResponse>;
  "risk.check": CommandSpec<
    {
      side: OrderSide;
      symbol: string;
      qty: number;
      tif?: TimeInForce;
      limit?: number;
      stop?: number;
    },
    RiskCheckResult
  >;
  "risk.limits": CommandSpec<Record<string, never>, RiskLimitsResponse>;
  "risk.set": CommandSpec<{ param: RiskParam; value: JsonValue }, RiskSetResponse>;
  "risk.halt": CommandSpec<Record<string, never>, RiskHaltResponse>;
  "risk.resume": CommandSpec<Record<string, never>, RiskResumeResponse>;
  "risk.override": CommandSpec<
    {
      param: RiskParam;
      value: JsonValue;
      duration: string;
      reason: string;
    },
    RiskOverrideResponse
  >;
  "agent.heartbeat": CommandSpec<{ sent_at?: number }, AgentHeartbeatResponse>;
  "audit.commands": CommandSpec<{ source?: AuditSource; since?: string }, AuditCommandsResponse>;
  "audit.orders": CommandSpec<{ status?: OrderStatusFilter; since?: string }, AuditOrdersResponse>;
  "audit.risk": CommandSpec<{ type?: string }, AuditRiskResponse>;
  "audit.export": CommandSpec<
    {
      output: string;
      table?: AuditTable;
      format?: "csv";
      since?: string;
      status?: OrderStatusFilter;
      source?: AuditSource;
      type?: string;
    },
    AuditExportResponse
  >;
  "agent.subscribe": CommandSpec<{ topics: AgentTopic[] }, { subscribed: string[] }>;
}

export type CommandName = keyof CommandMap;
export type CommandParams<C extends CommandName> = CommandMap[C]["params"];
export type CommandResult<C extends CommandName> = CommandMap[C]["result"];
