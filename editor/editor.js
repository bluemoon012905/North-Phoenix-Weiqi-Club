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
  renderStructuredContentBlocks,
  init: initWeiqiContent,
  normalizeWeiqiBlock,
  normalizeViewWindow,
  getDefaultViewWindow,
  normalizeAnimatedVariations,
  normalizePuzzleSuccessSequence,
  normalizePuzzleFailureSequences,
  buildBoardSvg,
  getCoordinateFromPointer: getWeiqiCoordinateFromPointer,
  getPointKey,
  buildStoneMap,
} = window.BlueshellWeiqi;

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
  weiqiViewportDrag: null,
};

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
  return normalizeWeiqiBlock({
    type: "weiqi",
    mode,
    boardSize: 19,
    coordinateSystem: "zero-based",
    caption: mode === "puzzle" ? "New puzzle" : mode === "animated" ? "New animated sequence" : "New Weiqi block",
    initialPosition: [],
    markers: [],
    viewWindow: getDefaultViewWindow(19),
    variations:
      mode === "animated"
        ? [
            {
              id: "variation-1",
              label: "Variation 1",
              moves: [],
            },
          ]
        : [],
    prompt: mode === "puzzle" ? "Black to play. Find the best move." : "",
    successSequence: mode === "puzzle" ? [] : [],
    failureSequences: mode === "puzzle" ? [{ id: "failure-1", label: "Failure 1", moves: [], message: "" }] : [],
    explanation: "",
  });
}

function renderContentBlockFields(post) {
  const blocks = Array.isArray(post?.contentBlocks) ? post.contentBlocks : [];
  if (!blocks.length) {
    fields.contentBlockFields.innerHTML = `<p class="empty-state">No structured content blocks yet. Add a Weiqi block to create a board diagram, animation, or puzzle.</p>`;
    return;
  }

  fields.contentBlockFields.innerHTML = blocks
    .map((block, index) => renderContentBlockCard(block, index))
    .join("");
  initWeiqiContent(fields.contentBlockFields);
}

