import net from "node:net";

import { loadConfig } from "./config.js";
import { ErrorCode, BrokerError } from "./errors.js";
import {
  FramedReader,
  decodeEvent,
  decodeResponse,
  encodeRequest,
  makeRequest,
  unwrapResponse
} from "./protocol.js";
import type { CommandName, CommandParams, CommandResult } from "./commands.js";
import type {
  AppConfig,
  EventEnvelope,
  JsonValue
} from "./types.js";
import type {
  AgentTopic,
  AgentHeartbeatResponse,
  AuditSource,
  AuditTable,
  AuditCommandsResponse,
  AuditExportResponse,
  AuditOrdersResponse,
  AuditRiskResponse,
  BarSize,
  BracketInput,
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
  OrderInput,
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
  RiskCheckInput,
  RiskCheckResult,
  RiskHaltResponse,
  RiskLimitsResponse,
  RiskParam,
  RiskOverrideResponse,
  RiskResumeResponse,
  RiskSetResponse
} from "./sdk-types.js";

export interface ClientOptions {
  socketPath?: string;
  timeoutMs?: number;
  source?: string;
}

export class Client {
  private readonly socketPath: string;
  private readonly timeoutMs: number;
  private readonly source: string;

  constructor(opts: { socketPath: string; timeoutMs: number; source?: string }) {
    this.socketPath = opts.socketPath;
    this.timeoutMs = opts.timeoutMs;
    this.source = opts.source ?? "ts_sdk";
  }

  static async fromConfig(options: ClientOptions = {}): Promise<Client> {
    const cfg = await loadConfig();
    return new Client({
      socketPath: options.socketPath ?? cfg.runtime.socket_path,
      timeoutMs: options.timeoutMs ?? cfg.runtime.request_timeout_seconds * 1000,
      source: options.source
    });
  }

  async request<C extends CommandName>(
    command: C,
    params: CommandParams<C>,
    source?: string
  ): Promise<CommandResult<C>> {
    const socket = await this.openSocket();
    const reader = new FramedReader(socket);
    const req = makeRequest(
      command,
      compactParams(params) as unknown as Record<string, JsonValue>,
      false,
      source ?? this.source
    );

    socket.write(encodeRequest(req));

    try {
      const frame = await reader.nextFrame(this.timeoutMs);
      const response = decodeResponse(frame);
      return unwrapResponse<CommandResult<C>>(response);
    } finally {
      socket.end();
      socket.destroy();
    }
  }

