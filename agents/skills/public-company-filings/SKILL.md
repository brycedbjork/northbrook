---
name: public-company-filings
description: Discover and pull public company filings (SEC EDGAR and related sources) using canonical SEC endpoints plus targeted Brave web search.
---

# Public Company Filings Skill

Use this skill when the task requires finding or pulling public company filings for review.

Assumptions:
- runtime is operational;
- outbound HTTPS is available;
- for web-assisted discovery, Brave key is configured in `northbrook.json` (`skills.braveSearchApi.apiKey`) or env override.
- SEC user-agent identity is configured in `northbrook.json` (`sec.*`) or `SEC_USER_AGENT`.

## Discovery Principles

- Prefer canonical SEC sources first (`data.sec.gov` + `sec.gov/Archives`).
- Use web search to expand discovery when form/ticker context is incomplete.
- Return direct filing URLs and full-text URLs so filings can be reviewed immediately.
- Distinguish facts from inference (ticker/CIK certainty, filing-type certainty).

## Command Surface

- Help:
  `./agents/skills/public-company-filings/filings.sh --help`
- Resolve company metadata:
  `./agents/skills/public-company-filings/filings.sh resolve --ticker AAPL`
  `./agents/skills/public-company-filings/filings.sh resolve --company "Apple" --limit 5`
- Discover recent SEC filings:
  `./agents/skills/public-company-filings/filings.sh discover --ticker AAPL --forms 10-K,10-Q,8-K --limit 20`
  `./agents/skills/public-company-filings/filings.sh discover --cik 320193 --since 2025-01-01 --include-amends`
- Web-assisted discovery (uses web-search skill):
  `./agents/skills/public-company-filings/filings.sh web-discover --ticker AAPL --forms 10-K,10-Q --count 8 --freshness py`
- Pull filing content for review:
  `./agents/skills/public-company-filings/filings.sh fetch --url "https://www.sec.gov/Archives/edgar/data/320193/000032019325000073/aapl-20250927x10k.htm" --max-chars 120000`

## Required Workflow

1. Resolve issuer
- Start with `resolve` if ticker/company mapping is unclear.

2. Pull canonical filing list
- Run `discover` with explicit form filters and date floor when relevant.

3. Expand via web search when needed
- Run `web-discover` for missing docs, ambiguous naming, or supplemental sources.
- Prefer URLs under `sec.gov/Archives/edgar/data`.

4. Pull filing text
- Use `fetch` on the returned filing URL or full text URL.

5. Summarize evidence quality
- Note if filing source is official SEC archive vs secondary mirror/news.

## SEC Form Shortlist

- US issuers: `10-K`, `10-Q`, `8-K`, `DEF 14A`.
- Foreign private issuers: `20-F`, `6-K`.
- Ownership/activism signals: `SC 13D`, `SC 13G`, `4`.
- Registration/prospectus: `S-1`, `S-3`, `424B*`.

## Output Contract

After each filings workflow, return:
- `commands`: exact commands executed;
- `company`: resolved issuer identity (name/ticker/CIK confidence);
- `filings`: form/date/accession plus direct SEC URLs;
- `sources`: official vs secondary source quality notes;
- `next`: one concrete follow-up command, or `none`.

## References

- SEC discovery references: `agents/skills/public-company-filings/references/sec-discovery.md`
