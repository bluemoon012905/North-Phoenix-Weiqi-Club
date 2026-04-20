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
  newCategoryButton: document.getElementById("new-category-button"),
  openPostEditorButton: document.getElementById("open-post-editor-button"),
  saveButton: document.getElementById("save-button"),
  exportButton: document.getElementById("export-button"),
  deletePostButton: document.getElementById("delete-post-button"),
  siteTitle: document.getElementById("site-title"),
  siteTagline: document.getElementById("site-tagline"),
  siteIntro: document.getElementById("site-intro"),
  siteAbout: document.getElementById("site-about"),
  brandMark: document.getElementById("brand-mark"),
  heroEyebrow: document.getElementById("hero-eyebrow"),
  aboutEyebrow: document.getElementById("about-eyebrow"),
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
  categoryFields: document.getElementById("category-fields"),
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
  populateCategoryFields();
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
  fields.siteAbout.value = site.about || "";
  fields.brandMark.value = site.brandMark || "";
  fields.heroEyebrow.value = site.heroEyebrow || "";
  fields.aboutEyebrow.value = site.aboutEyebrow || "";
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

function populateCategoryFields() {
  fields.categoryFields.innerHTML = editorState.content.categories
    .map(
      (category, index) => `
        <div class="category-card">
          <div class="category-card-head">
            <p class="workspace-kicker">Panel ${index + 1}</p>
            <button type="button" class="danger category-delete-button" data-category-index="${index}">Delete</button>
          </div>
          <label>
            <span>Category ID</span>
            <input data-category-index="${index}" data-key="id" type="text" value="${escapeHtml(category.id)}" />
          </label>
          <label>
            <span>Name</span>
            <input data-category-index="${index}" data-key="name" type="text" value="${escapeHtml(category.name)}" />
          </label>
          <label>
            <span>Description</span>
            <textarea data-category-index="${index}" data-key="description" rows="4">${escapeHtml(
              category.description
            )}</textarea>
          </label>
        </div>
      `
    )
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
    "Write, format, paste images, then save everything back into the site JSON.";
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

function syncSiteFields() {
  const { site } = editorState.content;
  site.title = fields.siteTitle.value.trim();
  site.tagline = fields.siteTagline.value.trim();
  site.intro = fields.siteIntro.value.trim();
  site.about = fields.siteAbout.value.trim();
  site.brandMark = fields.brandMark.value.trim();
  site.heroEyebrow = fields.heroEyebrow.value.trim();
  site.aboutEyebrow = fields.aboutEyebrow.value.trim();
  site.contactLabel = fields.contactLabel.value.trim();
  site.contactHref = fields.contactHref.value.trim();
  site.editorEyebrow = fields.editorEyebrow.value.trim();
  site.editorTitle = fields.editorTitle.value.trim();
  site.editorDescription = fields.editorDescription.value.trim();
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

function syncCategoryFields() {
  const previousIds = editorState.content.categories.map((category) => category.id);
  const inputs = fields.categoryFields.querySelectorAll("[data-category-index]");
  inputs.forEach((input) => {
    const categoryIndex = Number(input.dataset.categoryIndex);
    const key = input.dataset.key;
    editorState.content.categories[categoryIndex][key] = input.value.trim();
  });

  editorState.content.categories.forEach((category, index) => {
    const oldId = previousIds[index];
    if (!oldId || oldId === category.id) {
      return;
    }

    editorState.content.posts.forEach((post) => {
      if (post.category === oldId) {
        post.category = category.id;
      }
    });
  });
  markDirty();
}

function createCategory() {
  syncCategoryFields();
  const baseId = "new-panel";
  let suffix = 1;
  let nextId = baseId;
  while (editorState.content.categories.some((category) => category.id === nextId)) {
    suffix += 1;
    nextId = `${baseId}-${suffix}`;
  }

  editorState.content.categories.push({
    id: nextId,
    name: "New panel",
    description: "Describe what belongs in this section.",
  });

  populateCategoryFields();
  populateCategorySelect(getCurrentPost()?.category);
  if (!getCurrentPost()) {
    renderWorkspaceState();
  }
  markDirty();
  setStatus("Added a new panel");
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

function deleteCategory(categoryIndex) {
  if (editorState.content.categories.length <= 1) {
    setStatus("You need at least one panel.");
    return;
  }

  const removedCategory = editorState.content.categories[categoryIndex];
  if (!removedCategory) {
    return;
  }

  editorState.content.categories.splice(categoryIndex, 1);
  const fallbackCategoryId = editorState.content.categories[0]?.id || "personal";

  editorState.content.posts.forEach((post) => {
    if (post.category === removedCategory.id) {
      post.category = fallbackCategoryId;
    }
  });

  populateCategoryFields();
  populateCategorySelect(fallbackCategoryId);
  syncCurrentPost();
  renderPostList();
  renderWorkspaceState();
  markDirty();
  setStatus(`Deleted panel "${removedCategory.name || removedCategory.id}"`);
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
  syncCategoryFields();
  syncCurrentPost();
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
    setStatus("Saved to data/content.json");
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
  `;

  targets.forEach((target) => {
    target.innerHTML = markup;
  });
}

function renderEditorSidebarCopy() {
  const { site } = editorState.content;
  fields.editorEyebrowDisplay.textContent = site.editorEyebrow || "Local editor";
  fields.editorTitleDisplay.textContent = site.editorTitle || site.title || "Blue Shell Almanac";
  fields.editorDescriptionDisplay.textContent =
    site.editorDescription || "Manage site copy and posts here. Saving writes directly to data/content.json.";
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