function renderContentBlockCard(block, index) {
  if (block.type !== "weiqi") {
    return `
      <section class="category-card content-block-card">
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

  return `
    <section class="category-card content-block-card" data-weiqi-card>
      <div class="category-card-head">
        <div>
          <p class="workspace-kicker">Structured block</p>
          <h3>Weiqi ${escapeHtml(getWeiqiModeLabel(normalizedBlock.mode))}</h3>
        </div>
        <div class="content-block-head-actions">
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
      </div>
      <div class="weiqi-editor-layout weiqi-editor-layout--${escapeAttribute(normalizedBlock.mode)}" data-weiqi-editor data-content-block-index="${index}" data-editor-key="${escapeAttribute(editorKey)}">
        <div class="weiqi-editor-main">
          <div class="weiqi-editor-toolbar">
            <div class="weiqi-editor-tools">
              <button type="button" class="secondary-ink ${editorUiState.layer === "initial" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="initial" data-content-block-index="${index}">Edit board</button>
              ${
                normalizedBlock.mode === "animated"
                  ? `<button type="button" class="secondary-ink ${editorUiState.layer === "variation" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="variation" data-content-block-index="${index}">Add sequence</button>`
                  : ""
              }
              ${
                normalizedBlock.mode === "puzzle"
                  ? `<button type="button" class="secondary-ink ${editorUiState.layer === "success" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="success" data-content-block-index="${index}">Edit success</button>
                     <button type="button" class="secondary-ink ${editorUiState.layer === "failure" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="failure" data-content-block-index="${index}">Edit failure</button>`
                  : ""
              }
              <button type="button" class="secondary-ink ${editorUiState.layer === "markers" ? "is-active" : ""}" data-action="set-editor-layer" data-editor-layer="markers" data-content-block-index="${index}">Markers</button>
            </div>
            <div class="weiqi-editor-tools">
              ${
                editorUiState.layer === "markers"
                  ? `
                    <button type="button" class="secondary-ink ${editorUiState.markerMode === "label-alpha" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="label-alpha" data-content-block-index="${index}">A</button>
                    <button type="button" class="secondary-ink ${editorUiState.markerMode === "label-numeric" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="label-numeric" data-content-block-index="${index}">1</button>
                    <button type="button" class="secondary-ink ${editorUiState.markerMode === "triangle" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="triangle" data-content-block-index="${index}">Triangle</button>
                    <button type="button" class="secondary-ink ${editorUiState.markerMode === "square" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="square" data-content-block-index="${index}">Square</button>
                    <button type="button" class="secondary-ink ${editorUiState.markerMode === "erase" ? "is-active" : ""}" data-action="set-editor-marker-mode" data-editor-marker-mode="erase" data-content-block-index="${index}">Erase</button>
                  `
                  : `
                    <button type="button" class="secondary-ink ${editorUiState.tool === "black" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="black" data-content-block-index="${index}">Black</button>
                    <button type="button" class="secondary-ink ${editorUiState.tool === "white" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="white" data-content-block-index="${index}">White</button>
                    <button type="button" class="secondary-ink ${editorUiState.tool === "erase" ? "is-active" : ""}" data-action="set-editor-tool" data-editor-tool="erase" data-content-block-index="${index}">Erase</button>
                  `
              }
            </div>
          </div>
          <div class="weiqi-editor-board-grid">
            <div class="weiqi-editor-board-panel">
              <div class="weiqi-board-shell is-clickable weiqi-editor-board-shell">
                <div class="weiqi-board" data-editor-board data-content-block-index="${index}">${buildBoardSvg(
                  normalizedBlock,
                  boardData.stones,
                  boardData.markers,
                  boardData.lastMove,
                  { viewWindow: normalizedBlock.viewWindow }
                )}</div>
              </div>
              <p class="weiqi-editor-hint">${escapeHtml(getWeiqiEditorHint(normalizedBlock, editorUiState, activeSequence))}</p>
            </div>
            <div class="weiqi-editor-overview-panel">
              <p class="structured-block-label">Zoom window</p>
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
      <textarea data-weiqi-key="variations" class="hidden">${escapeHtml(JSON.stringify(normalizedBlock.variations))}</textarea>
      <textarea data-weiqi-key="successSequence" class="hidden">${escapeHtml(formatStoneLines(normalizedBlock.successSequence))}</textarea>
      <textarea data-weiqi-key="failureSequences" class="hidden">${escapeHtml(JSON.stringify(normalizedBlock.failureSequences))}</textarea>
      <textarea data-weiqi-key="viewWindow" class="hidden">${escapeHtml(JSON.stringify(normalizedBlock.viewWindow))}</textarea>
      </div>
    </section>
  `;
}

function getWeiqiEditorKey(blockIndex) {
  return `${editorState.selectedPostId || "post"}:${blockIndex}`;
}

function getWeiqiEditorState(blockIndex, block) {
  const key = getWeiqiEditorKey(blockIndex);
  if (!editorState.weiqiEditors[key]) {
    editorState.weiqiEditors[key] = {
      isOpen: false,
      layer: block.mode === "animated" ? "variation" : block.mode === "puzzle" ? "success" : "initial",
      tool: "black",
      markerMode: "label-alpha",
      selectedVariationIndex: 0,
      selectedFailureIndex: 0,
    };
  }

  const state = editorState.weiqiEditors[key];
  if (block.mode === "static" && state.layer === "variation") {
    state.layer = "initial";
  }
  if (block.mode !== "puzzle" && (state.layer === "success" || state.layer === "failure")) {
    state.layer = block.mode === "animated" ? "variation" : "initial";
  }
  return state;
}

function renderWeiqiSequencePanel(block, editorUiState, blockIndex) {
  if (block.mode === "animated") {
    const selectedVariation = block.variations[editorUiState.selectedVariationIndex] || block.variations[0];
    return `
      <div class="weiqi-sequence-panel">
        <div class="category-card-head">
          <div>
            <p class="structured-block-label">Animation versions</p>
            <h3>${escapeHtml(selectedVariation?.label || "Variation")}</h3>
          </div>
          <button type="button" class="secondary-ink" data-action="add-variation" data-content-block-index="${blockIndex}">Add version</button>
        </div>
        <div class="weiqi-sequence-list">
          ${block.variations
            .map(
              (variation, index) => `
                <button type="button" class="weiqi-sequence-chip ${index === editorUiState.selectedVariationIndex ? "is-active" : ""}" data-action="select-variation-editor" data-content-block-index="${blockIndex}" data-variation-index="${index}">
                  ${escapeHtml(variation.label)} <span>${variation.moves.length} moves</span>
                </button>
              `
            )
            .join("")}
        </div>
        <label class="full-width">
          <span>Version label</span>
          <input data-action="rename-variation" data-content-block-index="${blockIndex}" value="${escapeAttribute(selectedVariation?.label || "")}" />
        </label>
        <div class="weiqi-sequence-actions">
          <button type="button" class="secondary-ink" data-action="remove-last-sequence-move" data-content-block-index="${blockIndex}">Undo move</button>
          <button type="button" class="secondary-ink" data-action="clear-sequence" data-content-block-index="${blockIndex}">Clear version</button>
          ${
            block.variations.length > 1
              ? `<button type="button" class="danger" data-action="delete-variation" data-content-block-index="${blockIndex}">Delete version</button>`
              : ""
          }
        </div>
        <ol class="weiqi-move-list">${renderMoveList(selectedVariation?.moves || [])}</ol>
      </div>
    `;
  }

  if (block.mode === "puzzle") {
    const selectedFailure = block.failureSequences[editorUiState.selectedFailureIndex] || block.failureSequences[0];
    return `
      <div class="weiqi-sequence-panel">
        <div>
          <p class="structured-block-label">Success line</p>
          <div class="weiqi-sequence-actions">
            <button type="button" class="secondary-ink" data-action="remove-last-success-move" data-content-block-index="${blockIndex}">Undo success move</button>
            <button type="button" class="secondary-ink" data-action="clear-success" data-content-block-index="${blockIndex}">Clear success</button>
          </div>
          <ol class="weiqi-move-list">${renderMoveList(block.successSequence)}</ol>
        </div>
        <div class="category-card-head">
          <div>
            <p class="structured-block-label">Failure lines</p>
            <h3>${escapeHtml(selectedFailure?.label || "Failure")}</h3>
          </div>
          <button type="button" class="secondary-ink" data-action="add-failure-sequence" data-content-block-index="${blockIndex}">Add failure</button>
        </div>
        <div class="weiqi-sequence-list">
          ${block.failureSequences
            .map(
              (failureSequence, index) => `
                <button type="button" class="weiqi-sequence-chip ${index === editorUiState.selectedFailureIndex ? "is-active" : ""}" data-action="select-failure-sequence" data-content-block-index="${blockIndex}" data-failure-index="${index}">
                  ${escapeHtml(failureSequence.label)} <span>${failureSequence.moves.length} moves</span>
                </button>
              `
            )
            .join("")}
        </div>
        ${
          selectedFailure
            ? `
              <label class="full-width">
                <span>Failure label</span>
                <input data-action="rename-failure-sequence" data-content-block-index="${blockIndex}" value="${escapeAttribute(selectedFailure.label || "")}" />
              </label>
              <label class="full-width">
                <span>Failure message</span>
                <textarea data-action="edit-failure-message" data-content-block-index="${blockIndex}" rows="3">${escapeHtml(selectedFailure.message || "")}</textarea>
              </label>
              <div class="weiqi-sequence-actions">
                <button type="button" class="secondary-ink" data-action="remove-last-failure-move" data-content-block-index="${blockIndex}">Undo failure move</button>
                <button type="button" class="secondary-ink" data-action="clear-failure-sequence" data-content-block-index="${blockIndex}">Clear failure</button>
                ${
                  block.failureSequences.length > 1
                    ? `<button type="button" class="danger" data-action="delete-failure-sequence" data-content-block-index="${blockIndex}">Delete failure</button>`
                    : ""
                }
              </div>
              <ol class="weiqi-move-list">${renderMoveList(selectedFailure.moves || [])}</ol>
            `
            : `<p class="weiqi-editor-hint">Add a failure line, then place moves on the board.</p>`
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

function getWeiqiEditorHint(block, editorUiState, activeSequence) {
  if (editorUiState.layer === "markers") {
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
    return `Sequence mode. Click the board to append moves to ${activeSequence?.label || "the selected variation"}.`;
  }

  if (block.mode === "puzzle" && editorUiState.layer === "success") {
    return "Success mode. Click the board to build the correct answer sequence.";
  }

  if (block.mode === "puzzle" && editorUiState.layer === "failure") {
    return `Failure mode. Click the board to build ${activeSequence?.label || "the selected failure line"}.`;
  }

  return "Board mode. Click to place stones on the initial position. Use the overview crop box to choose the visible area.";
}

function getActiveSequence(block, editorUiState) {
  if (block.mode === "animated") {
    return block.variations[editorUiState.selectedVariationIndex] || block.variations[0] || null;
  }
  if (block.mode === "puzzle" && editorUiState.layer === "failure") {
    return block.failureSequences[editorUiState.selectedFailureIndex] || block.failureSequences[0] || null;
  }
  if (block.mode === "puzzle" && editorUiState.layer === "success") {
    return { label: "Success line", moves: block.successSequence || [] };
  }
  return null;
}

function getEditorBoardData(block, editorUiState) {
  const allStones = [...(block.initialPosition || [])];
  const previewSequence = getActiveSequence(block, editorUiState);
  let lastMove = null;

  if (editorUiState.layer === "variation" && previewSequence) {
    allStones.push(...previewSequence.moves);
    lastMove = previewSequence.moves[previewSequence.moves.length - 1] || null;
  } else if (editorUiState.layer === "success" && block.mode === "puzzle") {
    allStones.push(...(block.successSequence || []));
    lastMove = block.successSequence[block.successSequence.length - 1] || null;
  } else if (editorUiState.layer === "failure" && previewSequence) {
    allStones.push(...previewSequence.moves);
    lastMove = previewSequence.moves[previewSequence.moves.length - 1] || null;
  } else {
    lastMove = block.initialPosition[block.initialPosition.length - 1] || null;
  }

  const overlayMarkers =
    editorUiState.layer === "markers"
      ? block.markers || []
      : editorUiState.layer === "variation" || editorUiState.layer === "success" || editorUiState.layer === "failure"
        ? [
            ...(block.markers || []),
            ...buildSequenceMarkers(previewSequence?.moves || []),
          ]
        : block.markers || [];

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

function formatFailureLines(failureStates = []) {
  return (Array.isArray(failureStates) ? failureStates : [])
    .map((failure) => `${failure.x} ${failure.y} | ${failure.message || ""}`.trim())
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

function parseCoordinate(value, label) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  return Number(value);
}

function assertBoardSize(boardSize) {
  if (!WEIQI_BOARD_SIZES.includes(boardSize)) {
    throw new Error(`Board size must be one of ${WEIQI_BOARD_SIZES.join(", ")}.`);
  }
}

function assertCoordinateInBounds(x, y, boardSize, label) {
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
    throw new Error(`${label} (${x}, ${y}) is outside a ${boardSize}x${boardSize} board.`);
  }
}

function parseStoneText(text, boardSize, label) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const parts = line.split(/\s+/);
    if (parts.length !== 3) {
      throw new Error(`${label} line ${index + 1} must use "color x y".`);
    }

    const [color, rawX, rawY] = parts;
    if (!WEIQI_STONE_COLORS.has(color)) {
      throw new Error(`${label} line ${index + 1} must start with black or white.`);
    }

    const x = parseCoordinate(rawX, `${label} line ${index + 1} x`);
    const y = parseCoordinate(rawY, `${label} line ${index + 1} y`);
    assertCoordinateInBounds(x, y, boardSize, `${label} line ${index + 1}`);
    return { color, x, y };
  });
}

