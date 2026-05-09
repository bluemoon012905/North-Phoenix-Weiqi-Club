# North Phoenix Weiqi Club

Small static site plus a local-only content editor.

## Overview

This repo serves two jobs:

- Public site pages rendered in the browser from `data/content.json` plus `data/posts/`
- A local editor that writes changes back to those content files through a small Node server

The stack is intentionally simple:

- Plain HTML entry pages
- Client-side JavaScript for rendering
- Shared CSS in `assets/styles.css`
- A minimal Node server in `server.js`

## Run Locally

```bash
npm run dev
```

Then open:

- `http://127.0.0.1:4321/`
- `http://127.0.0.1:4321/editor/`

## Repo Structure

```text
.
├── assets/
│   ├── app.js
│   ├── category-page.js
│   ├── content-helpers.js
│   ├── post-page.js
│   ├── styles.css
│   └── images/
├── category/
│   └── index.html
├── contact/
│   ├── contact-page.js
│   └── index.html
├── data/
│   ├── content.json
│   └── posts/
│       ├── index.json
│       └── <post-id>.json
├── docs/
│   └── site-outline.md
├── editor/
│   ├── editor-events.js
│   ├── editor-helpers.js
│   ├── editor.css
│   ├── editor.js
│   └── index.html
├── post/
│   └── index.html
├── index.html
├── server.js
└── package.json
```

## Route Entry Points

- `/` -> `index.html` + `assets/app.js`
- `/contact/` -> `contact/index.html` + `contact/contact-page.js`
- `/category/?category=<id>` -> `category/index.html` + `assets/category-page.js`
- `/post/?post=<id>` -> `post/index.html` + `assets/post-page.js`
- `/editor/` -> `editor/index.html` + `editor/editor.js`

## Code Structure

### Public site

- `index.html` contains the homepage shell and shared top navigation.
- `assets/app.js` loads site/category data plus the post index, renders the homepage hero and section stack, and handles local-only banner affordances like the editor/debug links.
- `assets/category-page.js` renders a single category page from the `category` query parameter.
- `assets/post-page.js` renders a single post page from the `post` query parameter and includes the browser read-aloud feature.
- `contact/contact-page.js` renders the contact page and handles copy-to-clipboard for the configured email address.
- `assets/content-helpers.js` is the shared client utility layer for formatting dates, escaping HTML, sanitizing rich HTML, rendering lightweight Markdown, and local debug-panel behavior.
- `assets/styles.css` is the shared stylesheet for all public pages.

### Editor

- `editor/index.html` defines the editor layout, site fields, homepage panel controls, and the post composer modal.
- `editor/editor.js` owns editor state, loading/saving content, rendering form sections, post selection, autosave, and image upload actions.
- `editor/editor-events.js` wires DOM events to the state-sync functions defined in `editor/editor.js`.
- `editor/editor-helpers.js` contains editor-specific formatting and sanitizing helpers used by the composer and preview UI.
- `editor/editor.css` styles the editor separately from the public site.

### Data

- `data/content.json` stores site copy, categories, and homepage panel configuration.
- `data/posts/index.json` stores the lightweight post index used by listing pages.
- `data/posts/<post-id>.json` stores each full post in its own file.
- Public pages use shared helpers to load the split content model.
- The editor still loads and saves a combined payload through `/api/content`, and the server splits it back onto disk.

### Server

- `server.js` serves static files from the repo root.
- `GET /api/content` returns a combined payload assembled from `data/content.json` and `data/posts/`.
- `POST /api/content` validates that payload, writes `data/content.json`, writes `data/posts/index.json`, and writes one JSON file per post.
- `GET /api/image-assets` returns known image files under `assets/images/`.
- `POST /api/image-assets` saves uploaded images into `assets/images/post-buttons/` or `assets/images/post-covers/`.
- Unknown routes fall back to `index.html`, which is fine for local development but means this is not a full router.

## Content Model

The combined content payload exposed to the editor has three top-level collections:

- `site`
- `categories`
- `posts`

### `site`

Current site-level fields include:

- `title`
- `tagline`
- `intro`
- `contactDescription`
- `brandMark`
- `heroEyebrow`
- `contactEyebrow`
- `contactLabel`
- `contactHref`
- `feedbackHref`
- `editorEyebrow`
- `editorTitle`
- `editorDescription`
- `homepagePanels`

### `categories`

Each category currently contains:

- `id`
- `name`
- `description`

Category matching is exact and case-sensitive.

### `posts`

Each post currently contains:

- `id`
- `title`
- `category`
- `date`
- `summary`
- `coverImage`
- `published`
- `featured`
- `tags`
- `bodyFormat`
- `body`

On disk, each post lives at `data/posts/<id>.json`, and `data/posts/index.json` stores the listing metadata used by the homepage and category pages.

## Development Notes

- The editor is intentionally local-only. It checks the hostname and replaces its UI with an unavailable message when not running locally.
- Shared content helpers and editor helpers intentionally overlap in a few places; they are separate because the editor and public site are loaded independently.
- The repo still contains some older `Blue Shell Almanac` naming in defaults. Browser-visible content should be treated as coming from `data/content.json` and `data/posts/`.

## More Detail

For a deeper map of the rendering flow and module responsibilities, see `docs/site-outline.md`.
