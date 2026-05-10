const {
  byNewestDate,
  formatDate,
  getEditableBodyHtml,
  renderPostBody,
  normalizeComposerHtml,
  getSafeImageSource,
  readFileAsDataUrl,
  slugify,
  escapeHtml,
  escapeAttribute,
} = window.BlueshellEditorHelpers;
const {
  expandInlineBlocks,
  renderStructuredContentBlocks,
  init: initWeiqiContent,
  normalizeWeiqiBlock,
  normalizeViewWindow,
  getDefaultViewWindow,
  normalizeAnimatedVariations,
  normalizePuzzleBranches,
  buildBoardSvg,
  getBoardAspectRatioValue,
  getCoordinateFromPointer: getWeiqiCoordinateFromPointer,
  getPointKey,
  buildStoneMap,
} = window.BlueshellWeiqi;
const weiqiTools = window.BlueshellEditorWeiqiTools;
const {
  assertBoardSize,
  assertCoordinateInBounds,
  validateUniqueStonePoints,
  validateStoneProgression,
  validatePuzzleBranches,
} = weiqiTools;

// Shared constants keep the editor and runtime aligned on valid Weiqi authoring options.
const WEIQI_BOARD_SIZES = [9, 13, 19];
const WEIQI_STONE_COLORS = new Set(["black", "white"]);
const WEIQI_MARKER_SHAPES = new Set(["", "circle", "square", "triangle", "cross"]);
const WEIQI_MARKER_MODES = new Set(["label-alpha", "label-numeric", "triangle", "square", "erase"]);

const editorState = {
  content: null,
  selectedPostId: null,
  search: "",
  composerOpen: false,
  composerPreviewVisible: true,
  buttonBuilderOpen: false,
  citationBuilderOpen: false,
  imageAssets: [],
  savedSelection: null,
  hasUnsavedChanges: false,
  saveInFlight: false,
  weiqiEditors: {},
  contentBlockDrag: null,
  weiqiViewportDrag: null,
};

// The editor mirrors built-in homepage panels but still allows custom panels to be appended.
const AUTO_SAVE_INTERVAL_MS = 60_000;

const BUILT_IN_HOME_PANELS = [
  {
    id: "outline",
    type: "category-overview",
    eyebrow: "Outline",
    title: "Four rooms, one archive.",
    description: "",
    enabled: true,
  },
  {
    id: "featured",
    type: "featured-posts",
    eyebrow: "Featured",
    title: "Current highlights",
    description: "",
    enabled: true,
  },
  {
    id: "archive",
    type: "archive-posts",
    eyebrow: "Archive",
    title: "Browse everything",
    description: "",
    enabled: true,
  },
];

const isLocalEnvironment = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);

const fields = {
  status: document.getElementById("status-message"),
  postList: document.getElementById("post-list"),
  postSearch: document.getElementById("post-search"),
  newPostButton: document.getElementById("new-post-button"),
  openPostEditorButton: document.getElementById("open-post-editor-button"),
  saveButton: document.getElementById("save-button"),
  exportButton: document.getElementById("export-button"),
  deletePostButton: document.getElementById("delete-post-button"),
  siteTitle: document.getElementById("site-title"),
  siteTagline: document.getElementById("site-tagline"),
  siteIntro: document.getElementById("site-intro"),
  contactDescription: document.getElementById("contact-description"),
  brandMark: document.getElementById("brand-mark"),
  heroEyebrow: document.getElementById("hero-eyebrow"),
  contactEyebrow: document.getElementById("contact-eyebrow"),
  contactLabel: document.getElementById("contact-label"),
  contactHref: document.getElementById("contact-href"),
  editorEyebrow: document.getElementById("editor-eyebrow"),
  editorTitle: document.getElementById("editor-title"),
  editorDescription: document.getElementById("editor-description"),
  editorEyebrowDisplay: document.getElementById("editor-eyebrow-display"),
  editorTitleDisplay: document.getElementById("editor-title-display"),
  editorDescriptionDisplay: document.getElementById("editor-description-display"),
  homePanelFields: document.getElementById("home-panel-fields"),
  newHomePanelButton: document.getElementById("new-home-panel-button"),
  postEditorHeading: document.getElementById("post-editor-heading"),
  postEditorCaption: document.getElementById("post-editor-caption"),
  postPreview: document.getElementById("post-preview"),
  postPreviewModal: document.getElementById("post-preview-modal"),
  openPublicPostLinkSummary: document.getElementById("open-public-post-link-summary"),
  openPublicPostLinkModal: document.getElementById("open-public-post-link"),
  postEditorModal: document.getElementById("post-editor-modal"),
  postEditorBackdrop: document.getElementById("post-editor-backdrop"),
  closePostEditorButton: document.getElementById("close-post-editor-button"),
  togglePreviewButton: document.getElementById("toggle-preview-button"),
  composerGrid: document.getElementById("composer-grid"),
  composerTitle: document.getElementById("composer-title"),
  composerSubtitle: document.getElementById("composer-subtitle"),
  insertImageButton: document.getElementById("insert-image-button"),
  imageUploadInput: document.getElementById("image-upload-input"),
  postId: document.getElementById("post-id"),
  postTitle: document.getElementById("post-title"),
  postCategory: document.getElementById("post-category"),
  postDate: document.getElementById("post-date"),
  postTags: document.getElementById("post-tags"),
  postPublishState: document.getElementById("post-publish-state"),
  postFeatured: document.getElementById("post-featured"),
  postSummary: document.getElementById("post-summary"),
  postCoverImage: document.getElementById("post-cover-image"),
  uploadCoverImageButton: document.getElementById("upload-cover-image-button"),
  coverImageUploadInput: document.getElementById("cover-image-upload-input"),
  addWeiqiBlockButton: document.getElementById("add-weiqi-block-button"),
  contentBlockFields: document.getElementById("content-block-fields"),
  postBodyEditor: document.getElementById("post-body-editor"),
  toolbar: document.querySelector(".toolbar"),
  fontFamilySelect: document.getElementById("font-family-select"),
  fontSizeSelect: document.getElementById("font-size-select"),
  textColorInput: document.getElementById("text-color-input"),
  highlightColorInput: document.getElementById("highlight-color-input"),
  insertButtonLinkButton: document.getElementById("insert-button-link-button"),
  insertCitationLinkButton: document.getElementById("insert-citation-link-button"),
  insertInlineWeiqiSelect: document.getElementById("insert-inline-weiqi-select"),
  insertInlineWeiqiButton: document.getElementById("insert-inline-weiqi-button"),
  buttonBuilderModal: document.getElementById("button-builder-modal"),
  buttonBuilderBackdrop: document.getElementById("button-builder-backdrop"),
  closeButtonBuilderButton: document.getElementById("close-button-builder-button"),
  saveButtonLinkButton: document.getElementById("save-button-link-button"),
  buttonLabelInput: document.getElementById("button-label-input"),
  buttonUrlInput: document.getElementById("button-url-input"),
  buttonLogoSelect: document.getElementById("button-logo-select"),
  buttonLogoUploadInput: document.getElementById("button-logo-upload-input"),
  buttonBuilderStatus: document.getElementById("button-builder-status"),
  citationBuilderModal: document.getElementById("citation-builder-modal"),
  citationBuilderBackdrop: document.getElementById("citation-builder-backdrop"),
  closeCitationBuilderButton: document.getElementById("close-citation-builder-button"),
  saveCitationLinkButton: document.getElementById("save-citation-link-button"),
  citationLabelInput: document.getElementById("citation-label-input"),
  citationUrlInput: document.getElementById("citation-url-input"),
  citationBuilderStatus: document.getElementById("citation-builder-status"),
};

async function initEditor() {
  // This UI writes back to local disk through the dev server, so block it outside localhost.
  if (!isLocalEnvironment) {
    document.body.innerHTML = `
      <main class="editor-main">
        <section class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Local editor</p>
              <h2>Unavailable here</h2>
            </div>
          </div>
          <p>This editor is intentionally only enabled on a local run of the site.</p>
          <p>Start the local server with <code>npm run dev</code>, then open <code>http://localhost:4321/editor/</code>.</p>
          <a href="/" class="text-link" style="color: var(--ink); border-color: var(--line);">Back to public site</a>
        </section>
      </main>
    `;
    return;
  }

  const response = await fetch("/api/content", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load editable content. Start the local server with `npm run dev`.");
  }

  editorState.content = await response.json();
  ensureHomePanels();
  document.execCommand("styleWithCSS", false, true);
  populateSiteFields();
  populateHomePanelFields();
  populateCategorySelect();

  const firstPost = [...editorState.content.posts].sort(byNewestDate)[0];
  if (firstPost) {
    selectPost(firstPost.id);
  } else {
    renderWorkspaceState();
  }

  renderPostList();
  setStatus("Loaded local content");
  window.setInterval(() => {
    void autoSaveChanges();
  }, AUTO_SAVE_INTERVAL_MS);
}

function populateSiteFields() {
  const { site } = editorState.content;
  fields.siteTitle.value = site.title || "";
  fields.siteTagline.value = site.tagline || "";
  fields.siteIntro.value = site.intro || "";
  fields.contactDescription.value = site.contactDescription || site.about || "";
  fields.brandMark.value = site.brandMark || "";
  fields.heroEyebrow.value = site.heroEyebrow || "";
  fields.contactEyebrow.value = site.contactEyebrow || site.aboutEyebrow || "";
  fields.contactLabel.value = site.contactLabel || "";
  fields.contactHref.value = site.contactHref || "";
  fields.editorEyebrow.value = site.editorEyebrow || "";
  fields.editorTitle.value = site.editorTitle || "";
  fields.editorDescription.value = site.editorDescription || "";
  renderEditorSidebarCopy();
}