function parseMarkerText(text, boardSize) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const [pointPart, labelPart = "", shapePart = ""] = line.split("|").map((part) => part.trim());
    const pointTokens = pointPart.split(/\s+/);
    if (pointTokens.length !== 2) {
      throw new Error(`Marker line ${index + 1} must start with "x y".`);
    }

    const x = parseCoordinate(pointTokens[0], `Marker line ${index + 1} x`);
    const y = parseCoordinate(pointTokens[1], `Marker line ${index + 1} y`);
    assertCoordinateInBounds(x, y, boardSize, `Marker line ${index + 1}`);

    const shape = shapePart.toLowerCase();
    if (!WEIQI_MARKER_SHAPES.has(shape)) {
      throw new Error(`Marker line ${index + 1} shape must be circle, square, triangle, cross, or blank.`);
    }

    return {
      x,
      y,
      ...(labelPart ? { label: labelPart } : {}),
      ...(shape ? { shape } : {}),
    };
  });
}

function parseFailureText(text, boardSize) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const [pointPart, message = ""] = line.split("|").map((part) => part.trim());
    const pointTokens = pointPart.split(/\s+/);
    if (pointTokens.length !== 2) {
      throw new Error(`Failure line ${index + 1} must start with "x y".`);
    }

    const x = parseCoordinate(pointTokens[0], `Failure line ${index + 1} x`);
    const y = parseCoordinate(pointTokens[1], `Failure line ${index + 1} y`);
    assertCoordinateInBounds(x, y, boardSize, `Failure line ${index + 1}`);
    return { x, y, ...(message ? { message } : {}) };
  });
}

