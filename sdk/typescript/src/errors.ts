import type { ErrorResponse, JsonValue } from "./types.js";

export enum ErrorCode {
  DAEMON_NOT_RUNNING = "DAEMON_NOT_RUNNING",
  IB_DISCONNECTED = "IB_DISCONNECTED",
  IB_REJECTED = "IB_REJECTED",
  RISK_CHECK_FAILED = "RISK_CHECK_FAILED",
  RISK_HALTED = "RISK_HALTED",
  RATE_LIMITED = "RATE_LIMITED",
  DUPLICATE_ORDER = "DUPLICATE_ORDER",
  INVALID_SYMBOL = "INVALID_SYMBOL",
  INVALID_ARGS = "INVALID_ARGS",
  TIMEOUT = "TIMEOUT",
  INTERNAL_ERROR = "INTERNAL_ERROR"
}

export const EXIT_CODE_BY_ERROR: Record<string, number> = {
  [ErrorCode.INVALID_ARGS]: 2,
  [ErrorCode.DAEMON_NOT_RUNNING]: 3,
  [ErrorCode.IB_DISCONNECTED]: 4,
  [ErrorCode.RISK_CHECK_FAILED]: 5,
  [ErrorCode.RISK_HALTED]: 6,
  [ErrorCode.TIMEOUT]: 10
};

export class BrokerError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, JsonValue>;
  readonly suggestion?: string;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, JsonValue> = {},
    suggestion?: string | null
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.suggestion = suggestion ?? undefined;
  }

  get exitCode(): number {
    return EXIT_CODE_BY_ERROR[this.code] ?? 1;
  }

  toErrorPayload(): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      suggestion: this.suggestion
    };
  }
}

export function asErrorCode(raw: string | undefined): ErrorCode {
  if (!raw) {
    return ErrorCode.INTERNAL_ERROR;
  }
  if (Object.values(ErrorCode).includes(raw as ErrorCode)) {
    return raw as ErrorCode;
  }
  return ErrorCode.INTERNAL_ERROR;
}