function ensureHomePanels() {
  const currentPanels = Array.isArray(editorState.content.site.homepagePanels)
    ? editorState.content.site.homepagePanels
    : [];
  const customPanels = currentPanels.filter((panel) => !BUILT_IN_HOME_PANELS.some((preset) => preset.id === panel.id));

  editorState.content.site.homepagePanels = [
    ...BUILT_IN_HOME_PANELS.map((preset) => {
      const existing = currentPanels.find((panel) => panel.id === preset.id);
      return {
        ...preset,
        ...existing,
      };
    }),
    ...customPanels.map((panel) => ({
      enabled: true,
      eyebrow: "",
      title: "",
      description: "",
      body: "",
      type: "custom-content",
      ...panel,
    })),
  ];
}

function populateHomePanelFields() {
  const panels = editorState.content.site.homepagePanels || [];
  fields.homePanelFields.innerHTML = panels
    .map((panel, index) => {
      const isBuiltIn = BUILT_IN_HOME_PANELS.some((preset) => preset.id === panel.id);
      const bodyLabel = panel.type === "custom-content" ? "Body" : "Description";
      return `
        <div class="category-card home-panel-card">
          <div class="category-card-head">
            <div>
              <p class="workspace-kicker">${escapeHtml(getHomePanelTypeLabel(panel.type))}</p>
              <h3>${escapeHtml(panel.title || "Untitled section")}</h3>
            </div>
            ${
              isBuiltIn
                ? `<span class="panel-badge">Built in</span>`
                : `<button type="button" class="danger category-delete-button" data-home-panel-index="${index}">Delete</button>`
            }
          </div>
          <label class="checkbox-row">
            <input data-home-panel-index="${index}" data-key="enabled" type="checkbox" ${panel.enabled !== false ? "checked" : ""} />
            <span>Show this panel on the homepage</span>
          </label>
          <label>
            <span>Eyebrow</span>
            <input data-home-panel-index="${index}" data-key="eyebrow" type="text" value="${escapeHtml(panel.eyebrow || "")}" />
          </label>
          <label>
            <span>Title</span>
            <input data-home-panel-index="${index}" data-key="title" type="text" value="${escapeHtml(panel.title || "")}" />
          </label>
          <label class="full-width">
            <span>${bodyLabel}</span>
            <textarea data-home-panel-index="${index}" data-key="${panel.type === "custom-content" ? "body" : "description"}" rows="4">${escapeHtml(
              panel.type === "custom-content" ? panel.body || "" : panel.description || ""
            )}</textarea>
          </label>
        </div>
      `;
    })
    .join("");
}

function populateCategorySelect(selectedValue = getCurrentPost()?.category || fields.postCategory.value) {
  fields.postCategory.innerHTML = editorState.content.categories
    .map((category) => `<option value="${escapeAttribute(category.id)}">${escapeHtml(category.name)}</option>`)
    .join("");

  const nextValue =
    selectedValue && editorState.content.categories.some((category) => category.id === selectedValue)
      ? selectedValue
      : editorState.content.categories[0]?.id || "";
  fields.postCategory.value = nextValue;
}

function getDefaultWeiqiBlock(mode = "static") {
  // New blocks start from a fully normalized shape so downstream renderers can assume fields exist.
  return normalizeWeiqiBlock({
    type: "weiqi",
    mode,
    boardSize: 19,
    coordinateSystem: "zero-based",
    caption: mode === "puzzle" ? "New puzzle" : mode === "animated" ? "New animated sequence" : "New Weiqi block",
    initialPosition: [],
    markers: [],
    viewWindow: getDefaultViewWindow(19),
    animationChunks:
      mode === "animated"
        ? [
            {
              id: "chunk-1",
              label: "Chunk 1",
              caption: "",
              moves: [],
            },
          ]
        : [],
    playerSide: mode === "puzzle" ? "both" : undefined,
    prompt: mode === "puzzle" ? "Black to play. Find the best move." : "",
    stackGroup: "",
    branches:
      mode === "puzzle"
        ? [
            {
              id: "branch-1",
              label: "Branch 1",
              moves: [],
              outcome: "correct",
              message: "",
            },
          ]
        : [],
    defaultIncorrectMessage: mode === "puzzle" ? "That move does not match an authored variation." : "",
    explanation: "",
  });
}

function renderContentBlockFields(post) {
  const blocks = Array.isArray(post?.contentBlocks) ? post.contentBlocks : [];
  updateInlineWeiqiSelect(blocks);

  if (!blocks.length) {
    fields.contentBlockFields.innerHTML = `<p class="empty-state">No structured content blocks yet. Add a Weiqi block to create a board diagram, animation, or puzzle.</p>`;
    return;
  }

  fields.contentBlockFields.innerHTML = blocks.map((block, index) => renderContentBlockCard(block, index)).join("");
  initWeiqiContent(fields.contentBlockFields);
}

function updateInlineWeiqiSelect(blocks) {
  if (!fields.insertInlineWeiqiSelect) {
    return;
  }

  if (!blocks.length) {
    fields.insertInlineWeiqiSelect.innerHTML = `<option value="">No blocks yet</option>`;
    fields.insertInlineWeiqiButton.disabled = true;
    return;
  }

  fields.insertInlineWeiqiSelect.innerHTML = blocks
    .map((block, index) => {
      const label = block.caption ? `#${index + 1}: ${escapeHtml(block.caption)}` : `Block #${index + 1}`;
      return `<option value="${index}">${label}</option>`;
    })
    .join("");
  fields.insertInlineWeiqiButton.disabled = false;
}

function insertWeiqiBlockInline() {
  const index = parseInt(fields.insertInlineWeiqiSelect?.value, 10);
  if (isNaN(index)) {
    return;
  }

  const post = getCurrentPost();
  if (!post || !Array.isArray(post.contentBlocks) || index < 0 || index >= post.contentBlocks.length) {
    return;
  }

  const block = post.contentBlocks[index];
  const caption = block.caption ? escapeHtml(block.caption) : `Block ${index + 1}`;
  const html = `<div data-weiqi-block-index="${index}" contenteditable="false" class="weiqi-inline-placeholder"><span class="weiqi-inline-label">Weiqi: ${caption}</span></div><p></p>`;
  applyFormatting("insertHTML", html);
}