function validateUniqueStonePoints(stones, label) {
  const seen = new Set();
  stones.forEach((stone, index) => {
    const key = `${stone.x},${stone.y}`;
    if (seen.has(key)) {
      throw new Error(`${label} item ${index + 1} repeats an occupied point.`);
    }
    seen.add(key);
  });
}

function validateStoneProgression(initialPosition, sequence, label) {
  const occupied = new Set(initialPosition.map((stone) => `${stone.x},${stone.y}`));
  sequence.forEach((stone, index) => {
    const key = `${stone.x},${stone.y}`;
    if (occupied.has(key)) {
      throw new Error(`${label} item ${index + 1} plays on an occupied point.`);
    }
    occupied.add(key);
  });
}

function collectContentBlocksFromEditor({ throwOnError = true } = {}) {
  try {
    const cards = [...fields.contentBlockFields.querySelectorAll(".content-block-card")];
    return cards.map((card, index) => collectContentBlockFromCard(card, index));
  } catch (error) {
    if (throwOnError) {
      throw error;
    }
    setStatus(error.message);
    return null;
  }
}

function collectContentBlockFromCard(card, index) {
  const rawBlockField = card.querySelector("[data-raw-block]");
  if (rawBlockField) {
    const block = JSON.parse(rawBlockField.value);
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new Error(`Structured block ${index + 1} must be a JSON object.`);
    }
    if (typeof block.type !== "string" || !block.type.trim()) {
      throw new Error(`Structured block ${index + 1} needs a string type.`);
    }
    return block;
  }

  const mode = card.querySelector('[data-weiqi-key="mode"]').value;
  const boardSize = Number(card.querySelector('[data-weiqi-key="boardSize"]').value);
  assertBoardSize(boardSize);

  const coordinateSystem = card.querySelector('[data-weiqi-key="coordinateSystem"]').value.trim() || "zero-based";
  if (coordinateSystem !== "zero-based") {
    throw new Error(`Structured block ${index + 1} must use zero-based coordinates.`);
  }

  const block = normalizeWeiqiBlock({
    type: "weiqi",
    mode,
    boardSize,
    coordinateSystem,
    caption: card.querySelector('[data-weiqi-key="caption"]').value.trim(),
    initialPosition: parseStoneText(card.querySelector('[data-weiqi-key="initialPosition"]').value, boardSize, "Initial position"),
    markers: parseMarkerText(card.querySelector('[data-weiqi-key="markers"]').value, boardSize),
    viewWindow: JSON.parse(card.querySelector('[data-weiqi-key="viewWindow"]').value || "{}"),
  });
  validateUniqueStonePoints(block.initialPosition, "Initial position");

  if (mode === "animated") {
    block.variations = normalizeAnimatedVariations({
      variations: JSON.parse(card.querySelector('[data-weiqi-key="variations"]').value || "[]"),
    });
    block.variations.forEach((variation) => validateStoneProgression(block.initialPosition, variation.moves, variation.label || "Variation"));
  }

  if (mode === "puzzle") {
    block.prompt = card.querySelector('[data-weiqi-key="prompt"]').value.trim();
    block.successSequence = parseStoneText(card.querySelector('[data-weiqi-key="successSequence"]').value, boardSize, "Success sequence");
    validateStoneProgression(block.initialPosition, block.successSequence, "Success sequence");
    block.failureSequences = normalizePuzzleFailureSequences({
      failureSequences: JSON.parse(card.querySelector('[data-weiqi-key="failureSequences"]').value || "[]"),
    });
    block.failureSequences.forEach((failureSequence) => validateStoneProgression(block.initialPosition, failureSequence.moves || [], failureSequence.label || "Failure sequence"));
    block.explanation = card.querySelector('[data-weiqi-key="explanation"]').value.trim();
  }

  return block;
}

