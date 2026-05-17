# 101weiqi Scraper

Self-contained workspace for the local-only `101weiqi.com` scraper.

## Progress

Progress has only been made a little so far.

Authentication has not passed yet.

Current state:

- The scraper launches Playwright with a persistent browser profile.
- It can attempt login with credentials from `.env`.
- It can also pause for manual login with `--manual-login --headful`.
- It captures HTML, screenshots, and interesting network responses for debugging.
- The extractor is still a first-pass probe and is not yet tightened around a confirmed authenticated page flow.

## Folder Contents

```text
scrapers/101weiqi/
├── README.md
└── scraper.js
```

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
npm run scrape:101weiqi -- <url> --manual-login --headful
npm run scrape:101weiqi -- <url> --out tmp/101weiqi/custom-run
```

## Output

The scraper writes:

- A JSON payload with extracted title, page details, board candidate details, and debug paths
- Raw rendered HTML
- A full-page screenshot
- Captured network responses that look relevant to book or board data

Default paths are under `tmp/101weiqi/<url-slug>/`.

```text
tmp/101weiqi/<url-slug>/
├── artifacts/
│   └── page.png
├── data/
│   └── scrape.json
├── raw/
│   ├── network.json
│   └── page.html
└── render/
    └── index.html
```

## Notes

- Automated authentication currently targets the site's username/password flow.
- If automated login fails, use `--manual-login --headful` to inspect the live browser flow.
- The persistent profile lives under `tmp/101weiqi/browser-profile/` so cookies can be reused between runs.
