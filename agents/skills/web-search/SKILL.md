---
name: web-search
description: Run deterministic web search queries through Brave Search API for current-source discovery, with region/language controls and freshness filters.
---

# Web Search Skill

Use this skill whenever the task requires public web discovery and current-source lookup.

Assumptions:
- runtime is operational and outbound HTTPS is available;
- Brave Search key is available via `~/.northbrook/northbrook.json` (`skills.braveSearchApi.apiKey`) or env override.

## Global Rules

- Use only `./agents/skills/web-search/search.sh`.
- Default to focused queries with `site:` constraints when source quality matters.
- For time-sensitive topics, pass `--freshness` (`pd`, `pw`, `pm`, `py`, or explicit date range).
- Treat result snippets as leads; open and verify primary sources before conclusions.
- On failure:
  1. report the exact command,
  2. include error text,
  3. provide one concrete retry command.

## Command Surface

- Help:
  `./agents/skills/web-search/search.sh --help`
- Basic:
  `./agents/skills/web-search/search.sh --query "NVIDIA earnings date"`
- With count + recency:
  `./agents/skills/web-search/search.sh --query "AAPL 10-K filing" --count 8 --freshness py`
- Region/language:
  `./agents/skills/web-search/search.sh --query "Semiconductor policy update" --country US --search-lang en --ui-lang en`

## Parameters

- `--query` required search string.
- `--count` optional results count (`1-10`, default `5`).
- `--country` optional 2-letter country code (example: `US`).
- `--search-lang` optional language code (example: `en`).
- `--ui-lang` optional UI language code.
- `--freshness` optional recency filter:
  - `pd` past day,
  - `pw` past week,
  - `pm` past month,
  - `py` past year,
  - `YYYY-MM-DDtoYYYY-MM-DD` explicit range.
- `--raw` optional raw Brave response passthrough.

## Output Contract

After each web-search workflow, return:
- `command`: exact command executed;
- `query`: submitted query;
- `results`: title/url/description (+ published hint if available);
- `quality`: source-quality notes (official vs secondary, stale risks);
- `next`: one concrete follow-up command, or `none`.