function syncStructuredContentBlocks(options = {}) {
  const post = getCurrentPost();
  if (!post) {
    return true;
  }

  const nextBlocks = collectContentBlocksFromEditor(options);
  if (!nextBlocks) {
    return false;
  }

  post.contentBlocks = nextBlocks;
  renderPostPreview(post);
  markDirty();
  return true;
}

function addWeiqiBlock(mode = "static") {
  const post = getCurrentPost();
  if (!post) {
    return;
  }

  if (!syncStructuredContentBlocks({ throwOnError: false })) {
    return;
  }

  post.contentBlocks = Array.isArray(post.contentBlocks) ? post.contentBlocks : [];
  post.contentBlocks.push(getDefaultWeiqiBlock(mode));
  getWeiqiEditorState(post.contentBlocks.length - 1, post.contentBlocks[post.contentBlocks.length - 1]).isOpen = true;
  renderContentBlockFields(post);
  renderPostPreview(post);
  markDirty();
  setStatus("Added a Weiqi content block");
}

function deleteContentBlock(blockIndex) {
  const post = getCurrentPost();
  if (!post || !Array.isArray(post.contentBlocks) || !post.contentBlocks[blockIndex]) {
    return;
  }

  if (!syncStructuredContentBlocks({ throwOnError: false })) {
    return;
  }

  post.contentBlocks.splice(blockIndex, 1);
  renderContentBlockFields(post);
  renderPostPreview(post);
  markDirty();
  setStatus("Deleted structured content block");
}

function withEditableWeiqiBlock(blockIndex, updater, statusMessage = "") {
  const post = getCurrentPost();
  if (!post || !Array.isArray(post.contentBlocks) || !post.contentBlocks[blockIndex]) {
    return;
  }

  if (!syncStructuredContentBlocks({ throwOnError: false })) {
    return;
  }

  const block = normalizeWeiqiBlock(post.contentBlocks[blockIndex]);
  updater(block, getWeiqiEditorState(blockIndex, block));
  post.contentBlocks[blockIndex] = normalizeWeiqiBlock(block);
  renderContentBlockFields(post);
  renderPostPreview(post);
  markDirty();
  if (statusMessage) {
    setStatus(statusMessage);
  }
}

function updateHiddenWeiqiFields(blockIndex, block) {
  const card = fields.contentBlockFields.querySelector(`.content-block-card [data-content-block-index="${blockIndex}"]`)?.closest(".content-block-card");
  if (!card) {
    return;
  }

  card.querySelector('[data-weiqi-key="initialPosition"]').value = formatStoneLines(block.initialPosition || []);
  card.querySelector('[data-weiqi-key="markers"]').value = formatMarkerLines(block.markers || []);
  const variationsField = card.querySelector('[data-weiqi-key="variations"]');
  if (variationsField) {
    variationsField.value = JSON.stringify(block.variations || []);
  }
  const successField = card.querySelector('[data-weiqi-key="successSequence"]');
  if (successField) {
    successField.value = formatStoneLines(block.successSequence || []);
  }
  const failureField = card.querySelector('[data-weiqi-key="failureSequences"]');
  if (failureField) {
    failureField.value = JSON.stringify(block.failureSequences || []);
  }
  card.querySelector('[data-weiqi-key="viewWindow"]').value = serializeViewWindow(block.viewWindow);
}

function handleWeiqiBoardPlacement(blockIndex, boardType, event) {
  const card = event.target.closest(".content-block-card");
  if (!card) {
    return;
  }

  const post = getCurrentPost();
  if (!post || !Array.isArray(post.contentBlocks) || !post.contentBlocks[blockIndex]) {
    return;
  }

  if (!syncStructuredContentBlocks({ throwOnError: false })) {
    return;
  }

  const block = normalizeWeiqiBlock(post.contentBlocks[blockIndex]);
  const editorUiState = getWeiqiEditorState(blockIndex, block);
  const boardElement = card.querySelector(boardType === "overview" ? "[data-overview-board]" : "[data-editor-board]");
  if (!boardElement) {
    return;
  }

  const coordinate = getWeiqiCoordinateFromPointer(
    boardElement,
    block.boardSize,
    event,
    boardType === "overview" ? getDefaultViewWindow(block.boardSize) : block.viewWindow
  );
  if (!coordinate) {
    return;
  }

  if (boardType === "overview") {
    moveViewWindowToCoordinate(block, coordinate);
  } else if (editorUiState.layer === "markers") {
    placeMarkerOnBlock(block, coordinate, editorUiState);
  } else if (editorUiState.layer === "initial") {
    placeStoneInInitialPosition(block, coordinate, editorUiState.tool);
  } else if (editorUiState.layer === "variation") {
    appendStoneToVariation(block, editorUiState, coordinate);
  } else if (editorUiState.layer === "success") {
    appendStoneToSuccessSequence(block, coordinate);
  } else if (editorUiState.layer === "failure") {
    appendStoneToFailureSequence(block, editorUiState, coordinate);
  }

  post.contentBlocks[blockIndex] = normalizeWeiqiBlock(block);
  renderContentBlockFields(post);
  renderPostPreview(post);
  markDirty();
}

