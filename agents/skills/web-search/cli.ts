#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

type BraveSearchResult = {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveSearchResult[];
  };
};

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_COUNT = 5;
const MAX_COUNT = 10;
const FRESHNESS_SHORTCUTS = new Set(["pd", "pw", "pm", "py"]);
const FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

function usage(): void {
  console.log(`Web Search CLI (Brave API)

Usage:
  ./agents/skills/web-search/search.sh --query <text> [--count <1-10>] [--country <code>] [--search-lang <lang>] [--ui-lang <lang>] [--freshness <pd|pw|pm|py|YYYY-MM-DDtoYYYY-MM-DD>] [--raw]

Examples:
  ./agents/skills/web-search/search.sh --query "AAPL 10-K filing" --count 8 --freshness py
  ./agents/skills/web-search/search.sh --query "site:sec.gov/Archives/edgar/data NVDA 10-Q" --country US --search-lang en

Environment:
  BRAVE_API_KEY         optional override
  BRAVE_SEARCH_API_KEY  optional override
  (fallback) ~/.northbrook/northbrook.json -> skills.braveSearchApi.apiKey
`);
}

function readOption(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return null;
  }
  return args[idx + 1] ?? null;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function readPositionalQuery(args: string[]): string | null {
  const flagsWithValue = new Set(["--query", "--count", "--country", "--search-lang", "--ui-lang", "--freshness"]);
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (flagsWithValue.has(current)) {
      index += 1;
      continue;
    }
    if (current.startsWith("-")) {
      continue;
    }
    return current;
  }
  return null;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function normalizeFreshness(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  if (FRESHNESS_SHORTCUTS.has(lower)) {
    return lower;
  }

  const match = trimmed.match(FRESHNESS_RANGE);
  if (!match) {
    throw new Error("invalid --freshness value; use pd/pw/pm/py or YYYY-MM-DDtoYYYY-MM-DD");
  }

  const [, start, end] = match;
  if (!isValidIsoDate(start) || !isValidIsoDate(end) || start > end) {
    throw new Error("invalid --freshness date range");
  }

  return `${start}to${end}`;
}

function parseCount(raw: string | null): number {
  if (!raw) {
    return DEFAULT_COUNT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_COUNT) {
    throw new Error(`--count must be an integer between 1 and ${MAX_COUNT}`);
  }
  return parsed;
}

function resolveSiteName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveNorthbrookConfigPath(): string {
  const fromEnv = asNonEmptyString(process.env.NORTHBROOK_CONFIG_JSON);
  if (fromEnv) {
    return fromEnv;
  }

  const northbrookHome = asNonEmptyString(process.env.NORTHBROOK_HOME);
  if (northbrookHome) {
    return path.join(northbrookHome, "northbrook.json");
  }

  return path.join(homedir(), ".northbrook", "northbrook.json");
}

function readConfigBraveApiKey(): string {
  const configPath = resolveNorthbrookConfigPath();
  if (!existsSync(configPath)) {
    return "";
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      skills?: {
        braveSearchApi?: {
          apiKey?: unknown;
        };
      };
    };
    return asNonEmptyString(parsed.skills?.braveSearchApi?.apiKey);
  } catch {
    return "";
  }
}

function requiredApiKey(): string {
  const key =
    asNonEmptyString(process.env.BRAVE_API_KEY) ||
    asNonEmptyString(process.env.BRAVE_SEARCH_API_KEY) ||
    readConfigBraveApiKey();
  if (!key) {
    throw new Error(
      "missing Brave Search API key (set skills.braveSearchApi.apiKey in northbrook.json or set BRAVE_API_KEY)"
    );
  }
  return key;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    usage();
    return;
  }

  const positionalQuery = readPositionalQuery(args);
  const query = readOption(args, "--query") ?? positionalQuery;
  if (!query || !query.trim()) {
    throw new Error("missing --query <text>");
  }

  const count = parseCount(readOption(args, "--count"));
  const country = readOption(args, "--country") ?? undefined;
  const searchLang = readOption(args, "--search-lang") ?? undefined;
  const uiLang = readOption(args, "--ui-lang") ?? undefined;
  const freshness = normalizeFreshness(readOption(args, "--freshness"));
  const raw = hasFlag(args, "--raw");

  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("count", String(count));
  if (country) {
    url.searchParams.set("country", country);
  }
  if (searchLang) {
    url.searchParams.set("search_lang", searchLang);
  }
  if (uiLang) {
    url.searchParams.set("ui_lang", uiLang);
  }
  if (freshness) {
    url.searchParams.set("freshness", freshness);
  }

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": requiredApiKey(),
    },
  });

  if (!response.ok) {
    const detail = await readResponseText(response);
    throw new Error(`Brave Search API error (${response.status}): ${detail || response.statusText}`);
  }

  const data = (await response.json()) as BraveSearchResponse;
  if (raw) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const results = Array.isArray(data.web?.results) ? data.web?.results ?? [] : [];
  const payload = {
    provider: "brave",
    query: query.trim(),
    count: results.length,
    tookMs: Date.now() - startedAt,
    results: results.map((entry) => ({
      title: entry.title ?? "",
      url: entry.url ?? "",
      description: entry.description ?? "",
      published: entry.age ?? undefined,
      siteName: resolveSiteName(entry.url),
    })),
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`web-search error: ${message}`);
  console.error("Run `./agents/skills/web-search/search.sh --help` for usage.");
  process.exit(1);
});
