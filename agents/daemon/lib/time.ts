export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  }
  return `${Math.floor(seconds / 86400)}d`;
}

export function parseWhenInput(input: string): Date {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) {
    const unix = Number.parseInt(trimmed, 10);
    const millis = unix > 9_999_999_999 ? unix : unix * 1000;
    const dt = new Date(millis);
    if (!Number.isNaN(dt.getTime())) {
      return dt;
    }
  }

  const absolute = new Date(trimmed);
  if (!Number.isNaN(absolute.getTime())) {
    return absolute;
  }

  const relative = /^in\s+(\d+)\s*([smhd])$/i.exec(trimmed);
  if (relative) {
    const count = Number.parseInt(relative[1], 10);
    const unit = relative[2].toLowerCase();
    const unitMillis: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000
    };
    return new Date(Date.now() + count * unitMillis[unit]);
  }

  throw new Error(
    "invalid timestamp format. Use ISO-8601, unix seconds, or relative format like 'in 30m'."
  );
}