function placeStoneInInitialPosition(block, coordinate, tool) {
  const key = getPointKey(coordinate);
  const nextStones = (block.initialPosition || []).filter((stone) => getPointKey(stone) !== key);
  if (tool === "erase") {
    block.initialPosition = nextStones;
    return;
  }

  const color = tool === "white" ? "white" : "black";
  nextStones.push({ color, x: coordinate.x, y: coordinate.y });
  block.initialPosition = nextStones;
}

function placeMarkerOnBlock(block, coordinate, editorUiState) {
  const key = getPointKey(coordinate);
  const nextMarkers = (block.markers || []).filter((marker) => getPointKey(marker) !== key);
  if (editorUiState.markerMode === "erase") {
    block.markers = nextMarkers;
    return;
  }

  const nextMarker = buildMarkerForMode(nextMarkers, coordinate, editorUiState.markerMode);
  if (!nextMarker) {
    block.markers = nextMarkers;
    return;
  }

  nextMarkers.push(nextMarker);
  block.markers = nextMarkers;
}

function buildMarkerForMode(markers, coordinate, markerMode) {
  if (markerMode === "label-alpha") {
    return {
      x: coordinate.x,
      y: coordinate.y,
      label: getNextAlphabeticMarkerLabel(markers),
    };
  }

  if (markerMode === "label-numeric") {
    return {
      x: coordinate.x,
      y: coordinate.y,
      label: String(getNextNumericMarkerLabel(markers)),
    };
  }

  if (markerMode === "triangle" || markerMode === "square") {
    return {
      x: coordinate.x,
      y: coordinate.y,
      shape: markerMode,
    };
  }

  return null;
}

function getNextAlphabeticMarkerLabel(markers) {
  const usedIndexes = (markers || [])
    .map((marker) => getAlphabeticMarkerIndex(marker.label || ""))
    .filter((value) => Number.isInteger(value) && value >= 0);
  return getAlphabeticMarkerLabel((usedIndexes.length ? Math.max(...usedIndexes) : -1) + 1);
}

function getAlphabeticMarkerIndex(label) {
  if (!/^[A-Z]+$/.test(label)) {
    return null;
  }

  let index = 0;
  for (const character of label) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

function getAlphabeticMarkerLabel(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function getNextNumericMarkerLabel(markers) {
  const usedNumbers = (markers || [])
    .map((marker) => Number(marker.label))
    .filter((value) => Number.isInteger(value) && value > 0);
  return (usedNumbers.length ? Math.max(...usedNumbers) : 0) + 1;
}

function appendStoneToVariation(block, editorUiState, coordinate) {
  const variation = block.variations[editorUiState.selectedVariationIndex] || block.variations[0];
  if (!variation) {
    return;
  }

  updateSequenceMoves(block.initialPosition, variation.moves, coordinate, editorUiState.tool);
}

function appendStoneToSuccessSequence(block, coordinate) {
  updateSequenceMoves(block.initialPosition, block.successSequence, coordinate, "auto");
}

function appendStoneToFailureSequence(block, editorUiState, coordinate) {
  const failureSequence = block.failureSequences[editorUiState.selectedFailureIndex] || block.failureSequences[0];
  if (!failureSequence) {
    return;
  }

  updateSequenceMoves(block.initialPosition, failureSequence.moves, coordinate, "auto");
}

function updateSequenceMoves(initialPosition, sequence, coordinate, tool) {
  const occupied = buildStoneMap(initialPosition, sequence);
  const key = getPointKey(coordinate);

  const existingIndex = sequence.findIndex((move) => getPointKey(move) === key);
  if (tool === "erase") {
    if (existingIndex >= 0) {
      sequence.splice(existingIndex, 1);
    }
    return;
  }

  if (occupied.has(key)) {
    throw new Error("That point is already occupied in this line.");
  }

  const color = tool === "white" || tool === "black" ? tool : getNextSequenceColor(initialPosition, sequence);
  sequence.push({ color, x: coordinate.x, y: coordinate.y });
}

function getNextSequenceColor(initialPosition, sequence) {
  const totalPlaced = (initialPosition || []).length + (sequence || []).length;
  return totalPlaced % 2 === 0 ? "black" : "white";
}

function setWeiqiEditorLayer(blockIndex, layer) {
  const post = getCurrentPost();
  const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
  if (!block) {
    return;
  }
  getWeiqiEditorState(blockIndex, block).layer = layer;
  renderContentBlockFields(post);
}

function setWeiqiEditorOpen(blockIndex, isOpen) {
  const post = getCurrentPost();
  const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
  if (!block) {
    return;
  }
  getWeiqiEditorState(blockIndex, block).isOpen = isOpen;
  renderContentBlockFields(post);
}

function setWeiqiEditorTool(blockIndex, tool) {
  const post = getCurrentPost();
  const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
  if (!block) {
    return;
  }
  getWeiqiEditorState(blockIndex, block).tool = tool;
  renderContentBlockFields(post);
}

function setWeiqiEditorMarkerMode(blockIndex, markerMode) {
  const post = getCurrentPost();
  const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
  if (!block || !WEIQI_MARKER_MODES.has(markerMode)) {
    return;
  }
  getWeiqiEditorState(blockIndex, block).markerMode = markerMode;
  renderContentBlockFields(post);
}

function addAnimatedVariation(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    editorUiState.isOpen = true;
    const nextIndex = (block.variations?.length || 0) + 1;
    block.variations.push({
      id: `variation-${Date.now()}`,
      label: `Variation ${nextIndex}`,
      moves: [],
    });
    editorUiState.selectedVariationIndex = block.variations.length - 1;
    editorUiState.layer = "variation";
  }, "Added animation version");
}

