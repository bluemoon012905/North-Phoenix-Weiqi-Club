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
const { renderStructuredContentBlocks, init: initWeiqiContent } = window.BlueshellWeiqi;

const WEIQI_BOARD_SIZES = [9, 13, 19];
const WEIQI_STONE_COLORS = new Set(["black", "white"]);
const WEIQI_MARKER_SHAPES = new Set(["", "circle", "square", "triangle", "cross"]);

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
  return {
    type: "weiqi",
    mode,
    boardSize: 19,
    coordinateSystem: "zero-based",
    caption: mode === "puzzle" ? "New puzzle" : "New Weiqi block",
    initialPosition: [],
    markers: [],
    moves: [],
    prompt: mode === "puzzle" ? "Black to play. Find the best move." : "",
    solution: [],
    failureStates: [],
    explanation: "",
  };
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

  return `
    <section class="category-card content-block-card" data-weiqi-card>
      <div class="category-card-head">
        <div>
          <p class="workspace-kicker">Structured block</p>
          <h3>Weiqi ${escapeHtml(getWeiqiModeLabel(block.mode))}</h3>
        </div>
        <button type="button" class="danger category-delete-button" data-content-block-index="${index}" data-action="delete-block">Delete</button>
      </div>
      <div class="form-grid post-grid">
        <label>
          <span>Type</span>
          <input data-weiqi-key="type" type="text" value="weiqi" readonly />
        </label>
        <label>
          <span>Mode</span>
          <select data-weiqi-key="mode">
            ${["static", "animated", "puzzle"]
              .map((mode) => `<option value="${mode}" ${block.mode === mode ? "selected" : ""}>${escapeHtml(getWeiqiModeLabel(mode))}</option>`)
              .join("")}
          </select>
        </label>
        <label>
          <span>Board size</span>
          <select data-weiqi-key="boardSize">
            ${WEIQI_BOARD_SIZES.map(
              (size) => `<option value="${size}" ${Number(block.boardSize) === size ? "selected" : ""}>${size} x ${size}</option>`
            ).join("")}
          </select>
        </label>
        <label>
          <span>Coordinate system</span>
          <input data-weiqi-key="coordinateSystem" type="text" value="${escapeAttribute(block.coordinateSystem || "zero-based")}" />
        </label>
        <label class="full-width">
          <span>Caption</span>
          <input data-weiqi-key="caption" type="text" value="${escapeAttribute(block.caption || "")}" />
        </label>
        <label class="full-width">
          <span>Initial position</span>
          <textarea data-weiqi-key="initialPosition" rows="5" placeholder="black 3 3&#10;white 15 15">${escapeHtml(
            formatStoneLines(block.initialPosition)
          )}</textarea>
          <small class="field-help">One stone per line: <code>color x y</code>. Coordinates are zero-based.</small>
        </label>
        <label class="full-width">
          <span>Markers</span>
          <textarea data-weiqi-key="markers" rows="4" placeholder="10 10 | A | circle">${escapeHtml(
            formatMarkerLines(block.markers)
          )}</textarea>
          <small class="field-help">One marker per line: <code>x y | label | shape</code>. Shape is optional and supports circle, square, triangle, or cross.</small>
        </label>
        <label class="full-width ${block.mode === "animated" ? "" : "hidden"}" data-mode-section="animated">
          <span>Moves</span>
          <textarea data-weiqi-key="moves" rows="6" placeholder="black 3 3&#10;white 15 15">${escapeHtml(formatStoneLines(block.moves))}</textarea>
          <small class="field-help">Ordered move list using <code>color x y</code>.</small>
        </label>
        <label class="full-width ${block.mode === "puzzle" ? "" : "hidden"}" data-mode-section="puzzle">
          <span>Prompt</span>
          <textarea data-weiqi-key="prompt" rows="3" placeholder="Black to play. Find the best move.">${escapeHtml(block.prompt || "")}</textarea>
        </label>
        <label class="full-width ${block.mode === "puzzle" ? "" : "hidden"}" data-mode-section="puzzle">
          <span>Solution</span>
          <textarea data-weiqi-key="solution" rows="5" placeholder="black 3 4">${escapeHtml(formatStoneLines(block.solution))}</textarea>
          <small class="field-help">Viewer move sequence, one move per line.</small>
        </label>
        <label class="full-width ${block.mode === "puzzle" ? "" : "hidden"}" data-mode-section="puzzle">
          <span>Failure states</span>
          <textarea data-weiqi-key="failureStates" rows="4" placeholder="2 4 | This allows white to connect out.">${escapeHtml(
            formatFailureLines(block.failureStates)
          )}</textarea>
          <small class="field-help">Optional specific wrong moves: <code>x y | message</code>.</small>
        </label>
        <label class="full-width ${block.mode === "puzzle" ? "" : "hidden"}" data-mode-section="puzzle">
          <span>Explanation</span>
          <textarea data-weiqi-key="explanation" rows="4" placeholder="This move captures or creates the strongest shape.">${escapeHtml(
            block.explanation || ""
          )}</textarea>
        </label>
      </div>
    </section>
  `;
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

  const block = {
    type: "weiqi",
    mode,
    boardSize,
    coordinateSystem,
    caption: card.querySelector('[data-weiqi-key="caption"]').value.trim(),
    initialPosition: parseStoneText(card.querySelector('[data-weiqi-key="initialPosition"]').value, boardSize, "Initial position"),
    markers: parseMarkerText(card.querySelector('[data-weiqi-key="markers"]').value, boardSize),
  };
  validateUniqueStonePoints(block.initialPosition, "Initial position");

  if (mode === "animated") {
    block.moves = parseStoneText(card.querySelector('[data-weiqi-key="moves"]').value, boardSize, "Moves");
    validateStoneProgression(block.initialPosition, block.moves, "Moves");
  }

  if (mode === "puzzle") {
    block.prompt = card.querySelector('[data-weiqi-key="prompt"]').value.trim();
    block.solution = parseStoneText(card.querySelector('[data-weiqi-key="solution"]').value, boardSize, "Solution");
    validateStoneProgression(block.initialPosition, block.solution, "Solution");
    block.failureStates = parseFailureText(card.querySelector('[data-weiqi-key="failureStates"]').value, boardSize);
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

  populateCategorySelect(nextId);
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

      assertBoardSize(Number(block.boardSize));
      if ((block.coordinateSystem || "zero-based") !== "zero-based") {
        throw new Error(`Post ${index + 1} block ${blockIndex + 1} must use zero-based coordinates.`);
      }

      ["initialPosition", "moves", "solution"].forEach((key) => {
        if (!Array.isArray(block[key])) {
          return;
        }

        block[key].forEach((stone, stoneIndex) => {
          if (!WEIQI_STONE_COLORS.has(stone.color)) {
            throw new Error(`Post ${index + 1} block ${blockIndex + 1} ${key} item ${stoneIndex + 1} has an invalid color.`);
          }
          assertCoordinateInBounds(stone.x, stone.y, Number(block.boardSize), `${key} item ${stoneIndex + 1}`);
        });
      });

      validateUniqueStonePoints(block.initialPosition || [], "Initial position");
      if (Array.isArray(block.moves)) {
        validateStoneProgression(block.initialPosition || [], block.moves, "Moves");
      }
      if (Array.isArray(block.solution)) {
        validateStoneProgression(block.initialPosition || [], block.solution, "Solution");
      }

      (block.markers || []).forEach((marker, markerIndex) => {
        assertCoordinateInBounds(marker.x, marker.y, Number(block.boardSize), `marker ${markerIndex + 1}`);
        if (marker.shape && !WEIQI_MARKER_SHAPES.has(marker.shape)) {
          throw new Error(`Post ${index + 1} block ${blockIndex + 1} marker ${markerIndex + 1} has an invalid shape.`);
        }
      });

      (block.failureStates || []).forEach((failure, failureIndex) => {
        assertCoordinateInBounds(failure.x, failure.y, Number(block.boardSize), `failure state ${failureIndex + 1}`);
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