function renderContentBlockCard(block, index) {
  if (block.type !== "weiqi") {
    return `
      <section class="category-card content-block-card" data-content-block-card-index="${index}">
        <div class="category-card-head">
          <div>
            <p class="workspace-kicker">Structured block</p>
            <h3>${escapeHtml(block.type || "unknown")}</h3>
          </div>
          <button type="button" class="danger category-delete-button" data-content-block-index="${index}" data-action="delete-block">Delete</button>
        </div>
        <label class="full-width">
          <span>Raw JSON</span>
          <textarea data-raw-block rows="12">${escapeHtml(JSON.stringify(block, null, 2))}</textarea>
        </label>
      </section>
    `;
  }

  const normalizedBlock = normalizeWeiqiBlock(block);
  const editorKey = getWeiqiEditorKey(index);
  const editorUiState = getWeiqiEditorState(index, normalizedBlock);
  const activeSequence = getActiveSequence(normalizedBlock, editorUiState);
  const boardData = getEditorBoardData(normalizedBlock, editorUiState);
  const sequencePanel = renderWeiqiSequencePanel(normalizedBlock, editorUiState, index);
  const collapsedMarkup = renderStructuredContentBlocks([normalizedBlock]);
  const stackBadge = normalizedBlock.stackGroup
    ? `<span class="panel-badge">Stack ${escapeHtml(getPublicStackLabel(normalizedBlock.stackGroup))}</span>`
    : "";

  // The expanded editor uses the same renderer as the public site for the collapsed preview.
  return `
    <section
      class="category-card content-block-card"
      data-weiqi-card
      data-content-block-card-index="${index}"
    >
      <div class="category-card-head">
        <div>
          <p class="workspace-kicker">Structured block</p>
          <h3>Weiqi ${escapeHtml(getWeiqiModeLabel(normalizedBlock.mode))}</h3>
        </div>
        <div class="content-block-head-actions">
          <button type="button" class="secondary-ink content-block-drag-handle" draggable="true" data-drag-block-handle data-content-block-index="${index}">Move</button>
          ${stackBadge}
          <button type="button" class="secondary-ink" data-content-block-index="${index}" data-action="unstack-block" ${normalizedBlock.stackGroup ? "" : "disabled"}>Unstack</button>
          <button type="button" class="secondary-ink" data-content-block-index="${index}" data-action="${editorUiState.isOpen ? "close-weiqi-editor" : "open-weiqi-editor"}">${editorUiState.isOpen ? "Done" : "Edit"}</button>
          <button type="button" class="danger category-delete-button" data-content-block-index="${index}" data-action="delete-block">Delete</button>
        </div>
      </div>
      <div class="weiqi-editor-collapsed ${editorUiState.isOpen ? "hidden" : ""}">
        ${collapsedMarkup}
      </div>
      <div class="${editorUiState.isOpen ? "" : "hidden"}">
      <div class="form-grid post-grid">
        <label>
          <span>Type</span>
          <input data-weiqi-key="type" type="text" value="weiqi" readonly />
        </label>
        <label>
          <span>Mode</span>
          <select data-weiqi-key="mode">
            ${["static", "animated", "puzzle"]
              .map((mode) => `<option value="${mode}" ${normalizedBlock.mode === mode ? "selected" : ""}>${escapeHtml(getWeiqiModeLabel(mode))}</option>`)
              .join("")}
          </select>
        </label>
        <label>
          <span>Board size</span>
          <select data-weiqi-key="boardSize">
            ${WEIQI_BOARD_SIZES.map(
              (size) => `<option value="${size}" ${Number(normalizedBlock.boardSize) === size ? "selected" : ""}>${size} x ${size}</option>`
            ).join("")}
          </select>
        </label>
        <label class="full-width">
          <span>Caption</span>
          <input data-weiqi-key="caption" type="text" value="${escapeAttribute(normalizedBlock.caption || "")}" />
        </label>
        <label class="${normalizedBlock.mode === "puzzle" ? "" : "hidden"}" data-mode-section="puzzle">
          <span>Player side</span>
          <select data-weiqi-key="playerSide">
            <option value="both" ${normalizedBlock.playerSide !== "black" && normalizedBlock.playerSide !== "white" ? "selected" : ""}>Both sides</option>
            <option value="black" ${normalizedBlock.playerSide === "black" ? "selected" : ""}>Black to play</option>
            <option value="white" ${normalizedBlock.playerSide === "white" ? "selected" : ""}>White to play</option>
          </select>
        </label>
        <label class="full-width ${normalizedBlock.mode === "puzzle" ? "" : "hidden"}" data-mode-section="puzzle">
          <span>Prompt</span>
          <textarea data-weiqi-key="prompt" rows="3" placeholder="Black to play. Find the best move.">${escapeHtml(normalizedBlock.prompt || "")}</textarea>
        </label>
        <label class="full-width ${normalizedBlock.mode === "puzzle" ? "" : "hidden"}" data-mode-section="puzzle">
          <span>Explanation</span>
          <textarea data-weiqi-key="explanation" rows="4" placeholder="This move captures or creates the strongest shape.">${escapeHtml(
            normalizedBlock.explanation || ""
          )}</textarea>
        </label>
        <label class="full-width ${normalizedBlock.mode === "puzzle" ? "" : "hidden"}" data-mode-section="puzzle">
          <span>Default incorrect message</span>
          <textarea data-weiqi-key="defaultIncorrectMessage" rows="3" placeholder="Used when a move is not part of any authored continuation.">${escapeHtml(
            normalizedBlock.defaultIncorrectMessage || ""
          )}</textarea>
        </label>
      </div>
      <div class="weiqi-editor-layout weiqi-editor-layout--${escapeAttribute(normalizedBlock.mode)}" data-weiqi-editor data-content-block-index="${index}" data-editor-key="${escapeAttribute(editorKey)}">
        <div class="weiqi-editor-main">
          <div class="weiqi-editor-toolbar">
            <div class="weiqi-editor-tools">
              ${
                normalizedBlock.mode === "static"
                  ? `
                    <div class="weiqi-toolbox" role="toolbar" aria-label="Stone tools">
                      <button type="button" aria-label="Black stones" title="Black stones" class="weiqi-tool-button ${editorUiState.layer === "initial" && editorUiState.tool === "black" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="black" data-content-block-index="${index}"><span class="weiqi-tool-glyph">●</span></button>
                      <button type="button" aria-label="White stones" title="White stones" class="weiqi-tool-button ${editorUiState.layer === "initial" && editorUiState.tool === "white" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="white" data-content-block-index="${index}"><span class="weiqi-tool-glyph">○</span></button>
                      <button type="button" aria-label="Alternate black and white" title="Alternate (black first)" class="weiqi-tool-button ${editorUiState.layer === "initial" && editorUiState.tool === "alternate" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="alternate" data-content-block-index="${index}"><span class="weiqi-tool-glyph">●○</span></button>
                      <button type="button" aria-label="Erase stones" title="Erase stones" class="weiqi-tool-button ${editorUiState.layer === "initial" && editorUiState.tool === "erase" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="erase" data-content-block-index="${index}"><span class="weiqi-tool-glyph">✕</span></button>
                    </div>
                    <div class="weiqi-toolbox" role="toolbar" aria-label="Marker tools">
                      <button type="button" aria-label="Letter markers" title="Letter markers" class="weiqi-tool-button ${editorUiState.layer === "markers" && editorUiState.markerMode === "label-alpha" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="label-alpha" data-content-block-index="${index}"><span class="weiqi-tool-glyph">A</span></button>
                      <button type="button" aria-label="Number markers" title="Number markers" class="weiqi-tool-button ${editorUiState.layer === "markers" && editorUiState.markerMode === "label-numeric" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="label-numeric" data-content-block-index="${index}"><span class="weiqi-tool-glyph">1</span></button>
                      <button type="button" aria-label="Triangle markers" title="Triangle markers" class="weiqi-tool-button ${editorUiState.layer === "markers" && editorUiState.markerMode === "triangle" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="triangle" data-content-block-index="${index}"><span class="weiqi-tool-glyph">△</span></button>
                      <button type="button" aria-label="Square markers" title="Square markers" class="weiqi-tool-button ${editorUiState.layer === "markers" && editorUiState.markerMode === "square" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="square" data-content-block-index="${index}"><span class="weiqi-tool-glyph">□</span></button>
                      <button type="button" aria-label="Erase markers" title="Erase markers" class="weiqi-tool-button ${editorUiState.layer === "markers" && editorUiState.markerMode === "erase" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="erase" data-content-block-index="${index}"><span class="weiqi-tool-glyph">✕</span></button>
                    </div>
                  `
                  : `
                    <button type="button" class="secondary-ink ${editorUiState.layer === "initial" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="initial" data-content-block-index="${index}">Edit board</button>
                    ${
                      normalizedBlock.mode === "animated"
                        ? `<button type="button" class="secondary-ink ${editorUiState.layer === "variation" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="variation" data-content-block-index="${index}">Edit chunks</button>`
                        : ""
                    }
                    ${
                      normalizedBlock.mode === "puzzle"
                        ? `<button type="button" class="secondary-ink ${editorUiState.layer === "branch" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="branch" data-content-block-index="${index}">Edit branches</button>`
                        : ""
                    }
                    <button type="button" class="secondary-ink ${editorUiState.layer === "markers" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="markers" data-content-block-index="${index}">Markers</button>
                  `
              }
            </div>
            ${
              normalizedBlock.mode !== "static"
                ? `
                  <div class="weiqi-editor-tools">
                    ${
                      editorUiState.layer === "markers"
                        ? `
                          <div class="weiqi-toolbox" role="toolbar" aria-label="Marker tools">
                            <button type="button" aria-label="Letter markers" title="Letter markers" class="weiqi-tool-button ${editorUiState.markerMode === "label-alpha" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="label-alpha" data-content-block-index="${index}"><span class="weiqi-tool-glyph">A</span></button>
                            <button type="button" aria-label="Number markers" title="Number markers" class="weiqi-tool-button ${editorUiState.markerMode === "label-numeric" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="label-numeric" data-content-block-index="${index}"><span class="weiqi-tool-glyph">1</span></button>
                            <button type="button" aria-label="Triangle markers" title="Triangle markers" class="weiqi-tool-button ${editorUiState.markerMode === "triangle" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="triangle" data-content-block-index="${index}"><span class="weiqi-tool-glyph">△</span></button>
                            <button type="button" aria-label="Square markers" title="Square markers" class="weiqi-tool-button ${editorUiState.markerMode === "square" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="square" data-content-block-index="${index}"><span class="weiqi-tool-glyph">□</span></button>
                            <button type="button" aria-label="Erase markers" title="Erase markers" class="weiqi-tool-button ${editorUiState.markerMode === "erase" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="erase" data-content-block-index="${index}"><span class="weiqi-tool-glyph">✕</span></button>
                          </div>
                        `
                        : `
                          <div class="weiqi-toolbox" role="toolbar" aria-label="Stone tools">
                            <button type="button" aria-label="Black stones" title="Black stones" class="weiqi-tool-button ${editorUiState.tool === "black" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="black" data-content-block-index="${index}"><span class="weiqi-tool-glyph">●</span></button>
                            <button type="button" aria-label="White stones" title="White stones" class="weiqi-tool-button ${editorUiState.tool === "white" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="white" data-content-block-index="${index}"><span class="weiqi-tool-glyph">○</span></button>
                            <button type="button" aria-label="Erase stones" title="Erase stones" class="weiqi-tool-button ${editorUiState.tool === "erase" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="erase" data-content-block-index="${index}"><span class="weiqi-tool-glyph">✕</span></button>
                          </div>
                        `
                    }
                  </div>
                `
                : ""
            }
          </div>
          <div class="weiqi-editor-board-grid">
            <div class="weiqi-editor-overview-panel ${editorUiState.showOverview ? "" : "is-collapsed"}">
              <div class="weiqi-editor-overview-head">
                <p class="structured-block-label">Zoom window</p>
                <button type="button" class="secondary-ink" data-action="toggle-editor-overview" data-content-block-index="${index}" aria-expanded="${editorUiState.showOverview ? "true" : "false"}">${editorUiState.showOverview ? "Hide zoom window" : "Show zoom window"}</button>
              </div>
              ${
                editorUiState.showOverview
                  ? `
                    <div class="weiqi-board-shell weiqi-editor-overview-shell">
                      <div class="weiqi-board" data-overview-board data-content-block-index="${index}">${buildBoardSvg(
                        normalizedBlock,
                        boardData.allStones,
                        normalizedBlock.markers || [],
                        boardData.lastMove,
                        {
                          cropToFullBoard: true,
                          viewportOutline: normalizedBlock.viewWindow,
                          viewportHandles: true,
                        }
                      )}</div>
                    </div>
                    <p class="weiqi-editor-hint">Drag the crop box to move it. Drag any corner dot to resize it into a rectangular crop.</p>
                  `
                  : ""
              }
            </div>
            <div class="weiqi-editor-board-panel">
              <div class="weiqi-board-shell is-clickable weiqi-editor-board-shell">
                <div class="weiqi-board" data-editor-board data-content-block-index="${index}" style="--weiqi-board-aspect-ratio: ${escapeAttribute(
                  getBoardAspectRatioValue(normalizedBlock.boardSize, normalizedBlock.viewWindow)
                )};">${buildBoardSvg(
                  normalizedBlock,
                  boardData.stones,
                  boardData.markers,
                  boardData.lastMove,
                  { viewWindow: normalizedBlock.viewWindow }
                )}</div>
              </div>
              <p class="weiqi-editor-hint">${escapeHtml(getWeiqiEditorHint(normalizedBlock, editorUiState, activeSequence))}</p>
            </div>
          </div>
        </div>
        <aside class="weiqi-editor-sidebar">
          ${sequencePanel}
        </aside>
      </div>
      <input data-weiqi-key="coordinateSystem" type="hidden" value="zero-based" />
      <textarea data-weiqi-key="initialPosition" class="hidden">${escapeHtml(formatStoneLines(normalizedBlock.initialPosition))}</textarea>
      <textarea data-weiqi-key="markers" class="hidden">${escapeHtml(formatMarkerLines(normalizedBlock.markers))}</textarea>
      <textarea data-weiqi-key="animationChunks" class="hidden">${escapeHtml(JSON.stringify(normalizedBlock.animationChunks))}</textarea>
      <textarea data-weiqi-key="branches" class="hidden">${escapeHtml(JSON.stringify(normalizedBlock.branches))}</textarea>
      <input data-weiqi-key="stackGroup" type="hidden" value="${escapeAttribute(normalizedBlock.stackGroup || "")}" />
      <textarea data-weiqi-key="viewWindow" class="hidden">${escapeHtml(JSON.stringify(normalizedBlock.viewWindow))}</textarea>
      </div>
    </section>
  `;
}

