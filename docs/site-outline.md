# Site Outline

## Overview

This repo is a small data-driven personal site with a local-only editor.

Current positioning in the codebase:

- Static public pages served from HTML, CSS, and client-side JavaScript
- Content stored in `data/content.json`
- Local Node server used for development, editing, and image upload APIs

The repo branding is currently mixed:

- Several HTML files and `server.js` still say `Blue Shell Almanac`
- The live site data in `data/content.json` uses `Blue's collection of stuff`

Treat `data/content.json` as the source of truth for what visitors see in the browser.

## Public Routes

### Home

Route:

- `/`

Purpose:

- Main landing page
- Entry point for browsing categories, featured work, and the archive

Current structure:

1. Top navigation
2. Hero carousel
3. Homepage sections rendered from `site.homepagePanels`
4. About strip

Hero carousel slides:

1. Intro
2. Outline
3. Featured
4. About

Important implementation detail:

- The `outline` and `featured` built-in panels appear in the hero carousel and are intentionally skipped in the lower homepage section stack.

### Games

Route:

- `/games/`

Purpose:

- Landing page for playable external projects
- Separate direct-play links from the broader post archive

Current behavior:

- Renders a curated list of external game links
- Uses the same shared site styling and top navigation as the rest of the site, with a custom games-themed hero treatment
- Includes an interactive slot machine in the hero area that spins turtle and ASU-logo image reels and triggers a matching-image rain effect on jackpot rolls
- Is currently powered by a hardcoded list in `assets/games-page.js`

### Category

Route:

- `/category/?category=<category-id>`

Purpose:

- Show one category and its published posts

Behavior:

- Loads category metadata from `data/content.json`
- Filters posts with exact category-id matching
- Hides posts where `published === false`

### Post

Route:

- `/post/?post=<post-id>`

Purpose:

- Render one published post

Behavior:

- Loads one post from `data/content.json`
- Rejects unpublished or missing posts
- Renders HTML or lightweight Markdown body content
- Shows title, summary, date, tags, and optional cover image
- Includes browser speech synthesis controls for read-aloud

### About

Route:

- `/about/`

Purpose:

- Personal/profile page
- Longer intro and contact context

Implementation notes:

- Uses shared section builders from `about/about-sections.js`
- Includes extra ASU-themed motion/animation logic from `about/about-page.js`

### Contact

Route:

- `/contact/`

Purpose:

- Direct contact page
- Email copy interaction and feedback links

Implementation notes:

- Reuses the same shared section renderer as the About page

## Local-Only Route

### Editor

Route:

- `/editor/`

Purpose:

- Admin/editor UI for the site content JSON

Availability:

- Intended for local development only
- The nav link is injected only when the hostname is local
- The page itself replaces its UI with an "Unavailable here" message outside local environments

Current editor scope:

- Edit site-wide copy
- Edit homepage panels
- Edit categories
- Create, update, preview, and delete posts
- Upload cover images and button logos through local APIs
- Export a JSON backup
- Save directly to `data/content.json`

Operational notes:

- Autosave runs every 60 seconds when there are pending changes
- The editor depends on the local Node server, not a static file host

## Navigation

Current public top nav:

- Home: `/`
- Games: `/games/`
- About: `/about/`
- Contact: `/contact/`

Local-only injected nav links:

- Editor: `/editor/`
- Debug toggle button for panel overlays

## Content Model

The site is driven by three top-level objects in `data/content.json`:

- `site`
- `categories`
- `posts`

### `site`

Currently stores:

- Title and tagline
- Intro and about copy
- Brand mark text
- Hero and page eyebrow labels
- Contact label and email
- Feedback form URL
- Editor labels
- `homepagePanels`

### `categories`

Each category currently has:

- `id`
- `name`
- `description`

Current live taxonomy:

- `art`
- `Research`
- `projects`
- `writing`

Important implementation detail:

- Category IDs are not normalized consistently. `Research` is capitalized while the others are lowercase.
- Routing and filtering currently depend on exact string matches, so ID changes have downstream effects.

### `posts`

Each post currently supports:

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

Important implementation detail:

- Public post rendering supports both `html` and a simple Markdown renderer
- The editor currently writes post bodies back as `html`

## Homepage Panel System

Built-in panel presets:

- `outline` with type `category-overview`
- `featured` with type `featured-posts`
- `archive` with type `archive-posts`

Supported panel types:

- `category-overview`
- `featured-posts`
- `archive-posts`
- `custom-content`

Current default section stack behavior:

- `outline` and `featured` are shown in the hero
- `archive` renders in the homepage body with search and category filters
- Additional custom panels render below the hero using Markdown body content

## Data and Rendering Notes

- Public pages fetch content client-side from `data/content.json`
- Local editing uses `/api/content` instead of writing through the browser directly to disk
- Turtle image variants are discovered through `/api/image-assets` when the local API is available
- Image uploads are stored under `assets/images/post-buttons/` or `assets/images/post-covers/`
- Unknown routes fall back to `index.html` in the local Node server

## Local Development Flow

1. Run `npm run dev`
2. Open `http://127.0.0.1:4321/`
3. Use `http://127.0.0.1:4321/editor/` for content edits
4. Review public pages locally
5. Commit and push

## Current Gaps

- No top-level README had been present before this update
- Branding is inconsistent between static HTML defaults and live JSON content
- Category IDs are case-sensitive and unevenly normalized
- Routes still use query parameters instead of cleaner slugs
- The previous outline included a speculative Games page that is not implemented in this repo
