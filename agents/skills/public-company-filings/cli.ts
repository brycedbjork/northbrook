#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

type TickerEntry = {
  cik_str?: number;
  ticker?: string;
  title?: string;
};

type ResolvedIssuer = {
  name: string;
  ticker: string;
  cik: string;
  paddedCik: string;
};

type SubmissionsResponse = {
  cik?: string;
  name?: string;
  tickers?: string[];
  exchanges?: string[];
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      reportDate?: string[];
      acceptanceDateTime?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
      fileNumber?: string[];
      items?: string[];
    };
  };
};

type FilingRecord = {
  form: string;
  filingDate: string;
  reportDate?: string;
  acceptanceDateTime?: string;
  accessionNumber: string;
  primaryDocument?: string;
  primaryDocDescription?: string;
  fileNumber?: string;
  items?: string;
  filingUrl?: string;
  filingTextUrl: string;
  filingIndexUrl: string;
};

const SEC_SUBMISSIONS_BASE = "https://data.sec.gov/submissions";
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_WEB_COUNT = 8;
const MAX_WEB_COUNT = 10;

let tickerRowsCache: ResolvedIssuer[] | null = null;

function usage(): void {
  console.log(`Public Company Filings CLI

Usage:
  ./agents/skills/public-company-filings/filings.sh resolve --ticker <symbol>
  ./agents/skills/public-company-filings/filings.sh resolve --company <name-fragment> [--limit <n>]
  ./agents/skills/public-company-filings/filings.sh discover (--ticker <symbol> | --cik <cik>) [--forms <csv>] [--since <YYYY-MM-DD>] [--limit <n>] [--include-amends]
  ./agents/skills/public-company-filings/filings.sh web-discover (--ticker <symbol> | --company <name>) [--forms <csv>] [--count <1-10>] [--freshness <pd|pw|pm|py|YYYY-MM-DDtoYYYY-MM-DD>]
  ./agents/skills/public-company-filings/filings.sh fetch --url <filing-url> [--max-chars <n>]

Environment:
  SEC_USER_AGENT  Optional explicit SEC request header override
  (fallback) ~/.northbrook/northbrook.json -> sec.userAgent / sec identity fields
  BRAVE_API_KEY   Optional override for web-discover (delegates to web-search skill)
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

function parsePositiveInt(value: string | null, fallback: number, max: number, flag: string): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return Math.max(1, Math.min(parsed, max));
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

function parseFormsCsv(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
}

function normalizePaddedCik(value: string | number): string {
  const digits = String(value).replaceAll(/\D/g, "");
  if (!digits) {
    throw new Error("invalid CIK");
  }
  return digits.padStart(10, "0");
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

type SecConfig = {
  appName?: unknown;
  name?: unknown;
  email?: unknown;
  company?: unknown;
  userAgent?: unknown;
};

function buildSecUserAgent(input: {
  appName: string;
  name: string;
  email: string;
  company: string;
}): string {
  const appName = input.appName || "Northbrook";
  const base = `${appName}/1.0`;
  const contactParts = [input.name, input.company, input.email].filter((part) => part.length > 0);
  if (contactParts.length === 0) {
    return base;
  }
  return `${base} (${contactParts.join(", ")})`;
}

function readSecConfig(): SecConfig {
  const configPath = resolveNorthbrookConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as { sec?: SecConfig };
    if (parsed.sec && typeof parsed.sec === "object") {
      return parsed.sec;
    }
  } catch {
    // ignore malformed config
  }

  return {};
}

function resolveSecUserAgent(): string {
  const fromEnv = (process.env.SEC_USER_AGENT ?? "").trim();
  if (fromEnv) {
    return fromEnv;
  }

  const secConfig = readSecConfig();
  const explicitFromConfig = asNonEmptyString(secConfig.userAgent);
  if (explicitFromConfig) {
    return explicitFromConfig;
  }

  const composed = buildSecUserAgent({
    appName: asNonEmptyString(secConfig.appName) || "Northbrook",
    name: asNonEmptyString(secConfig.name),
    email: asNonEmptyString(secConfig.email),
    company: asNonEmptyString(secConfig.company),
  });
  if (composed.trim()) {
    return composed;
  }

  return "Northbrook/1.0";
}

function secHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": resolveSecUserAgent(),
    Accept: "application/json",
    ...extra,
  };
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: secHeaders(headers),
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`request failed (${response.status}) for ${url}: ${detail || response.statusText}`);
  }

  return (await response.json()) as T;
}

async function loadTickerRows(): Promise<ResolvedIssuer[]> {
  if (tickerRowsCache) {
    return tickerRowsCache;
  }

  const payload = await fetchJson<Record<string, TickerEntry>>(SEC_TICKERS_URL);
  const rows: ResolvedIssuer[] = Object.values(payload)
    .map((entry) => {
      const ticker = (entry.ticker ?? "").trim().toUpperCase();
      const name = (entry.title ?? "").trim();
      const cikNum = entry.cik_str;
      if (!ticker || !name || typeof cikNum !== "number") {
        return null;
      }
      const paddedCik = normalizePaddedCik(cikNum);
      return {
        name,
        ticker,
        cik: String(Number.parseInt(paddedCik, 10)),
        paddedCik,
      } satisfies ResolvedIssuer;
    })
    .filter((entry): entry is ResolvedIssuer => entry !== null)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  tickerRowsCache = rows;
  return rows;
}

async function resolveIssuerByTicker(ticker: string): Promise<ResolvedIssuer> {
  const rows = await loadTickerRows();
  const normalized = ticker.trim().toUpperCase();
  const match = rows.find((entry) => entry.ticker === normalized);
  if (!match) {
    throw new Error(`ticker not found in SEC ticker dataset: ${normalized}`);
  }
  return match;
}

async function searchIssuerByName(company: string, limit: number): Promise<ResolvedIssuer[]> {
  const rows = await loadTickerRows();
  const needle = company.trim().toUpperCase();
  if (!needle) {
    throw new Error("missing --company value");
  }

  const matches = rows.filter((entry) => entry.name.toUpperCase().includes(needle));
  return matches.slice(0, limit);
}

function matchesForms(form: string, targets: string[], includeAmends: boolean): boolean {
  if (targets.length === 0) {
    return true;
  }
  const normalized = form.toUpperCase();
  for (const target of targets) {
    if (normalized === target) {
      return true;
    }
    if (includeAmends && normalized === `${target}/A`) {
      return true;
    }
  }
  return false;
}

function stripNonTextHtml(raw: string): string {
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function toFilingRecord(params: {
  paddedCik: string;
  form: string;
  filingDate: string;
  reportDate?: string;
  acceptanceDateTime?: string;
  accessionNumber: string;
  primaryDocument?: string;
  primaryDocDescription?: string;
  fileNumber?: string;
  items?: string;
}): FilingRecord {
  const cik = String(Number.parseInt(params.paddedCik, 10));
  const accessionNoDashes = params.accessionNumber.replaceAll("-", "");
  const filingBaseUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}`;

  const filingUrl = params.primaryDocument
    ? `${filingBaseUrl}/${params.primaryDocument}`
    : undefined;

  return {
    form: params.form,
    filingDate: params.filingDate,
    reportDate: params.reportDate,
    acceptanceDateTime: params.acceptanceDateTime,
    accessionNumber: params.accessionNumber,
    primaryDocument: params.primaryDocument,
    primaryDocDescription: params.primaryDocDescription,
    fileNumber: params.fileNumber,
    items: params.items,
    filingUrl,
    filingTextUrl: `${filingBaseUrl}/${params.accessionNumber}.txt`,
    filingIndexUrl: `${filingBaseUrl}/index.json`,
  };
}

async function runWebSearchSkill(params: {
  query: string;
  count: number;
  freshness?: string;
}): Promise<Record<string, unknown>> {
  const webSearchScript = path.resolve(import.meta.dir, "..", "web-search", "search.sh");
  if (!existsSync(webSearchScript)) {
    throw new Error(`web-search skill script missing: ${webSearchScript}`);
  }

  const cmd = [webSearchScript, "--query", params.query, "--count", String(params.count)];
  if (params.freshness) {
    cmd.push("--freshness", params.freshness);
  }

  const proc = Bun.spawn({
    cmd,
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (code !== 0) {
    throw new Error(`web-search invocation failed: ${(stderr || stdout).trim()}`);
  }

  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new Error("web-search returned non-JSON output");
  }
}

async function commandResolve(args: string[]): Promise<void> {
  const ticker = readOption(args, "--ticker");
  const company = readOption(args, "--company");
  const limit = parsePositiveInt(readOption(args, "--limit"), 10, 50, "--limit");

  if (!ticker && !company) {
    throw new Error("resolve requires --ticker or --company");
  }

  if (ticker) {
    const issuer = await resolveIssuerByTicker(ticker);
    console.log(
      JSON.stringify(
        {
          source: SEC_TICKERS_URL,
          input: { ticker: ticker.toUpperCase() },
          matches: [issuer],
          count: 1,
        },
        null,
        2
      )
    );
    return;
  }

  const matches = await searchIssuerByName(company ?? "", limit);
  console.log(
    JSON.stringify(
      {
        source: SEC_TICKERS_URL,
        input: { company: company ?? "" },
        matches,
        count: matches.length,
      },
      null,
      2
    )
  );
}

async function commandDiscover(args: string[]): Promise<void> {
  const ticker = readOption(args, "--ticker");
  const cik = readOption(args, "--cik");
  const since = readOption(args, "--since");
  const forms = parseFormsCsv(readOption(args, "--forms"));
  const includeAmends = hasFlag(args, "--include-amends");
  const limit = parsePositiveInt(readOption(args, "--limit"), DEFAULT_LIMIT, MAX_LIMIT, "--limit");

  if (since && !isValidIsoDate(since)) {
    throw new Error("--since must be YYYY-MM-DD");
  }

  if (!ticker && !cik) {
    throw new Error("discover requires --ticker or --cik");
  }

  let issuer: ResolvedIssuer | null = null;
  let paddedCik = "";
  if (ticker) {
    issuer = await resolveIssuerByTicker(ticker);
    paddedCik = issuer.paddedCik;
  } else if (cik) {
    paddedCik = normalizePaddedCik(cik);
  }

  const submissionsUrl = `${SEC_SUBMISSIONS_BASE}/CIK${paddedCik}.json`;
  const submissions = await fetchJson<SubmissionsResponse>(submissionsUrl);
  const recent = submissions.filings?.recent;
  if (!recent) {
    throw new Error(`no recent filing data in submissions payload for CIK ${paddedCik}`);
  }

  const formsArr = Array.isArray(recent.form) ? recent.form : [];
  const filingDateArr = Array.isArray(recent.filingDate) ? recent.filingDate : [];
  const reportDateArr = Array.isArray(recent.reportDate) ? recent.reportDate : [];
  const acceptanceArr = Array.isArray(recent.acceptanceDateTime) ? recent.acceptanceDateTime : [];
  const accessionArr = Array.isArray(recent.accessionNumber) ? recent.accessionNumber : [];
  const primaryDocArr = Array.isArray(recent.primaryDocument) ? recent.primaryDocument : [];
  const primaryDocDescriptionArr = Array.isArray(recent.primaryDocDescription) ? recent.primaryDocDescription : [];
  const fileNumberArr = Array.isArray(recent.fileNumber) ? recent.fileNumber : [];
  const itemsArr = Array.isArray(recent.items) ? recent.items : [];

  const filings: FilingRecord[] = [];
  for (let index = 0; index < accessionArr.length; index += 1) {
    const form = formsArr[index] ?? "";
    const filingDate = filingDateArr[index] ?? "";
    const accessionNumber = accessionArr[index] ?? "";

    if (!form || !filingDate || !accessionNumber) {
      continue;
    }
    if (since && filingDate < since) {
      continue;
    }
    if (!matchesForms(form, forms, includeAmends)) {
      continue;
    }

    filings.push(
      toFilingRecord({
        paddedCik,
        form,
        filingDate,
        reportDate: reportDateArr[index] || undefined,
        acceptanceDateTime: acceptanceArr[index] || undefined,
        accessionNumber,
        primaryDocument: primaryDocArr[index] || undefined,
        primaryDocDescription: primaryDocDescriptionArr[index] || undefined,
        fileNumber: fileNumberArr[index] || undefined,
        items: itemsArr[index] || undefined,
      })
    );

    if (filings.length >= limit) {
      break;
    }
  }

  const company = {
    name: submissions.name ?? issuer?.name ?? null,
    ticker: issuer?.ticker ?? submissions.tickers?.[0] ?? null,
    cik: String(Number.parseInt(paddedCik, 10)),
    paddedCik,
    exchange: submissions.exchanges?.[0] ?? null,
  };

  console.log(
    JSON.stringify(
      {
        source: submissionsUrl,
        company,
        filters: {
          forms,
          includeAmends,
          since: since ?? null,
          limit,
        },
        count: filings.length,
        filings,
      },
      null,
      2
    )
  );
}

async function commandWebDiscover(args: string[]): Promise<void> {
  const ticker = readOption(args, "--ticker");
  const company = readOption(args, "--company");
  const forms = parseFormsCsv(readOption(args, "--forms"));
  const count = parsePositiveInt(readOption(args, "--count"), DEFAULT_WEB_COUNT, MAX_WEB_COUNT, "--count");
  const freshness = readOption(args, "--freshness") ?? undefined;

  if (!ticker && !company) {
    throw new Error("web-discover requires --ticker or --company");
  }

  let subject = "";
  if (ticker) {
    const issuer = await resolveIssuerByTicker(ticker);
    subject = `${issuer.ticker} ${issuer.name}`;
  } else if (company) {
    subject = company.trim();
  }

  const formsClause = forms.length > 0 ? ` (${forms.join(" OR ")})` : "";
  const query = `site:sec.gov/Archives/edgar/data ${subject}${formsClause} filing`;

  const result = await runWebSearchSkill({ query, count, freshness });
  console.log(
    JSON.stringify(
      {
        source: "web-search-skill",
        query,
        guidance:
          "Prefer SEC archive URLs under sec.gov/Archives/edgar/data and verify accession/form pairing before analysis.",
        result,
      },
      null,
      2
    )
  );
}

async function commandFetch(args: string[]): Promise<void> {
  const url = readOption(args, "--url");
  const maxChars = parsePositiveInt(readOption(args, "--max-chars"), 120_000, 500_000, "--max-chars");

  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("fetch requires --url with http(s) scheme");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: secHeaders({
      Accept: "*/*",
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`fetch failed (${response.status}): ${detail || response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "unknown";
  const raw = await response.text();
  const text = contentType.toLowerCase().includes("html") ? stripNonTextHtml(raw) : raw;
  const truncated = text.length > maxChars;

  console.log(
    JSON.stringify(
      {
        url,
        status: response.status,
        contentType,
        maxChars,
        truncated,
        text: truncated ? text.slice(0, maxChars) : text,
      },
      null,
      2
    )
  );
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage();
    return;
  }

  switch (command) {
    case "resolve":
      await commandResolve(rest);
      return;
    case "discover":
      await commandDiscover(rest);
      return;
    case "web-discover":
      await commandWebDiscover(rest);
      return;
    case "fetch":
      await commandFetch(rest);
      return;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`filings error: ${message}`);
  console.error("Run `./agents/skills/public-company-filings/filings.sh --help` for usage.");
  process.exit(1);
});