function getPublicStackLabel(stackGroup) {
  return String(stackGroup || "")
    .replace(/^stack-/, "")
    .slice(0, 8)
    .toUpperCase();
}

function getWeiqiEditorKey(blockIndex) {
  return `${editorState.selectedPostId || "post"}:${blockIndex}`;
}

function getWeiqiEditorState(blockIndex, block) {
  const key = getWeiqiEditorKey(blockIndex);
  if (!editorState.weiqiEditors[key]) {
    editorState.weiqiEditors[key] = {
      isOpen: false,
      showOverview: true,
      mode: block.mode,
      layer: block.mode === "animated" ? "variation" : block.mode === "puzzle" ? "branch" : "initial",
      tool: block.mode === "static" ? "alternate" : "black",
      markerMode: "label-alpha",
      selectedChunkIndex: 0,
      selectedMoveIndex: 0,
      selectedBranchIndex: 0,
    };
  }

  const state = editorState.weiqiEditors[key];
  if (state.mode !== block.mode) {
    state.mode = block.mode;
    state.layer = block.mode === "animated" ? "variation" : block.mode === "puzzle" ? "branch" : "initial";
    state.tool = block.mode === "static" ? "alternate" : "black";
    state.selectedChunkIndex = 0;
    state.selectedMoveIndex = 0;
    state.selectedBranchIndex = 0;
  }
  if (block.mode === "static" && state.layer === "variation") {
    state.layer = "initial";
  }
  if (block.mode !== "puzzle" && state.layer === "branch") {
    state.layer = block.mode === "animated" ? "variation" : "initial";
  }
  if (block.mode === "puzzle") {
    state.selectedBranchIndex = Math.max(0, Math.min(state.selectedBranchIndex || 0, Math.max(0, (block.branches || []).length - 1)));
  }
  if (block.mode !== "animated") {
    state.selectedMoveIndex = 0;
  } else {
    state.selectedChunkIndex = Math.max(0, Math.min(state.selectedChunkIndex || 0, Math.max(0, (block.animationChunks || []).length - 1)));
    const selectedChunk = block.animationChunks?.[state.selectedChunkIndex] || block.animationChunks?.[0];
    const maxMoveIndex = Array.isArray(selectedChunk?.moves) ? selectedChunk.moves.length : 0;
    state.selectedMoveIndex = Math.max(0, Math.min(state.selectedMoveIndex || 0, maxMoveIndex));
  }
  return state;
}

function renderWeiqiSequencePanel(block, editorUiState, blockIndex) {
  if (block.mode === "animated") {
    const selectedChunk = block.animationChunks[editorUiState.selectedChunkIndex] || block.animationChunks[0];
    return `
      <div class="weiqi-sequence-panel">
        <div class="category-card-head">
          <div>
            <p class="structured-block-label">Animation chunks</p>
            <h3>${escapeHtml(selectedChunk?.label || "Chunk")}</h3>
          </div>
          <button type="button" class="secondary-ink" data-action="add-animation-chunk" data-content-block-index="${blockIndex}">Add chunk</button>
        </div>
        <div class="weiqi-sequence-list">
          ${block.animationChunks
            .map(
              (chunk, index) => `
                <button type="button" class="weiqi-sequence-chip ${index === editorUiState.selectedChunkIndex ? "is-active" : ""}" data-action="select-animation-chunk" data-content-block-index="${blockIndex}" data-chunk-index="${index}">
                  ${escapeHtml(chunk.label)} <span>${chunk.moves.length} moves</span>
                </button>
              `
            )
            .join("")}
        </div>
        ${
          selectedChunk
            ? `
              <label class="full-width">
                <span>Chunk label</span>
                <input data-action="rename-animation-chunk" data-content-block-index="${blockIndex}" value="${escapeAttribute(selectedChunk.label || "")}" />
              </label>
              <label class="full-width">
                <span>Dynamic caption</span>
                <textarea data-action="edit-animation-caption" data-content-block-index="${blockIndex}" rows="3">${escapeHtml(selectedChunk.caption || "")}</textarea>
              </label>
              <div class="weiqi-sequence-actions">
                <button type="button" class="secondary-ink" data-action="move-animation-chunk-up" data-content-block-index="${blockIndex}">Move up</button>
                <button type="button" class="secondary-ink" data-action="move-animation-chunk-down" data-content-block-index="${blockIndex}">Move down</button>
                <button type="button" class="secondary-ink" data-action="remove-last-sequence-move" data-content-block-index="${blockIndex}">Undo move</button>
                <button type="button" class="secondary-ink" data-action="clear-sequence" data-content-block-index="${blockIndex}">Clear chunk</button>
                ${
                  block.animationChunks.length > 1
                    ? `<button type="button" class="danger" data-action="delete-animation-chunk" data-content-block-index="${blockIndex}">Delete chunk</button>`
                    : ""
                }
              </div>
              <div class="weiqi-sequence-actions">
                <button type="button" class="secondary-ink" data-action="select-animation-move" data-content-block-index="${blockIndex}" data-move-index="0">Preview start</button>
              </div>
              <ol class="weiqi-move-list">${renderAnimationMoveList(selectedChunk.moves || [], editorUiState.selectedMoveIndex, blockIndex)}</ol>
            `
            : `<p class="weiqi-editor-hint">Add a chunk, then place moves on the board.</p>`
        }
      </div>
    `;
  }

  if (block.mode === "puzzle") {
    const selectedBranch = block.branches[editorUiState.selectedBranchIndex] || block.branches[0];
    return `
      <div class="weiqi-sequence-panel">
        <div class="category-card-head">
          <div>
            <p class="structured-block-label">Puzzle branches</p>
            <h3>${escapeHtml(selectedBranch?.label || "Branch")}</h3>
          </div>
          <button type="button" class="secondary-ink" data-action="add-puzzle-branch" data-content-block-index="${blockIndex}">Add branch</button>
        </div>
        <div class="weiqi-sequence-list">
          ${block.branches
            .map(
              (branch, index) => `
                <button type="button" class="weiqi-sequence-chip ${index === editorUiState.selectedBranchIndex ? "is-active" : ""}" data-action="select-puzzle-branch" data-content-block-index="${blockIndex}" data-branch-index="${index}">
                  ${escapeHtml(branch.label)} <span>${branch.moves.length} moves • ${escapeHtml(branch.outcome)}</span>
                </button>
              `
            )
            .join("")}
        </div>
        ${
          selectedBranch
            ? `
              <label class="full-width">
                <span>Branch label</span>
                <input data-action="rename-puzzle-branch" data-content-block-index="${blockIndex}" value="${escapeAttribute(selectedBranch.label || "")}" />
              </label>
              <label class="full-width">
                <span>Outcome</span>
                <select data-action="set-puzzle-branch-outcome" data-content-block-index="${blockIndex}">
                  <option value="correct" ${selectedBranch.outcome === "correct" ? "selected" : ""}>Correct</option>
                  <option value="incorrect" ${selectedBranch.outcome === "incorrect" ? "selected" : ""}>Incorrect</option>
                </select>
              </label>
              <label class="full-width">
                <span>Terminal message</span>
                <textarea data-action="edit-puzzle-branch-message" data-content-block-index="${blockIndex}" rows="3">${escapeHtml(selectedBranch.message || "")}</textarea>
              </label>
              <div class="weiqi-sequence-actions">
                <button type="button" class="secondary-ink" data-action="remove-last-puzzle-branch-move" data-content-block-index="${blockIndex}">Undo move</button>
                <button type="button" class="secondary-ink" data-action="clear-puzzle-branch" data-content-block-index="${blockIndex}">Clear branch</button>
                ${
                  block.branches.length > 1
                    ? `<button type="button" class="danger" data-action="delete-puzzle-branch" data-content-block-index="${blockIndex}">Delete branch</button>`
                    : ""
                }
              </div>
              <ol class="weiqi-move-list">${renderMoveList(selectedBranch.moves || [])}</ol>
            `
            : `<p class="weiqi-editor-hint">Add a branch, then place moves on the board.</p>`
        }
      </div>
    `;
  }

  return `
    <div class="weiqi-sequence-panel">
      <p class="structured-block-label">Static diagram</p>
      <p class="weiqi-editor-hint">Use Edit board to place stones. Switch to Markers to add labeled annotations on top of the position.</p>
    </div>
  `;
}

function renderMoveList(moves = []) {
  if (!moves.length) {
    return `<li class="weiqi-move-empty">No moves yet.</li>`;
  }

  return moves
    .map((move, index) => `<li>${index + 1}. ${escapeHtml(move.color)} at (${move.x}, ${move.y})</li>`)
    .join("");
}

