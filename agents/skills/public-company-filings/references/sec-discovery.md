# SEC Discovery References

Primary references used for this skill:

- SEC EDGAR APIs overview (submissions, XBRL, data sets): https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- Accessing EDGAR data and archive URL patterns: https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data
- SEC developer resources (API links and feeds): https://www.sec.gov/about/developer-resources
- SEC filing full-text and company search entry points: https://www.sec.gov/search-filings
- SEC automated access guidance and fair access policy context: https://www.sec.gov/about/webmaster-frequently-asked-questions

Operational notes captured in this skill:

- Resolve ticker-to-CIK via SEC-provided datasets (`/files/company_tickers*.json`).
- Use company submissions endpoint:
  - `https://data.sec.gov/submissions/CIK##########.json`
- Build filing URLs from `cik`, `accessionNumber`, and `primaryDocument`.
- Use explicit `User-Agent` on SEC requests.
