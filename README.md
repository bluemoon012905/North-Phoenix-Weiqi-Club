# Blueshellsite

Small personal site and local content editor.

## What is here

- Public site pages at `/`, `/about/`, `/contact/`, `/category/`, and `/post/`
- Local-only editor at `/editor/`
- Content stored in `data/content.json`
- Local development server in `server.js`

## Run locally

```bash
npm run dev
```

Then open:

- `http://127.0.0.1:4321/`
- `http://127.0.0.1:4321/editor/`

## How it works

- Public pages are plain HTML plus client-side JavaScript
- Site copy, categories, posts, and homepage panels come from `data/content.json`
- The local server exposes:
  - `GET/POST /api/content`
  - `GET/POST /api/image-assets`

## Main files

- `data/content.json`: site content source of truth
- `assets/app.js`: homepage rendering
- `assets/category-page.js`: category route rendering
- `assets/post-page.js`: post route rendering
- `editor/`: local editor UI
- `docs/site-outline.md`: current information architecture and route outline

## Notes

- The repo still contains older `Blue Shell Almanac` labels in some static files
- The browser-visible site title currently comes from `data/content.json`