  async *subscribe(topics: AgentTopic[]): AsyncGenerator<EventEnvelope, void, unknown> {
    const socket = await this.openSocket();
    const reader = new FramedReader(socket);
    const req = makeRequest("agent.subscribe", { topics }, true, this.source);

    socket.write(encodeRequest(req));

    const first = decodeResponse(await reader.nextFrame(this.timeoutMs));
    unwrapResponse<CommandResult<"agent.subscribe">>(first);

    try {
      while (true) {
        const frame = await reader.nextFrame();
        yield decodeEvent(frame);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("socket ended") || error.message.includes("socket closed"))
      ) {
        return;
      }
      throw error;
    } finally {
      socket.end();
      socket.destroy();
    }
  }

  async daemonStatus(): Promise<DaemonStatusResponse> {
    return this.request("daemon.status", {});
  }

  async daemonStop(): Promise<DaemonStopResponse> {
    return this.request("daemon.stop", {});
  }

  async quote(...symbols: string[]): Promise<QuoteSnapshotResponse> {
    return this.request("quote.snapshot", { symbols });
  }

  async history(symbol: string, period: HistoryPeriod, bar: BarSize, rthOnly = false): Promise<MarketHistoryResponse> {
    return this.request("market.history", {
      symbol,
      period,
      bar,
      rth_only: rthOnly
    });
  }

  async chain(symbol: string, expiry?: string, strikeRange?: string, optionType?: OptionType): Promise<OptionChainResponse> {
    const params: CommandParams<"market.chain"> = { symbol };
    if (expiry) {
      params.expiry = expiry;
    }
    if (strikeRange) {
      params.strike_range = strikeRange;
    }
    if (optionType) {
      params.type = optionType;
    }
    return this.request("market.chain", params);
  }

  async positions(symbol?: string): Promise<PortfolioPositionsResponse> {
    return this.request("portfolio.positions", symbol ? { symbol } : {});
  }

  async pnl(): Promise<PortfolioPnLResponse> {
    return this.request("portfolio.pnl", {});
  }

  async balance(): Promise<PortfolioBalanceResponse> {
    return this.request("portfolio.balance", {});
  }

  async exposure(by: ExposureGroupBy = "symbol"): Promise<PortfolioExposureResponse> {
    return this.request("portfolio.exposure", { by });
  }

  async order(input: OrderInput): Promise<OrderPlaceResponse> {
    const params: CommandParams<"order.place"> = {
      side: input.side,
      symbol: input.symbol,
      qty: input.qty,
      tif: input.tif ?? "DAY"
    };
    if (input.limit !== undefined) {
      params.limit = input.limit;
    }
    if (input.stop !== undefined) {
      params.stop = input.stop;
    }
    if (input.client_order_id) {
      params.client_order_id = input.client_order_id;
    }
    return this.request("order.place", params);
  }

  async bracket(input: BracketInput): Promise<OrderBracketResponse> {
    return this.request("order.bracket", {
      side: input.side,
      symbol: input.symbol,
      qty: input.qty,
      entry: input.entry,
      tp: input.tp,
      sl: input.sl,
      tif: input.tif ?? "DAY"
    });
  }

  async orderStatus(orderId: string): Promise<OrderStatusResponse> {
    return this.request("order.status", { order_id: orderId });
  }

  async orders(status: OrderStatusFilter = "all", since?: string): Promise<OrdersListResponse> {
    const params: CommandParams<"orders.list"> = { status };
    if (since) {
      params.since = since;
    }
    return this.request("orders.list", params);
  }

  async cancel(orderId: string): Promise<OrderCancelResponse> {
    return this.request("order.cancel", { order_id: orderId });
  }

  async cancelAll(confirm = true, jsonMode = true): Promise<OrdersCancelAllResponse> {
    return this.request("orders.cancel_all", { confirm, json_mode: jsonMode });
  }

  async fills(since?: string, symbol?: string): Promise<FillsListResponse> {
    const params: CommandParams<"fills.list"> = {};
    if (since) {
      params.since = since;
    }
    if (symbol) {
      params.symbol = symbol;
    }
    return this.request("fills.list", params);
  }

  async riskCheck(input: RiskCheckInput): Promise<RiskCheckResult> {
    const params: CommandParams<"risk.check"> = {
      side: input.side,
      symbol: input.symbol,
      qty: input.qty,
      tif: input.tif ?? "DAY"
    };
    if (input.limit !== undefined) {
      params.limit = input.limit;
    }
    if (input.stop !== undefined) {
      params.stop = input.stop;
    }
    return this.request("risk.check", params);
  }

  async riskLimits(): Promise<RiskLimitsResponse> {
    return this.request("risk.limits", {});
  }

  async riskSet(param: RiskParam, value: JsonValue): Promise<RiskSetResponse> {
    return this.request("risk.set", { param, value });
  }

  async riskHalt(): Promise<RiskHaltResponse> {
    return this.request("risk.halt", {});
  }

  async riskResume(): Promise<RiskResumeResponse> {
    return this.request("risk.resume", {});
  }

  async riskOverride(input: {
    param: RiskParam;
    value: JsonValue;
    duration: string;
    reason: string;
  }): Promise<RiskOverrideResponse> {
    return this.request("risk.override", {
      param: input.param,
      value: input.value,
      duration: input.duration,
      reason: input.reason
    });
  }

  async heartbeat(sentAt?: number): Promise<AgentHeartbeatResponse> {
    return this.request("agent.heartbeat", {
      sent_at: sentAt ?? Date.now() / 1000
    });
  }

  async auditCommands(source?: AuditSource, since?: string): Promise<AuditCommandsResponse> {
    const params: CommandParams<"audit.commands"> = {};
    if (source) {
      params.source = source;
    }
    if (since) {
      params.since = since;
    }
    return this.request("audit.commands", params);
  }

  async auditOrders(status?: OrderStatusFilter, since?: string): Promise<AuditOrdersResponse> {
    const params: CommandParams<"audit.orders"> = {};
    if (status) {
      params.status = status;
    }
    if (since) {
      params.since = since;
    }
    return this.request("audit.orders", params);
  }

  async auditRisk(type?: string): Promise<AuditRiskResponse> {
    const params: CommandParams<"audit.risk"> = {};
    if (type) {
      params.type = type;
    }
    return this.request("audit.risk", params);
  }

  async auditExport(input: {
    output: string;
    table?: AuditTable;
    format?: "csv";
    since?: string;
    status?: OrderStatusFilter;
    source?: AuditSource;
    type?: string;
  }): Promise<AuditExportResponse> {
    return this.request("audit.export", {
      output: input.output,
      table: input.table ?? "orders",
      format: input.format ?? "csv",
      since: input.since,
      status: input.status,
      source: input.source,
      type: input.type
    });
  }

  private async openSocket(): Promise<net.Socket> {
    return new Promise<net.Socket>((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      socket.once("connect", () => resolve(socket));
      socket.once("error", (error) => {
        const suggestion = "Start the daemon with `broker daemon start`.";
        reject(
          new BrokerError(
            ErrorCode.DAEMON_NOT_RUNNING,
            `unable to connect to daemon socket ${this.socketPath}: ${error.message}`,
            { socket_path: this.socketPath },
            suggestion
          )
        );
      });
    });
  }
}

export async function buildClient(options: ClientOptions = {}): Promise<Client> {
  return Client.fromConfig(options);
}

export async function loadClientConfig(): Promise<AppConfig> {
  return loadConfig();
}

function compactParams<T extends Record<string, unknown>>(input: T): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    out[key] = value as JsonValue;
  }
  return out;
}
