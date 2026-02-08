const RISK_CHECK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ORDER_QTY = 1_000;
const ENV_MAX_ORDER_QTY = "NORTHBROOK_GUARD_MAX_ORDER_QTY";

type MaybeEvent = {
  toolName?: unknown;
  input?: unknown;
};

type MaybeContext = {
  ui?: {
    notify?: (message: string, type?: "info" | "warning" | "error") => void;
    setStatus?: (key: string, value?: string) => void;
  };
};

type ParsedOrder = {
  side: "buy" | "sell";
  symbol: string;
  qty: number;
};

function parseMaxOrderQty(): number {
  const raw = process.env[ENV_MAX_ORDER_QTY];
  if (!raw) {
    return DEFAULT_MAX_ORDER_QTY;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_ORDER_QTY;
  }
  return parsed;
}

function stripQuotes(token: string): string {
  if (token.length < 2) {
    return token;
  }
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1);
  }
  return token;
}

function tokenizeShellLike(command: string): string[] {
  const tokens = command.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) ?? [];
  return tokens.map((token) => stripQuotes(token));
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function hasFlag(args: string[], flag: string): boolean {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function readFlagValue(args: string[], flag: string): string | null {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag) {
      return args[i + 1] ?? null;
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return null;
}

function normalizeSymbol(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const symbol = value.trim().toUpperCase();
  return symbol.length > 0 ? symbol : null;
}

function normalizeSide(value: string | null): "buy" | "sell" | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "buy" || normalized === "sell") {
    return normalized;
  }
  return null;
}

function extractBrokerArgs(tokens: string[]): string[] | null {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? "";
    const base = token.split("/").pop() ?? token;
    if (base === "broker") {
      return tokens.slice(i + 1);
    }
    if (!isEnvAssignment(token) && !token.startsWith("-") && i > 0 && base !== "broker") {
      // The command already moved past shell env assignments/options without finding broker.
      return null;
    }
  }
  return null;
}

function trimGlobalBrokerOptions(args: string[]): string[] {
  let i = 0;
  while (i < args.length) {
    const arg = args[i] ?? "";

    if (arg === "--json") {
      i += 1;
      continue;
    }
    if (arg === "--config") {
      i += 2;
      continue;
    }
    if (arg.startsWith("--config=")) {
      i += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      i += 1;
      continue;
    }

    break;
  }

  return args.slice(i);
}

function parseOrderCommand(commandArgs: string[]): ParsedOrder | null {
  if (commandArgs[0] !== "order") {
    return null;
  }

  const kind = (commandArgs[1] ?? "").toLowerCase();
  if (kind !== "buy" && kind !== "sell" && kind !== "bracket") {
    return null;
  }

  const symbol = normalizeSymbol(commandArgs[2] ?? null);
  const qtyRaw = commandArgs[3];
  const qty = qtyRaw ? Number.parseFloat(qtyRaw) : Number.NaN;

  if (!symbol || !Number.isFinite(qty) || qty <= 0) {
    return null;
  }

  if (kind === "buy" || kind === "sell") {
    return {
      side: kind,
      symbol,
      qty,
    };
  }

  const bracketSide = normalizeSide(readFlagValue(commandArgs, "--side")) ?? "buy";
  return {
    side: bracketSide,
    symbol,
    qty,
  };
}

function parseRiskCheckCommand(commandArgs: string[]): { side: "buy" | "sell"; symbol: string } | null {
  if (commandArgs[0] !== "risk" || commandArgs[1] !== "check") {
    return null;
  }

  const side = normalizeSide(readFlagValue(commandArgs, "--side"));
  const symbol = normalizeSymbol(readFlagValue(commandArgs, "--symbol"));

  if (!side || !symbol) {
    return null;
  }

  return { side, symbol };
}

function makeRiskKey(side: "buy" | "sell", symbol: string): string {
  return `${side}:${symbol}`;
}

function block(reason: string, ctx: MaybeContext) {
  ctx.ui?.notify?.(`Broker safety blocked command: ${reason}`, "warning");
  return {
    block: true,
    reason: `broker-safety: ${reason}`,
  };
}

export default function brokerSafetyExtension(pi: {
  on: (event: string, handler: (event: MaybeEvent, ctx: MaybeContext) => unknown) => void;
}): void {
  const maxOrderQty = parseMaxOrderQty();
  const lastRiskChecks = new Map<string, number>();

  const resetState = () => {
    lastRiskChecks.clear();
  };

  pi.on("session_start", (_event, ctx) => {
    resetState();
    ctx.ui?.setStatus?.("broker-safety", `broker-safety on · ttl=10m · max_qty=${maxOrderQty}`);
  });

  pi.on("session_switch", (_event, _ctx) => {
    resetState();
  });

  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "bash") {
      return;
    }

    const input = event.input;
    if (!input || typeof input !== "object") {
      return;
    }

    const command = (input as { command?: unknown }).command;
    if (typeof command !== "string" || command.trim().length === 0) {
      return;
    }

    const tokens = tokenizeShellLike(command);
    const brokerArgs = extractBrokerArgs(tokens);
    if (!brokerArgs) {
      return;
    }

    const parsed = trimGlobalBrokerOptions(brokerArgs);

    if (parsed[0] === "cancel" && hasFlag(parsed, "--all") && !hasFlag(parsed, "--confirm")) {
      return block("cancel --all requires --confirm", ctx);
    }

    if (parsed[0] === "risk" && parsed[1] === "override") {
      const reason = readFlagValue(parsed, "--reason");
      const duration = readFlagValue(parsed, "--duration");
      if (!reason || !duration) {
        return block("risk override requires both --duration and --reason", ctx);
      }
    }

    const riskCheck = parseRiskCheckCommand(parsed);
    if (riskCheck) {
      lastRiskChecks.set(makeRiskKey(riskCheck.side, riskCheck.symbol), Date.now());
      return;
    }

    const order = parseOrderCommand(parsed);
    if (!order) {
      return;
    }

    if (order.qty > maxOrderQty) {
      return block(
        `order qty ${order.qty} exceeds max ${maxOrderQty}; set ${ENV_MAX_ORDER_QTY} to override`,
        ctx
      );
    }

    const riskKey = makeRiskKey(order.side, order.symbol);
    const checkedAt = lastRiskChecks.get(riskKey);
    if (!checkedAt) {
      return block(
        `missing risk check for ${order.side.toUpperCase()} ${order.symbol}; run broker risk check first`,
        ctx
      );
    }

    if (Date.now() - checkedAt > RISK_CHECK_TTL_MS) {
      return block(
        `stale risk check for ${order.side.toUpperCase()} ${order.symbol}; re-run broker risk check`,
        ctx
      );
    }
  });
}
