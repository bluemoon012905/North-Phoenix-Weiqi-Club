# Site Outline

## Purpose

This document is the deeper code-structure reference for the repo. Use it when you need to understand which file owns which behavior, how data flows from disk to the browser, and where to make changes for each page or feature.

## High-Level Architecture

The project is split into four layers:

1. Static HTML entry files that declare page shells
2. Client-side JavaScript modules that fetch content and render each page
3. A shared JSON content file at `data/content.json`
4. A small local Node server in `server.js` for static serving, content saving, and image upload APIs

There is no framework router, build step, or database.

## Directory Map

### Root files

- `index.html`
  Homepage entry shell.
- `server.js`
  Local static server plus JSON and image APIs.
- `package.json`
  Contains the `npm run dev` script.
- `CNAME`
  Deployment/domain configuration.

### `assets/`

- `styles.css`
  Shared public-site styling.
- `content-helpers.js`
  Shared utilities used by public pages.
- `app.js`
  Homepage renderer.
- `category-page.js`
  Category page renderer.
- `post-page.js`
  Post page renderer.
- `images/`
  Uploaded and static image assets.

### `contact/`

- `index.html`
  Contact page shell.
- `contact-page.js`
  Contact page renderer and clipboard behavior.

### `category/`

- `index.html`
  Category page shell.

### `post/`

- `index.html`
  Post page shell.

### `editor/`

- `index.html`
  Editor page shell and modal markup.
- `editor.css`
  Editor styling.
- `editor.js`
  Editor state and behavior.
- `editor-events.js`
  Event registration for editor controls.
- `editor-helpers.js`
  Editor-specific utility helpers.

### `data/`

- `content.json`
  Site copy, categories, homepage panel config, and posts.

### `docs/`

- `site-outline.md`
  This document.

## Public Page Ownership

### Home page

Route:

- `/`

Files:

- `index.html`
- `assets/app.js`
- `assets/content-helpers.js`
- `assets/styles.css`

Behavior:

- Loads `data/content.json`
- Normalizes built-in homepage panels with `ensureHomePanels`
- Renders the hero carousel
- Renders homepage body panels below the hero
- Adds local-only nav affordances when running on localhost
- Discovers optional turtle image variants through `/api/image-assets` when available

Main responsibilities in `assets/app.js`:

- `loadContent`
  Bootstraps the page.
- `renderHero`
  Builds the homepage hero and carousel markup.
- `renderHomepageSections`
  Builds the panel stack below the hero.
- `renderTopBanner`
  Injects the local editor link on local hosts.

### Contact page

Route:

- `/contact/`

Files:

- `contact/index.html`
- `contact/contact-page.js`
- `assets/content-helpers.js`
- `assets/styles.css`

Behavior:

- Loads `data/content.json`
- Renders contact copy from `site.contactDescription`
- Uses `site.contactHref` for mailto links
- Uses `site.feedbackHref` for the feedback form link
- Supports copying the configured email to the clipboard

Main responsibilities in `contact/contact-page.js`:

- `loadContactPage`
  Loads the JSON content.
- `renderContactPage`
  Generates the contact hero and contact cards.
- `bindCopyEmail`
  Handles the copy button behavior.

### Category page

Route:

- `/category/?category=<category-id>`

Files:

- `category/index.html`
- `assets/category-page.js`
- `assets/content-helpers.js`
- `assets/styles.css`

Behavior:

- Reads `category` from the query string
- Loads `data/content.json`
- Finds the matching category by exact `id`
- Renders only published posts in that category

Main responsibilities in `assets/category-page.js`:

- `loadCategory`
  Resolves the category and its posts.
- `renderPostCard`
  Builds cards linking to `/post/`.
- `renderCategoryHeroDecoration`
  Injects category-specific art for certain categories.

### Post page

Route:

- `/post/?post=<post-id>`

Files:

- `post/index.html`
- `assets/post-page.js`
- `assets/content-helpers.js`
- `assets/styles.css`

Behavior:

- Reads `post` from the query string
- Loads `data/content.json`
- Finds the published post by exact `id`
- Renders post metadata and body
- Supports both `html` and lightweight Markdown body rendering
- Exposes browser speech synthesis controls

Main responsibilities in `assets/post-page.js`:

- `loadPost`
  Resolves the post and renders the page.
- `bindReadAloud`
  Wires the speech synthesis UI.
- `hydrateVoiceList`
  Populates voice options from browser APIs.

## Shared Public Utilities

`assets/content-helpers.js` exposes `window.BlueshellContent`.

Current responsibilities:

- Environment detection with `isLocalEnvironment`
- Built-in homepage panel defaults
- Date formatting
- Lightweight Markdown rendering
- Rich HTML sanitization
- Safe image source validation
- HTML escaping
- Local debug-panel toggle injection

Important note:

- Public routes load this file directly in the browser. There is no module bundler, so the API surface is attached to `window`.

## Editor Architecture

### Entry files

- `editor/index.html`
- `editor/editor.css`
- `editor/editor.js`
- `editor/editor-events.js`
- `editor/editor-helpers.js`

### Runtime model

The editor is one browser page with a shared mutable state object:

- `editorState.content`
  The full parsed JSON document.
