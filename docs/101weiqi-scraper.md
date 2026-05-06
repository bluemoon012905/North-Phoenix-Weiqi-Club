# 101weiqi Scraper

Local-only scraper for protected `101weiqi.com` book pages.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in `WEIQI_USERNAME` and `WEIQI_PASSWORD`.
3. Install dependencies:

```bash
npm install
```

## Run

```bash
npm run scrape:101weiqi -- https://www.101weiqi.com/book/5105/9332/20264/
```

Optional flags:

```bash
npm run scrape:101weiqi -- <url> --headful
npm run scrape:101weiqi -- <url> --out tmp/custom.json
npm run scrape:101weiqi -- <url> --debug-dir tmp/101-debug
```

## Output

The scraper writes:

- A JSON payload with extracted title, page details, board candidate details, and debug paths
- Raw rendered HTML
- A full-page screenshot
- Captured network responses that look relevant to book or board data

Default paths are under `tmp/101weiqi/`.

## Notes

- Authentication currently uses the page's username/password login form at `/wq/login/`.
- The first pass is intentionally conservative. Once you provide working credentials and a live example page, we can tighten the extractor around the exact DOM and board payload used after login.