function renderAnimationMoveList(moves = [], selectedMoveIndex, blockIndex) {
  if (!moves.length) {
    return `<li class="weiqi-move-empty">No moves yet.</li>`;
  }

  return moves
    .map((move, index) => {
      const moveIndex = index + 1;
      const markersCount = Array.isArray(move.markers) ? move.markers.length : 0;
      return `
        <li>
          <button
            type="button"
            class="weiqi-sequence-chip ${selectedMoveIndex === moveIndex ? "is-active" : ""}"
            data-action="select-animation-move"
            data-content-block-index="${blockIndex}"
            data-move-index="${moveIndex}"
          >
            ${moveIndex}. ${escapeHtml(move.color)} at (${move.x}, ${move.y}) <span>${markersCount} marker${markersCount === 1 ? "" : "s"}</span>
          </button>
        </li>
      `;
    })
    .join("");
}

function getWeiqiEditorHint(block, editorUiState, activeSequence) {
  if (editorUiState.layer === "markers") {
    if (block.mode === "animated") {
      return editorUiState.selectedMoveIndex
        ? "Marker mode. Click the board to add transient annotations for the selected move only."
        : "Marker mode. Select an animation move first, then click the board to annotate that move.";
    }
    if (editorUiState.markerMode === "label-alpha") {
      return "Marker mode. Click the board to place letter labels that increment A, B, C.";
    }
    if (editorUiState.markerMode === "label-numeric") {
      return "Marker mode. Click the board to place number labels that increment 1, 2, 3.";
    }
    if (editorUiState.markerMode === "triangle" || editorUiState.markerMode === "square") {
      return `Marker mode. Click the board to place ${editorUiState.markerMode} overlays on intersections or stones.`;
    }
    return "Marker mode. Click an existing marker to erase it.";
  }

  if (block.mode === "animated" && editorUiState.layer === "variation") {
    return `Sequence mode. Click the board to append moves to ${activeSequence?.label || "the selected chunk"}.`;
  }

  if (block.mode === "puzzle" && editorUiState.layer === "branch") {
    return `Branch mode. Click the board to build ${activeSequence?.label || "the selected branch"}, then mark its terminal outcome.`;
  }

  if (editorUiState.tool === "alternate") {
    return "Alternate mode. Click to place stones alternating black and white, starting with black.";
  }
  return "Board mode. Click to place stones on the initial position. Use the overview crop box to choose the visible area.";
}

function getActiveSequence(block, editorUiState) {
  if (block.mode === "animated") {
    return block.animationChunks[editorUiState.selectedChunkIndex] || block.animationChunks[0] || null;
  }
  if (block.mode === "puzzle" && editorUiState.layer === "branch") {
    return block.branches[editorUiState.selectedBranchIndex] || block.branches[0] || null;
  }
  return null;
}

function getEditorBoardData(block, editorUiState) {
  const previewSequence = getActiveSequence(block, editorUiState);
  let lastMove = null;
  let allStones = [...(block.initialPosition || [])];
  let overlayMarkers = block.markers || [];

  if (editorUiState.layer === "variation" && previewSequence) {
    const playbackState = getAnimatedEditorPlaybackState(block, editorUiState);
    allStones = [...(block.initialPosition || []), ...playbackState.moves];
    lastMove = playbackState.lastMove;
    overlayMarkers = [...(block.markers || []), ...buildSequenceMarkers(previewSequence?.moves || []), ...(playbackState.activeMove?.markers || [])];
  } else if (editorUiState.layer === "branch" && previewSequence) {
    allStones.push(...previewSequence.moves);
    lastMove = previewSequence.moves[previewSequence.moves.length - 1] || null;
    overlayMarkers = [...(block.markers || []), ...buildSequenceMarkers(previewSequence?.moves || [])];
  } else if (editorUiState.layer === "markers" && block.mode === "animated") {
    const playbackState = getAnimatedEditorPlaybackState(block, editorUiState);
    allStones = [...(block.initialPosition || []), ...playbackState.moves];
    lastMove = playbackState.lastMove;
    overlayMarkers = [...(block.markers || []), ...(playbackState.activeMove?.markers || [])];
  } else {
    lastMove = block.initialPosition[block.initialPosition.length - 1] || null;
    overlayMarkers = editorUiState.layer === "markers" ? block.markers || [] : block.markers || [];
  }

  return {
    stones: allStones,
    allStones,
    markers: overlayMarkers,
    lastMove,
  };
}

function buildSequenceMarkers(moves) {
  return moves.map((move, index) => ({
    x: move.x,
    y: move.y,
    label: String(index + 1),
  }));
}

function getAnimatedEditorPlaybackState(block, editorUiState) {
  const chunks = block.animationChunks || [];
  const selectedChunkIndex = Math.max(0, Math.min(editorUiState.selectedChunkIndex || 0, Math.max(0, chunks.length - 1)));
  const selectedMoveIndex = Math.max(0, editorUiState.selectedMoveIndex || 0);
  const moves = [];

  chunks.forEach((chunk, index) => {
    const chunkMoves = Array.isArray(chunk.moves) ? chunk.moves : [];
    if (index < selectedChunkIndex) {
      moves.push(...chunkMoves);
      return;
    }
    if (index === selectedChunkIndex) {
      moves.push(...chunkMoves.slice(0, selectedMoveIndex));
    }
  });

  const activeChunk = chunks[selectedChunkIndex] || null;
  const activeMove = activeChunk && selectedMoveIndex > 0 ? activeChunk.moves[selectedMoveIndex - 1] || null : null;
  return {
    moves,
    activeMove,
    lastMove: activeMove || moves[moves.length - 1] || null,
  };
}

function extractBlockIndexFromKey(key) {
  return Number(String(key).split(":").at(-1));
}

function getWeiqiModeLabel(mode) {
  if (mode === "animated") {
    return "Animated";
  }
  if (mode === "puzzle") {
    return "Puzzle";
  }
  return "Static";
}

function formatStoneLines(stones = []) {
  return (Array.isArray(stones) ? stones : [])
    .map((stone) => `${stone.color || "black"} ${stone.x} ${stone.y}`)
    .join("\n");
}

function formatMarkerLines(markers = []) {
  return (Array.isArray(markers) ? markers : [])
    .map((marker) => {
      const parts = [`${marker.x} ${marker.y}`];
      if (marker.label || marker.shape) {
        parts.push(marker.label || "");
      }
      if (marker.shape) {
        parts.push(marker.shape);
      }
      return parts.join(" | ");
    })
    .join("\n");
}

function serializeViewWindow(viewWindow) {
  return JSON.stringify(viewWindow || getDefaultViewWindow(19));
}

function renderPostList() {
  const query = editorState.search.trim().toLowerCase();
  const posts = [...editorState.content.posts]
    .filter((post) => {
      if (!query) {
        return true;
      }
      return [post.title, post.summary, ...(post.tags || [])].join(" ").toLowerCase().includes(query);
    })
    .sort(byNewestDate);

  fields.postList.innerHTML = posts
    .map((post) => {
      const classes = ["post-item"];
      if (post.id === editorState.selectedPostId) {
        classes.push("active");
      }
      if (!(post.title || "").trim()) {
        classes.push("is-draft");
      }
      classes.push(isPublished(post) ? "is-published" : "is-unpublished");

      const formatLabel = post.bodyFormat === "html" ? "Rich" : "Markdown";
      const publishLabel = isPublished(post) ? "Published" : "Unpublished";
      return `
        <button type="button" class="${classes.join(" ")}" data-post-id="${escapeAttribute(post.id)}">
          <strong>${escapeHtml(post.title || "Untitled")}</strong>
          <span>${escapeHtml(getCategoryName(post.category))} • ${escapeHtml(post.date || "No date")} • ${publishLabel} • ${formatLabel}</span>
        </button>
      `;
    })
    .join("");
}

function selectPost(postId, options = {}) {
  const post = editorState.content.posts.find((entry) => entry.id === postId);
  editorState.selectedPostId = post?.id ?? null;
  hydratePostUI(post ?? null);
  renderPostList();
  renderWorkspaceState();

  if (post && options.openComposer) {
    openComposer();
  }
}

function hydratePostUI(post) {
  if (!post) {
    fields.postId.value = "";
    fields.postTitle.value = "";
    fields.postCategory.value = editorState.content.categories[0]?.id || "";
    fields.postDate.value = "";
    fields.postTags.value = "";
    fields.postPublishState.value = "published";
    fields.postFeatured.checked = false;
    fields.postSummary.value = "";
    fields.postCoverImage.value = "";
    fields.contentBlockFields.innerHTML = `<p class="empty-state">No post selected.</p>`;
    fields.postBodyEditor.innerHTML = "";
    renderPostPreview(null);
    updatePublicLinks(null);
    return;
  }

  fields.postId.value = post.id || "";
  fields.postTitle.value = post.title || "";
  fields.postCategory.value = post.category || editorState.content.categories[0]?.id || "";
  fields.postDate.value = post.date || "";
  fields.postTags.value = (post.tags || []).join(", ");
  fields.postPublishState.value = isPublished(post) ? "published" : "unpublished";
  fields.postFeatured.checked = Boolean(post.featured);
  fields.postSummary.value = post.summary || "";
  fields.postCoverImage.value = post.coverImage || "";
  renderContentBlockFields(post);
  fields.postBodyEditor.innerHTML = getEditableBodyHtml(post);
  renderPostPreview(post);
  updatePublicLinks(post);
}