function selectAnimatedVariation(blockIndex, variationIndex) {
  const post = getCurrentPost();
  const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
  if (!block) {
    return;
  }
  getWeiqiEditorState(blockIndex, block).selectedVariationIndex = variationIndex;
  renderContentBlockFields(post);
}

function renameAnimatedVariation(blockIndex, label) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    const variation = block.variations[editorUiState.selectedVariationIndex] || block.variations[0];
    if (variation) {
      variation.label = label.trim() || variation.label;
    }
  });
}

function deleteAnimatedVariation(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    if (block.variations.length <= 1) {
      return;
    }
    block.variations.splice(editorUiState.selectedVariationIndex, 1);
    editorUiState.selectedVariationIndex = Math.max(0, editorUiState.selectedVariationIndex - 1);
  }, "Deleted animation version");
}

function removeLastVariationMove(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    const variation = block.variations[editorUiState.selectedVariationIndex] || block.variations[0];
    variation?.moves?.pop();
  });
}

function clearVariation(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    const variation = block.variations[editorUiState.selectedVariationIndex] || block.variations[0];
    if (variation) {
      variation.moves = [];
    }
  });
}

function addFailureSequence(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    editorUiState.isOpen = true;
    const nextIndex = (block.failureSequences?.length || 0) + 1;
    block.failureSequences.push({
      id: `failure-${Date.now()}`,
      label: `Failure ${nextIndex}`,
      moves: [],
      message: "",
    });
    editorUiState.selectedFailureIndex = block.failureSequences.length - 1;
    editorUiState.layer = "failure";
  }, "Added failure line");
}

function selectFailureSequence(blockIndex, failureIndex) {
  const post = getCurrentPost();
  const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
  if (!block) {
    return;
  }
  getWeiqiEditorState(blockIndex, block).selectedFailureIndex = failureIndex;
  renderContentBlockFields(post);
}

function renameFailureSequence(blockIndex, label) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    const sequence = block.failureSequences[editorUiState.selectedFailureIndex] || block.failureSequences[0];
    if (sequence) {
      sequence.label = label.trim() || sequence.label;
    }
  });
}

function editFailureMessage(blockIndex, message) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    const sequence = block.failureSequences[editorUiState.selectedFailureIndex] || block.failureSequences[0];
    if (sequence) {
      sequence.message = message;
    }
  });
}

function deleteFailureSequence(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    if (block.failureSequences.length <= 1) {
      return;
    }
    block.failureSequences.splice(editorUiState.selectedFailureIndex, 1);
    editorUiState.selectedFailureIndex = Math.max(0, editorUiState.selectedFailureIndex - 1);
  }, "Deleted failure line");
}

function removeLastSuccessMove(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block) => {
    block.successSequence.pop();
  });
}

function clearSuccessSequence(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block) => {
    block.successSequence = [];
  });
}

function removeLastFailureMove(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    const sequence = block.failureSequences[editorUiState.selectedFailureIndex] || block.failureSequences[0];
    sequence?.moves?.pop();
  });
}

function clearFailureSequence(blockIndex) {
  withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
    const sequence = block.failureSequences[editorUiState.selectedFailureIndex] || block.failureSequences[0];
    if (sequence) {
      sequence.moves = [];
    }
  });
}

function beginWeiqiViewportDrag(blockIndex, event) {
  const post = getCurrentPost();
  const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
  const overviewBoard = fields.contentBlockFields.querySelector(`[data-overview-board][data-content-block-index="${blockIndex}"]`);
  if (!block || !overviewBoard) {
    return;
  }

  const startCoordinate = getWeiqiCoordinateFromPointer(overviewBoard, block.boardSize, event, getDefaultViewWindow(block.boardSize));
  if (!startCoordinate) {
    return;
  }

  editorState.weiqiViewportDrag = {
    blockIndex,
    handle: event.target.closest("[data-viewport-handle]")?.dataset.viewportHandle || null,
    startCoordinate,
    startViewWindow: { ...normalizeViewWindow(block.boardSize, block.viewWindow) },
  };
}