- `editorState.selectedPostId`
  Current post selection.
- `editorState.hasUnsavedChanges`
  Dirty-state tracking for autosave/manual save.
- `editorState.imageAssets`
  Known uploaded image assets.

### Main responsibilities in `editor/editor.js`

- `initEditor`
  Loads local content and initializes the UI.
- `populateSiteFields`
  Copies `site` values into the form.
- `populateHomePanelFields`
  Renders homepage panel controls.
- `populateCategoryFields`
  Renders category controls.
- `renderPostList`
  Renders sidebar post navigation.
- `selectPost`
  Switches the active post.
- `syncSiteFields`
  Writes form values back into `editorState.content.site`.
- `syncCurrentPost`
  Writes composer values back into the selected post.
- `saveAllChanges` / `autoSaveChanges`
  Persist JSON changes through `/api/content`.

### `editor/editor-events.js`

This file binds DOM events to the state functions defined in `editor/editor.js`.

Examples:

- Site field `input` events call `syncSiteFields`
- Composer field changes call `syncCurrentPost`
- Toolbar controls call formatting helpers
- Image upload controls call the asset upload flows

### `editor/editor-helpers.js`

This file exposes `window.BlueshellEditorHelpers`.

Current responsibilities:

- Date sorting and formatting
- HTML sanitization for editor previews
- Lightweight Markdown rendering
- Safe image source validation
- Data URL file reading
- Slug generation
- HTML escaping

Important note:

- Some logic overlaps with `assets/content-helpers.js`, but the editor has its own helper surface because it loads separately and has different concerns like slug generation and editable-body normalization.

## Server Structure

`server.js` is a minimal `http.createServer` implementation.

### Static serving

- Resolves the request path relative to the repo root
- Serves files directly when they exist
- Serves `index.html` for directory requests that contain an index file
- Falls back to root `index.html` when no matching file exists

### Content API

- `GET /api/content`
  Returns `data/content.json`
- `POST /api/content`
  Parses JSON, validates the top-level shape, and overwrites `data/content.json`

Validation is intentionally light. It currently only checks that the payload contains:

- `site`
- `categories`
- `posts`

### Image API

- `GET /api/image-assets`
  Recursively lists image files under `assets/images/`
- `POST /api/image-assets`
  Accepts `{ filename, dataUrl, collection }`

Upload destinations:

- `collection === "post-covers"` -> `assets/images/post-covers/`
- any other collection -> `assets/images/post-buttons/`

The server normalizes filenames and adds numeric suffixes when a filename already exists.

## Data Flow

### Public site flow

1. Browser requests an HTML page
2. The page loads its route script plus `assets/content-helpers.js`
3. The route script fetches `data/content.json`
4. The route script renders DOM based on `site`, `categories`, and `posts`

### Editor flow

1. Browser requests `/editor/`
2. `editor/editor.js` checks that the host is local
3. The editor fetches `/api/content`
4. Changes are written into `editorState`
5. Save/autosave posts the full JSON document back to `/api/content`

### Image upload flow

1. The editor converts an uploaded file to a data URL
2. It posts the payload to `/api/image-assets`
3. The server writes the file under `assets/images/`
4. The returned path is stored in post content

## Content Model

The current JSON document has this top-level shape:

```json
{
  "site": {},
  "categories": [],
  "posts": []
}
```

### `site`

The current site object includes fields for:

- Branding and homepage copy
- Contact-page copy and links
- Editor labels
- Homepage panel configuration

Important keys currently in use:

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

### `homepagePanels`

Built-in IDs:

- `outline`
- `featured`
- `archive`

Supported panel types:

- `category-overview`
- `featured-posts`
- `archive-posts`
- `custom-content`

Behavioral notes:

- Built-in panels are normalized on load.
- `outline` and `featured` are used in the hero carousel.
- `archive` and any custom panels render in the homepage body.

### `categories`

Each category currently has:

- `id`
- `name`
- `description`

Behavioral note:

- Category `id` values are route-facing and case-sensitive.

### `posts`

Each post currently has:

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

Behavioral notes:

- Public pages ignore posts where `published === false`.
- The editor writes post bodies as rich HTML.
- Public rendering still supports lightweight Markdown for older content.

## Change Guide

When making changes, use this map:

- Change homepage layout or hero behavior -> `assets/app.js`
- Change contact page rendering -> `contact/contact-page.js`
- Change category page behavior -> `assets/category-page.js`
- Change post rendering or read-aloud behavior -> `assets/post-page.js`
- Change shared public helpers -> `assets/content-helpers.js`
- Change public visual styling -> `assets/styles.css`
- Change editor layout -> `editor/index.html` or `editor/editor.css`
- Change editor behavior -> `editor/editor.js` and `editor/editor-events.js`
- Change editor helper logic -> `editor/editor-helpers.js`
- Change site content -> `data/content.json`
- Change local API behavior -> `server.js`

## Known Constraints

- No bundler or module system. Script load order matters.
- No schema enforcement beyond a light top-level validation in `server.js`.
- Route parameters are query-string based instead of slug/path based.
- Unknown routes fall back to root `index.html`.
- The repo still contains some older naming in server logs and defaults.