function renderWorkspaceState() {
  const post = getCurrentPost();
  if (!post) {
    fields.postEditorHeading.textContent = "Select a post from the sidebar or create a new one.";
    fields.postEditorCaption.textContent =
      "The composer opens in a focused overlay with formatting controls, image paste support, and a live preview.";
    fields.openPostEditorButton.disabled = true;
    fields.deletePostButton.disabled = true;
    fields.postPreview.classList.add("hidden");
    return;
  }

  fields.postEditorHeading.textContent = post.title || "Untitled";
  fields.postEditorCaption.textContent =
    `${isPublished(post) ? "Published" : "Unpublished"} post. ${
      post.bodyFormat === "html"
        ? "This post already uses the rich composer format."
        : "This post is currently Markdown-backed and will convert to rich HTML the next time you save it from the composer."
    }`;
  fields.openPostEditorButton.disabled = false;
  fields.deletePostButton.disabled = false;
  fields.postPreview.classList.remove("hidden");
}

function openComposer() {
  const post = getCurrentPost();
  if (!post) {
    return;
  }

  populateCategorySelect(post.category);
  editorState.composerOpen = true;
  fields.postEditorModal.classList.remove("hidden");
  fields.postEditorModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  fields.composerTitle.textContent = post.title || "Untitled";
  fields.composerSubtitle.textContent =
    "Write, format, paste images, then save everything back into the site content files.";
  applyComposerPreviewVisibility();
  window.setTimeout(() => {
    fields.postTitle.focus();
  }, 0);
}