function continueWeiqiViewportDrag(event) {
  if (!editorState.weiqiViewportDrag) {
    return;
  }

  const { blockIndex, handle, startCoordinate, startViewWindow } = editorState.weiqiViewportDrag;
  const post = getCurrentPost();
  const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
  const overviewBoard = fields.contentBlockFields.querySelector(`[data-overview-board][data-content-block-index="${blockIndex}"]`);
  if (!post || !block || !overviewBoard) {
    return;
  }

  const coordinate = getWeiqiCoordinateFromPointer(overviewBoard, block.boardSize, event, getDefaultViewWindow(block.boardSize));
  if (!coordinate) {
    return;
  }

  block.viewWindow = handle
    ? resizeViewWindowFromHandle(block.boardSize, startViewWindow, handle, coordinate)
    : translateViewWindow(block.boardSize, startViewWindow, startCoordinate, coordinate);

  post.contentBlocks[blockIndex] = normalizeWeiqiBlock(block);
  renderContentBlockFields(post);
  renderPostPreview(post);
  markDirty();
}

function endWeiqiViewportDrag() {
  editorState.weiqiViewportDrag = null;
}

function translateViewWindow(boardSize, viewWindow, startCoordinate, coordinate) {
  const width = viewWindow.xMax - viewWindow.xMin;
  const height = viewWindow.yMax - viewWindow.yMin;
  const deltaX = coordinate.x - startCoordinate.x;
  const deltaY = coordinate.y - startCoordinate.y;
  let xMin = viewWindow.xMin + deltaX;
  let yMin = viewWindow.yMin + deltaY;
  xMin = Math.max(0, Math.min(boardSize - 1 - width, xMin));
  yMin = Math.max(0, Math.min(boardSize - 1 - height, yMin));
  return normalizeViewWindow(boardSize, {
    xMin,
    yMin,
    xMax: xMin + width,
    yMax: yMin + height,
  });
}

function resizeViewWindowFromHandle(boardSize, viewWindow, handle, coordinate) {
  const minSpan = Math.min(4, boardSize - 1);
  let { xMin, yMin, xMax, yMax } = viewWindow;

  if (handle === "nw" || handle === "sw") {
    xMin = Math.max(0, Math.min(xMax - minSpan, coordinate.x));
  }
  if (handle === "ne" || handle === "se") {
    xMax = Math.min(boardSize - 1, Math.max(xMin + minSpan, coordinate.x));
  }
  if (handle === "nw" || handle === "ne") {
    yMin = Math.max(0, Math.min(yMax - minSpan, coordinate.y));
  }
  if (handle === "sw" || handle === "se") {
    yMax = Math.min(boardSize - 1, Math.max(yMin + minSpan, coordinate.y));
  }

  return normalizeViewWindow(boardSize, { xMin, yMin, xMax, yMax });
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

function createPost() {
  syncAllFields();
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
  syncAllFields();
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
      normalizedBlock.variations.forEach((variation) => validateStoneProgression(normalizedBlock.initialPosition || [], variation.moves || [], variation.label));
      validateStoneProgression(normalizedBlock.initialPosition || [], normalizedBlock.successSequence || [], "Success sequence");
      normalizedBlock.failureSequences.forEach((sequence) => validateStoneProgression(normalizedBlock.initialPosition || [], sequence.moves || [], sequence.label));

      (normalizedBlock.markers || []).forEach((marker, markerIndex) => {
        assertCoordinateInBounds(marker.x, marker.y, Number(normalizedBlock.boardSize), `marker ${markerIndex + 1}`);
        if (marker.shape && !WEIQI_MARKER_SHAPES.has(marker.shape)) {
          throw new Error(`Post ${index + 1} block ${blockIndex + 1} marker ${markerIndex + 1} has an invalid shape.`);
        }
      });

      normalizedBlock.failureSequences.forEach((sequence, sequenceIndex) => {
        if (sequence.message != null && typeof sequence.message !== "string") {
          throw new Error(`Post ${index + 1} block ${blockIndex + 1} failure ${sequenceIndex + 1} needs a string message.`);
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
      normalizedBlock.failureSequences.forEach((sequence) => {
        (sequence.moves || []).forEach((stone, stoneIndex) => {
          if (!WEIQI_STONE_COLORS.has(stone.color)) {
            throw new Error(`Post ${index + 1} block ${blockIndex + 1} failure move ${stoneIndex + 1} has an invalid color.`);
          }
          assertCoordinateInBounds(stone.x, stone.y, Number(normalizedBlock.boardSize), `failure move ${stoneIndex + 1}`);
        });
      });
      normalizedBlock.successSequence.forEach((stone, stoneIndex) => {
        if (!WEIQI_STONE_COLORS.has(stone.color)) {
          throw new Error(`Post ${index + 1} block ${blockIndex + 1} success move ${stoneIndex + 1} has an invalid color.`);
        }
        assertCoordinateInBounds(stone.x, stone.y, Number(normalizedBlock.boardSize), `success move ${stoneIndex + 1}`);
      });
      normalizedBlock.variations.forEach((variation) => {
        (variation.moves || []).forEach((stone, stoneIndex) => {
          if (!WEIQI_STONE_COLORS.has(stone.color)) {
            throw new Error(`Post ${index + 1} block ${blockIndex + 1} variation move ${stoneIndex + 1} has an invalid color.`);
          }
          assertCoordinateInBounds(stone.x, stone.y, Number(normalizedBlock.boardSize), `variation move ${stoneIndex + 1}`);
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
  const structuredContentHtml = renderStructuredContentBlocks(post.contentBlocks);
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
    ${structuredContentHtml}
  `;

  targets.forEach((target) => {
    target.innerHTML = markup;
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