function closeComposer() {
  editorState.composerOpen = false;
  closeButtonBuilder();
  closeCitationBuilder();
  fields.postEditorModal.classList.add("hidden");
  fields.postEditorModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function applyComposerPreviewVisibility() {
  const previewIsVisible = editorState.composerPreviewVisible;
  fields.postPreviewModal.parentElement.classList.toggle("hidden", !previewIsVisible);
  fields.composerGrid.classList.toggle("preview-hidden", !previewIsVisible);
  fields.togglePreviewButton.textContent = previewIsVisible ? "Hide preview" : "Show preview";
  fields.togglePreviewButton.setAttribute("aria-pressed", String(!previewIsVisible));
}

function toggleComposerPreview() {
  editorState.composerPreviewVisible = !editorState.composerPreviewVisible;
  applyComposerPreviewVisibility();
}

async function openButtonBuilder() {
  editorState.buttonBuilderOpen = true;
  await loadImageAssets();
  fields.buttonBuilderModal.classList.remove("hidden");
  fields.buttonBuilderModal.setAttribute("aria-hidden", "false");
  fields.buttonBuilderStatus.textContent =
    "Choose an existing image from assets/images or upload a new one into assets/images/post-buttons/.";
  fields.buttonLabelInput.focus();
}

function closeButtonBuilder() {
  editorState.buttonBuilderOpen = false;
  fields.buttonBuilderModal.classList.add("hidden");
  fields.buttonBuilderModal.setAttribute("aria-hidden", "true");
  fields.buttonLabelInput.value = "";
  fields.buttonUrlInput.value = "";
  fields.buttonLogoSelect.value = "";
  fields.buttonLogoUploadInput.value = "";
}

function openCitationBuilder() {
  editorState.citationBuilderOpen = true;
  fields.citationBuilderModal.classList.remove("hidden");
  fields.citationBuilderModal.setAttribute("aria-hidden", "false");
  fields.citationBuilderStatus.textContent = "This inserts a small inline citation link at your cursor position.";
  fields.citationLabelInput.focus();
}

function closeCitationBuilder() {
  editorState.citationBuilderOpen = false;
  fields.citationBuilderModal.classList.add("hidden");
  fields.citationBuilderModal.setAttribute("aria-hidden", "true");
  fields.citationLabelInput.value = "";
  fields.citationUrlInput.value = "";
}

async function loadImageAssets() {
  const response = await fetch("/api/image-assets", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load saved image assets.");
  }

  const payload = await response.json();
  editorState.imageAssets = payload.assets || [];
  fields.buttonLogoSelect.innerHTML = [
    `<option value="">No logo</option>`,
    ...editorState.imageAssets.map((asset) => `<option value="${escapeAttribute(asset.path)}">${escapeHtml(asset.path)}</option>`),
  ].join("");
}

async function uploadButtonLogo(file) {
  return uploadImageAsset(file, "post-buttons");
}

async function uploadCoverImageAsset(file) {
  return uploadImageAsset(file, "post-covers");
}

async function uploadImageAsset(file, collection) {
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch("/api/image-assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name,
      dataUrl,
      collection,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Could not save uploaded logo.");
  }

  return payload.path;
}

function buildPostButtonMarkup({ label, url, logoPath }) {
  const safeLabel = escapeHtml(label);
  const safeUrl = escapeAttribute(url);
  const isExternal = /^https?:\/\//i.test(url);
  const logoHtml = logoPath
    ? `<img class="post-link-button-logo" src="${escapeAttribute(logoPath)}" alt="" aria-hidden="true" />`
    : "";
  const extraAttrs = isExternal ? ` target="_blank" rel="noreferrer"` : "";
  return `<p><a class="post-link-button" href="${safeUrl}"${extraAttrs}>${logoHtml}<span>${safeLabel}</span></a></p>`;
}

function buildCitationMarkup({ label, url }) {
  const safeLabel = escapeHtml(label || "source");
  const safeUrl = escapeAttribute(url);
  const isExternal = /^https?:\/\//i.test(url);
  const extraAttrs = isExternal ? ` target="_blank" rel="noreferrer"` : "";
  return `<sup class="post-citation"><a href="${safeUrl}"${extraAttrs}>[${safeLabel}]</a></sup>`;
}

async function insertCustomButton() {
  const label = fields.buttonLabelInput.value.trim();
  const url = fields.buttonUrlInput.value.trim();
  if (!label || !url) {
    throw new Error("The button needs both a label and a URL.");
  }

  let logoPath = fields.buttonLogoSelect.value;
  const [uploadedFile] = fields.buttonLogoUploadInput.files || [];
  if (uploadedFile) {
    fields.buttonBuilderStatus.textContent = "Saving uploaded logo...";
    logoPath = await uploadButtonLogo(uploadedFile);
    await loadImageAssets();
  }

  applyFormatting("insertHTML", buildPostButtonMarkup({ label, url, logoPath }));
  closeButtonBuilder();
}

function insertCitationLink() {
  const label = fields.citationLabelInput.value.trim() || "source";
  const url = fields.citationUrlInput.value.trim();
  if (!url) {
    throw new Error("The citation needs a URL.");
  }

  applyFormatting("insertHTML", buildCitationMarkup({ label, url }));
  closeCitationBuilder();
}

function collectContentBlocksFromEditor(options = {}) {
  return weiqiTools.collectContentBlocksFromEditor(options);
}

function syncStructuredContentBlocks(options = {}) {
  return weiqiTools.syncStructuredContentBlocks(options);
}

function addWeiqiBlock(mode = "static") {
  return weiqiTools.addWeiqiBlock(mode);
}

function deleteContentBlock(blockIndex) {
  return weiqiTools.deleteContentBlock(blockIndex);
}

function handleWeiqiBoardPlacement(blockIndex, boardType, event) {
  return weiqiTools.handleWeiqiBoardPlacement(blockIndex, boardType, event);
}

function setWeiqiEditorLayer(blockIndex, layer) {
  return weiqiTools.setWeiqiEditorLayer(blockIndex, layer);
}

function setWeiqiEditorOpen(blockIndex, isOpen) {
  return weiqiTools.setWeiqiEditorOpen(blockIndex, isOpen);
}

function setWeiqiEditorTool(blockIndex, tool) {
  return weiqiTools.setWeiqiEditorTool(blockIndex, tool);
}

function setWeiqiEditorMarkerMode(blockIndex, markerMode) {
  return weiqiTools.setWeiqiEditorMarkerMode(blockIndex, markerMode);
}

function toggleWeiqiEditorOverview(blockIndex) {
  return weiqiTools.toggleWeiqiEditorOverview(blockIndex);
}

function beginContentBlockDrag(blockIndex) {
  clearContentBlockDropTarget();
  editorState.contentBlockDrag = {
    sourceIndex: blockIndex,
    targetIndex: null,
    targetSide: null,
  };
  const sourceCard = fields.contentBlockFields.querySelector(`.content-block-card[data-content-block-card-index="${blockIndex}"]`);
  sourceCard?.classList.add("is-drag-source");
}

function getContentBlockDropTargetFromPointer(card, event) {
  const rect = card.getBoundingClientRect();
  const pointerY = event.clientY - rect.top;
  const edgeBand = Math.max(44, Math.min(rect.height * 0.4, 120));
  if (pointerY <= edgeBand) {
    return "before";
  }
  if (pointerY >= rect.height - edgeBand) {
    return "after";
  }
  return pointerY < rect.height / 2 ? "before" : "after";
}

function setContentBlockDropTarget(targetIndex, targetSide) {
  editorState.contentBlockDrag = editorState.contentBlockDrag || { sourceIndex: null, targetIndex: null, targetSide: null };
  editorState.contentBlockDrag.targetIndex = targetIndex;
  editorState.contentBlockDrag.targetSide = targetSide;
  fields.contentBlockFields.querySelectorAll(".content-block-card").forEach((card) => {
    const cardIndex = Number(card.dataset.contentBlockCardIndex);
    const isTarget = cardIndex === targetIndex;
    card.classList.toggle("is-drop-target", isTarget);
    card.classList.toggle("is-drop-before", isTarget && targetSide === "before");
    card.classList.toggle("is-drop-after", isTarget && targetSide === "after");
    card.classList.toggle("is-drag-source", cardIndex === editorState.contentBlockDrag.sourceIndex);
  });
}

function clearContentBlockDropTarget() {
  fields.contentBlockFields.querySelectorAll(".content-block-card").forEach((card) => {
    card.classList.remove("is-drop-target", "is-drop-before", "is-drop-after", "is-drag-source");
  });
  if (editorState.contentBlockDrag) {
    editorState.contentBlockDrag.targetIndex = null;
    editorState.contentBlockDrag.targetSide = null;
  }
}

function endContentBlockDrag() {
  clearContentBlockDropTarget();
  editorState.contentBlockDrag = null;
}

function moveContentBlock(fromIndex, toIndex) {
  return weiqiTools.moveContentBlock(fromIndex, toIndex);
}

function stackWeiqiBlocks(firstIndex, secondIndex) {
  return weiqiTools.stackWeiqiBlocks(firstIndex, secondIndex);
}

function unstackWeiqiBlock(blockIndex) {
  return weiqiTools.unstackWeiqiBlock(blockIndex);
}

function addAnimatedVariation(blockIndex) {
  return weiqiTools.addAnimatedVariation(blockIndex);
}

function selectAnimatedVariation(blockIndex, variationIndex) {
  return weiqiTools.selectAnimatedVariation(blockIndex, variationIndex);
}

function renameAnimatedVariation(blockIndex, label) {
  return weiqiTools.renameAnimatedVariation(blockIndex, label);
}

function deleteAnimatedVariation(blockIndex) {
  return weiqiTools.deleteAnimatedVariation(blockIndex);
}

function removeLastVariationMove(blockIndex) {
  return weiqiTools.removeLastVariationMove(blockIndex);
}

function clearVariation(blockIndex) {
  return weiqiTools.clearVariation(blockIndex);
}

function renameAnimationCaption(blockIndex, caption) {
  return weiqiTools.renameAnimationCaption(blockIndex, caption);
}

function moveAnimationChunk(blockIndex, direction) {
  return weiqiTools.moveAnimationChunk(blockIndex, direction);
}

function selectAnimationMove(blockIndex, moveIndex) {
  return weiqiTools.selectAnimationMove(blockIndex, moveIndex);
}

function addPuzzleBranch(blockIndex) {
  return weiqiTools.addPuzzleBranch(blockIndex);
}

function selectPuzzleBranch(blockIndex, branchIndex) {
  return weiqiTools.selectPuzzleBranch(blockIndex, branchIndex);
}

function renamePuzzleBranch(blockIndex, label) {
  return weiqiTools.renamePuzzleBranch(blockIndex, label);
}

function setPuzzleBranchOutcome(blockIndex, outcome) {
  return weiqiTools.setPuzzleBranchOutcome(blockIndex, outcome);
}

function editPuzzleBranchMessage(blockIndex, message) {
  return weiqiTools.editPuzzleBranchMessage(blockIndex, message);
}

function deletePuzzleBranch(blockIndex) {
  return weiqiTools.deletePuzzleBranch(blockIndex);
}

function removeLastPuzzleBranchMove(blockIndex) {
  return weiqiTools.removeLastPuzzleBranchMove(blockIndex);
}

function clearPuzzleBranch(blockIndex) {
  return weiqiTools.clearPuzzleBranch(blockIndex);
}

function beginWeiqiViewportDrag(blockIndex, event) {
  return weiqiTools.beginWeiqiViewportDrag(blockIndex, event);
}

function continueWeiqiViewportDrag(event) {
  return weiqiTools.continueWeiqiViewportDrag(event);
}

function endWeiqiViewportDrag() {
  return weiqiTools.endWeiqiViewportDrag();
}

function syncSiteFields() {
  const { site } = editorState.content;
  site.title = fields.siteTitle.value.trim();
  site.tagline = fields.siteTagline.value.trim();
  site.intro = fields.siteIntro.value.trim();
  site.contactDescription = fields.contactDescription.value.trim();
  site.brandMark = fields.brandMark.value.trim();
  site.heroEyebrow = fields.heroEyebrow.value.trim();
  site.contactEyebrow = fields.contactEyebrow.value.trim();
  site.contactLabel = fields.contactLabel.value.trim();
  site.contactHref = fields.contactHref.value.trim();
  site.editorEyebrow = fields.editorEyebrow.value.trim();
  site.editorTitle = fields.editorTitle.value.trim();
  site.editorDescription = fields.editorDescription.value.trim();
  delete site.about;
  delete site.aboutEyebrow;
  renderEditorSidebarCopy();
  markDirty();
}

function syncHomePanelFields() {
  const panels = editorState.content.site.homepagePanels || [];
  const inputs = fields.homePanelFields.querySelectorAll("[data-home-panel-index]");
  inputs.forEach((input) => {
    const panelIndex = Number(input.dataset.homePanelIndex);
    const key = input.dataset.key;
    if (!panels[panelIndex]) {
      return;
    }

    panels[panelIndex][key] = input.type === "checkbox" ? input.checked : input.value.trim();
  });
  markDirty();
}

function createHomePanel() {
  syncHomePanelFields();
  const nextId = `custom-panel-${Date.now()}`;
  editorState.content.site.homepagePanels.push({
    id: nextId,
    type: "custom-content",
    eyebrow: "Extra",
    title: "New homepage panel",
    body: "Add copy for this custom homepage section.",
    enabled: true,
  });
  populateHomePanelFields();
  markDirty();
  setStatus("Added a new homepage panel");
}

function deleteHomePanel(panelIndex) {
  const panel = editorState.content.site.homepagePanels?.[panelIndex];
  if (!panel) {
    return;
  }

  editorState.content.site.homepagePanels.splice(panelIndex, 1);
  populateHomePanelFields();
  markDirty();
  setStatus(`Deleted homepage panel "${panel.title || panel.id}"`);
}

function syncCurrentPost() {
  const post = getCurrentPost();
  if (!post) {
    return;
  }

  post.id = slugify(fields.postId.value);
  post.title = fields.postTitle.value.trim();
  post.category = fields.postCategory.value;
  post.date = fields.postDate.value;
  post.tags = fields.postTags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  post.published = fields.postPublishState.value === "published";
  post.featured = fields.postFeatured.checked;
  post.summary = fields.postSummary.value.trim();
  post.coverImage = fields.postCoverImage.value.trim();
  post.body = normalizeComposerHtml(fields.postBodyEditor.innerHTML);
  post.bodyFormat = "html";

  editorState.selectedPostId = post.id;
  fields.postId.value = post.id;
  fields.composerTitle.textContent = post.title || "Untitled";
  renderPostPreview(post);
  updatePublicLinks(post);
  renderPostList();
  renderWorkspaceState();
  markDirty();
}

function syncAllFields() {
  syncSiteFields();
  syncHomePanelFields();
  syncCurrentPost();
  syncStructuredContentBlocks();
  populateCategorySelect(getCurrentPost()?.category);
}

function trySyncAllFields(statusPrefix = "Could not apply editor changes") {
  try {
    syncAllFields();
    return true;
  } catch (error) {
    setStatus(`${statusPrefix}: ${error.message}`);
    return false;
  }
}

function createPost() {
  if (!trySyncAllFields("Fix the current post before creating another")) {
    return;
  }
  const baseId = "new-post";
  let suffix = 1;
  let nextId = baseId;
  while (editorState.content.posts.some((post) => post.id === nextId)) {
    suffix += 1;
    nextId = `${baseId}-${suffix}`;
  }

  editorState.content.posts.unshift({
    id: nextId,
    title: "",
    category: editorState.content.categories[0]?.id || "personal",
    date: new Date().toISOString().slice(0, 10),
    summary: "",
    coverImage: "",
    published: false,
    featured: false,
    tags: [],
    contentBlocks: [],
    bodyFormat: "html",
    body: "<h2>Start here</h2><p>Write the first draft of this post.</p>",
  });

  populateCategorySelect(editorState.content.categories[0]?.id || "");
  selectPost(nextId, { openComposer: true });
  markDirty();
  setStatus("Created a new post draft");
}

function deleteCurrentPost() {
  const post = getCurrentPost();
  if (!post) {
    return;
  }

  const remainingPosts = editorState.content.posts.filter((entry) => entry.id !== post.id);
  editorState.content.posts = remainingPosts;
  const nextPost = [...remainingPosts].sort(byNewestDate)[0] || null;
  if (nextPost) {
    selectPost(nextPost.id);
  } else {
    editorState.selectedPostId = null;
    hydratePostUI(null);
    renderPostList();
    renderWorkspaceState();
  }
  closeComposer();
  markDirty();
  setStatus("Deleted the selected post");
}

async function saveAllChanges() {
  syncAllFields();
  validateBeforeSave();
  editorState.saveInFlight = true;
  setStatus("Saving...");

  try {
    const response = await fetch("/api/content", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(editorState.content, null, 2),
    });

    if (!response.ok) {
      throw new Error("Save failed.");
    }

    editorState.hasUnsavedChanges = false;
    setStatus("Saved to data/content.json and data/posts/");
  } finally {
    editorState.saveInFlight = false;
  }
}

function exportBackup() {
  if (!trySyncAllFields("Fix the current post before exporting")) {
    return;
  }
  const blob = new Blob([JSON.stringify(editorState.content, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = "blue-shell-almanac-backup.json";
  link.click();
  URL.revokeObjectURL(href);
  setStatus("Exported JSON backup");
}

function validateBeforeSave() {
  const postIds = editorState.content.posts.map((post) => post.id);
  const duplicates = postIds.filter((postId, index) => postIds.indexOf(postId) !== index);
  if (duplicates.length) {
    throw new Error(`Duplicate post slug: ${duplicates[0]}`);
  }

  if (editorState.content.posts.some((post) => !post.title.trim())) {
    throw new Error("Every post needs a title before saving.");
  }

  editorState.content.posts.forEach((post, index) => {
    if (!Array.isArray(post.contentBlocks)) {
      return;
    }

    post.contentBlocks.forEach((block, blockIndex) => {
      if (!block || typeof block !== "object") {
        throw new Error(`Post ${index + 1} block ${blockIndex + 1} is invalid.`);
      }

      if (typeof block.type !== "string" || !block.type.trim()) {
        throw new Error(`Post ${index + 1} block ${blockIndex + 1} needs a type.`);
      }

      if (block.type !== "weiqi") {
        return;
      }

      const normalizedBlock = normalizeWeiqiBlock(block);
      assertBoardSize(Number(normalizedBlock.boardSize));
      if ((normalizedBlock.coordinateSystem || "zero-based") !== "zero-based") {
        throw new Error(`Post ${index + 1} block ${blockIndex + 1} must use zero-based coordinates.`);
      }

      ["initialPosition"].forEach((key) => {
        if (!Array.isArray(normalizedBlock[key])) {
          return;
        }

        normalizedBlock[key].forEach((stone, stoneIndex) => {
          if (!WEIQI_STONE_COLORS.has(stone.color)) {
            throw new Error(`Post ${index + 1} block ${blockIndex + 1} ${key} item ${stoneIndex + 1} has an invalid color.`);
          }
          assertCoordinateInBounds(stone.x, stone.y, Number(normalizedBlock.boardSize), `${key} item ${stoneIndex + 1}`);
        });
      });

      validateUniqueStonePoints(normalizedBlock.initialPosition || [], "Initial position");
      let priorAnimationMoves = [];
      normalizedBlock.animationChunks.forEach((chunk) => {
        validateStoneProgression([...((normalizedBlock.initialPosition || [])), ...priorAnimationMoves], chunk.moves || [], chunk.label);
        priorAnimationMoves = [...priorAnimationMoves, ...(chunk.moves || [])];
      });
      validatePuzzleBranches(normalizedBlock.initialPosition || [], normalizedBlock.branches || [], "Puzzle branch", normalizedBlock.playerSide || "both");

      (normalizedBlock.markers || []).forEach((marker, markerIndex) => {
        assertCoordinateInBounds(marker.x, marker.y, Number(normalizedBlock.boardSize), `marker ${markerIndex + 1}`);
        if (marker.shape && !WEIQI_MARKER_SHAPES.has(marker.shape)) {
          throw new Error(`Post ${index + 1} block ${blockIndex + 1} marker ${markerIndex + 1} has an invalid shape.`);
        }
      });

      normalizedBlock.branches.forEach((branch, branchIndex) => {
        if (branch.message != null && typeof branch.message !== "string") {
          throw new Error(`Post ${index + 1} block ${blockIndex + 1} branch ${branchIndex + 1} needs a string message.`);
        }
      });

      if (normalizedBlock.mode === "puzzle" && !(normalizedBlock.prompt || "").trim()) {
        throw new Error(`Post ${index + 1} block ${blockIndex + 1} puzzle needs a prompt.`);
      }

      if (normalizedBlock.explanation != null && typeof normalizedBlock.explanation !== "string") {
        throw new Error(`Post ${index + 1} block ${blockIndex + 1} explanation must be a string.`);
      }

      if (normalizedBlock.viewWindow) {
        ["xMin", "yMin", "xMax", "yMax"].forEach((key) => {
          if (!Number.isInteger(normalizedBlock.viewWindow[key])) {
            throw new Error(`Post ${index + 1} block ${blockIndex + 1} view window is invalid.`);
          }
        });
      }

      normalizeViewWindow(normalizedBlock.boardSize, normalizedBlock.viewWindow);
      normalizedBlock.branches.forEach((branch, branchIndex) => {
        (branch.moves || []).forEach((stone, stoneIndex) => {
          if (!WEIQI_STONE_COLORS.has(stone.color)) {
            throw new Error(`Post ${index + 1} block ${blockIndex + 1} branch ${branchIndex + 1} move ${stoneIndex + 1} has an invalid color.`);
          }
          assertCoordinateInBounds(stone.x, stone.y, Number(normalizedBlock.boardSize), `branch ${branchIndex + 1} move ${stoneIndex + 1}`);
        });
      });
      normalizedBlock.animationChunks.forEach((chunk) => {
        (chunk.moves || []).forEach((stone, stoneIndex) => {
          if (!WEIQI_STONE_COLORS.has(stone.color)) {
            throw new Error(`Post ${index + 1} block ${blockIndex + 1} animation move ${stoneIndex + 1} has an invalid color.`);
          }
          assertCoordinateInBounds(stone.x, stone.y, Number(normalizedBlock.boardSize), `animation move ${stoneIndex + 1}`);
          (stone.markers || []).forEach((marker, markerIndex) => {
            assertCoordinateInBounds(marker.x, marker.y, Number(normalizedBlock.boardSize), `animation marker ${markerIndex + 1}`);
            if (marker.shape && !WEIQI_MARKER_SHAPES.has(marker.shape)) {
              throw new Error(`Post ${index + 1} block ${blockIndex + 1} animation marker ${markerIndex + 1} has an invalid shape.`);
            }
          });
        });
      });
    });
  });
}

function renderPostPreview(post) {
  const targets = [fields.postPreview, fields.postPreviewModal];

  if (!post) {
    targets.forEach((target) => {
      target.innerHTML = `<p class="empty-state">Select or create a post to preview it here.</p>`;
    });
    return;
  }

  const bodyHtml = renderPostBody(post);
  const coverImage = getSafeImageSource(post.coverImage);
  const markup = `
    <p class="eyebrow">${escapeHtml(getCategoryName(post.category))}</p>
    <h3 class="preview-title">${escapeHtml(post.title || "Untitled")}</h3>
    <div class="preview-meta">
      <span class="preview-chip">${escapeHtml(formatDate(post.date || new Date().toISOString().slice(0, 10)))}</span>
      <span class="preview-chip">${isPublished(post) ? "Published" : "Unpublished"}</span>
      ${post.featured ? `<span class="preview-chip">Featured</span>` : ""}
      <span class="preview-chip">${post.bodyFormat === "html" ? "Rich HTML" : "Markdown"}</span>
    </div>
    <p class="preview-summary">${escapeHtml(post.summary || "Add a summary to preview the lead text here.")}</p>
    ${
      coverImage
        ? `<img class="preview-cover-image" src="${escapeAttribute(coverImage)}" alt="${escapeAttribute(post.title || "Post cover image")}" />`
        : ""
    }
    <div class="preview-tags">
      ${
        (post.tags || []).length
          ? post.tags.map((tag) => `<span class="preview-tag">${escapeHtml(tag)}</span>`).join("")
          : `<span class="preview-tag">No tags yet</span>`
      }
    </div>
    <div class="preview-body">${bodyHtml}</div>
    <div data-trailing-preview-blocks></div>
  `;

  targets.forEach((target) => {
    target.innerHTML = markup;

    const previewBodyEl = target.querySelector(".preview-body");
    const trailingEl = target.querySelector("[data-trailing-preview-blocks]");
    const inlinedIndices = expandInlineBlocks(previewBodyEl, post.contentBlocks);
    const remainingBlocks = (post.contentBlocks || []).filter((_, i) => !inlinedIndices.has(i));
    if (remainingBlocks.length) {
      trailingEl.outerHTML = renderStructuredContentBlocks(remainingBlocks);
    } else {
      trailingEl.remove();
    }

    initWeiqiContent(target);
  });
}

function renderEditorSidebarCopy() {
  const { site } = editorState.content;
  fields.editorEyebrowDisplay.textContent = site.editorEyebrow || "Local editor";
  fields.editorTitleDisplay.textContent = site.editorTitle || site.title || "Blue Shell Almanac";
  fields.editorDescriptionDisplay.textContent =
    site.editorDescription || "Manage site copy and posts here. Saving writes directly to data/content.json and data/posts/.";
}

function updatePublicLinks(post) {
  const href = post ? `/post/?post=${encodeURIComponent(post.id)}` : "/";
  fields.openPublicPostLinkSummary.href = href;
  fields.openPublicPostLinkModal.href = href;
}

function getCurrentPost() {
  return editorState.content.posts.find((entry) => entry.id === editorState.selectedPostId) || null;
}

function isPublished(post) {
  return post.published !== false;
}

function getHomePanelTypeLabel(type) {
  if (type === "category-overview") {
    return "Outline panel";
  }
  if (type === "featured-posts") {
    return "Featured panel";
  }
  if (type === "archive-posts") {
    return "Archive panel";
  }
  return "Custom panel";
}

function getCategoryName(categoryId) {
  return editorState.content.categories.find((category) => category.id === categoryId)?.name ?? categoryId;
}

function saveComposerSelection() {
  const selection = window.getSelection();
  if (!selection.rangeCount) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (fields.postBodyEditor.contains(range.commonAncestorContainer)) {
    editorState.savedSelection = range.cloneRange();
  }
}

function restoreComposerSelection() {
  if (!editorState.savedSelection) {
    return;
  }

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(editorState.savedSelection);
}

function applyFormatting(command, value) {
  fields.postBodyEditor.focus();
  restoreComposerSelection();
  document.execCommand(command, false, value);
  saveComposerSelection();
  syncCurrentPost();
}

async function handleImageFile(file) {
  if (!file) {
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const safeAlt = file.name ? escapeAttribute(file.name.replace(/\.[^.]+$/, "")) : "Pasted image";
  applyFormatting("insertHTML", `<figure><img src="${dataUrl}" alt="${safeAlt}" /></figure><p></p>`);
}

async function setCoverImageFromFile(file) {
  if (!file) {
    return;
  }

  setStatus("Saving cover image...");
  const coverImagePath = await uploadCoverImageAsset(file);
  fields.postCoverImage.value = coverImagePath;
  syncCurrentPost();
  setStatus("Saved cover image into assets/images/post-covers/");
}

weiqiTools.configure({
  editorState,
  fields,
  getCurrentPost,
  getDefaultWeiqiBlock,
  getWeiqiEditorState,
  renderContentBlockFields,
  renderPostPreview,
  setStatus: (message) => window.setStatus(message),
  markDirty: () => window.markDirty(),
});
