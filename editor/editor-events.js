fields.postSearch.addEventListener("input", (event) => {
  editorState.search = event.target.value;
  renderPostList();
});

[
  fields.siteTitle,
  fields.siteTagline,
  fields.siteIntro,
  fields.contactDescription,
  fields.brandMark,
  fields.heroEyebrow,
  fields.contactEyebrow,
  fields.contactLabel,
  fields.contactHref,
  fields.editorEyebrow,
  fields.editorTitle,
  fields.editorDescription,
].forEach((field) => {
  field.addEventListener("input", () => {
    syncSiteFields();
  });
});

fields.homePanelFields.addEventListener("input", () => {
  syncHomePanelFields();
});

fields.homePanelFields.addEventListener("change", () => {
  syncHomePanelFields();
});

[
  fields.postId,
  fields.postTitle,
  fields.postDate,
  fields.postTags,
  fields.postSummary,
  fields.postCoverImage,
].forEach((field) => {
  field.addEventListener("input", () => {
    syncCurrentPost();
  });
});

fields.postCategory.addEventListener("change", () => {
  syncCurrentPost();
});

fields.postPublishState.addEventListener("change", () => {
  syncCurrentPost();
});

fields.postFeatured.addEventListener("change", () => {
  syncCurrentPost();
});

fields.postBodyEditor.addEventListener("input", () => {
  syncCurrentPost();
});

["keyup", "mouseup", "blur"].forEach((eventName) => {
  fields.postBodyEditor.addEventListener(eventName, () => {
    saveComposerSelection();
  });
});

fields.postBodyEditor.addEventListener("paste", async (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) {
    return;
  }

  event.preventDefault();
  const file = imageItem.getAsFile();
  await handleImageFile(file);
});

fields.toolbar.addEventListener("mousedown", (event) => {
  if (event.target.closest("button")) {
    event.preventDefault();
  }
});

fields.toolbar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command]");
  if (!button) {
    return;
  }

  const command = button.dataset.command;
  const value = button.dataset.value;
  applyFormatting(command, value);
});

fields.fontFamilySelect.addEventListener("change", (event) => {
  const value = event.target.value === "inherit" ? "Roboto Condensed" : event.target.value;
  applyFormatting("fontName", value);
});

fields.fontSizeSelect.addEventListener("change", (event) => {
  applyFormatting("fontSize", event.target.value);
});

fields.textColorInput.addEventListener("input", (event) => {
  applyFormatting("foreColor", event.target.value);
});

fields.highlightColorInput.addEventListener("input", (event) => {
  applyFormatting("hiliteColor", event.target.value);
});

fields.insertImageButton.addEventListener("click", () => {
  fields.imageUploadInput.click();
});

fields.insertButtonLinkButton.addEventListener("click", async () => {
  try {
    await openButtonBuilder();
  } catch (error) {
    setStatus(error.message);
  }
});

fields.insertCitationLinkButton.addEventListener("click", () => {
  openCitationBuilder();
});

fields.imageUploadInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  await handleImageFile(file);
  event.target.value = "";
});

fields.uploadCoverImageButton.addEventListener("click", () => {
  fields.coverImageUploadInput.click();
});

fields.addWeiqiBlockButton.addEventListener("click", () => {
  addWeiqiBlock();
});

fields.coverImageUploadInput.addEventListener("change", async (event) => {
  try {
    const [file] = event.target.files || [];
    await setCoverImageFromFile(file);
  } catch (error) {
    setStatus(error.message);
  } finally {
    event.target.value = "";
  }
});

fields.postCoverImage.addEventListener("paste", async (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) {
    return;
  }

  event.preventDefault();
  try {
    const file = imageItem.getAsFile();
    await setCoverImageFromFile(file);
  } catch (error) {
    setStatus(error.message);
  }
});

fields.postList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-post-id]");
  if (!button) {
    return;
  }

  syncAllFields();
  selectPost(button.dataset.postId, { openComposer: true });
});

fields.contentBlockFields.addEventListener("input", (event) => {
  if (event.target.matches('[data-weiqi-key="mode"]')) {
    if (syncStructuredContentBlocks({ throwOnError: false })) {
      renderContentBlockFields(getCurrentPost());
    }
    return;
  }

  syncStructuredContentBlocks({ throwOnError: false });
});

fields.contentBlockFields.addEventListener("change", (event) => {
  const blockIndex = Number(event.target.dataset.contentBlockIndex);

  if (event.target.matches('[data-action="rename-variation"]')) {
    renameAnimatedVariation(blockIndex, event.target.value);
    return;
  }

  if (event.target.matches('[data-action="rename-failure-sequence"]')) {
    renameFailureSequence(blockIndex, event.target.value);
    return;
  }

  if (event.target.matches('[data-action="edit-failure-message"]')) {
    editFailureMessage(blockIndex, event.target.value);
    return;
  }

  if (event.target.matches('[data-weiqi-key="mode"]')) {
    if (syncStructuredContentBlocks({ throwOnError: false })) {
      renderContentBlockFields(getCurrentPost());
    }
    return;
  }

  syncStructuredContentBlocks({ throwOnError: false });
});

fields.contentBlockFields.addEventListener("click", (event) => {
  const deleteButton = event.target.closest('[data-action="delete-block"]');
  if (deleteButton) {
    deleteContentBlock(Number(deleteButton.dataset.contentBlockIndex));
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const blockIndex = Number(actionButton.dataset.contentBlockIndex);
    try {
      if (actionButton.dataset.action === "set-editor-layer") {
        setWeiqiEditorLayer(blockIndex, actionButton.dataset.editorLayer);
        return;
      }
      if (actionButton.dataset.action === "open-weiqi-editor") {
        setWeiqiEditorOpen(blockIndex, true);
        return;
      }
      if (actionButton.dataset.action === "close-weiqi-editor") {
        setWeiqiEditorOpen(blockIndex, false);
        return;
      }
      if (actionButton.dataset.action === "set-editor-tool") {
        setWeiqiEditorTool(blockIndex, actionButton.dataset.editorTool);
        return;
      }
      if (actionButton.dataset.action === "set-editor-marker-mode") {
        setWeiqiEditorMarkerMode(blockIndex, actionButton.dataset.editorMarkerMode);
        return;
      }
      if (actionButton.dataset.action === "add-variation") {
        addAnimatedVariation(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "select-variation-editor") {
        selectAnimatedVariation(blockIndex, Number(actionButton.dataset.variationIndex));
        return;
      }
      if (actionButton.dataset.action === "delete-variation") {
        deleteAnimatedVariation(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "remove-last-sequence-move") {
        removeLastVariationMove(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "clear-sequence") {
        clearVariation(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "add-failure-sequence") {
        addFailureSequence(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "select-failure-sequence") {
        selectFailureSequence(blockIndex, Number(actionButton.dataset.failureIndex));
        return;
      }
      if (actionButton.dataset.action === "delete-failure-sequence") {
        deleteFailureSequence(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "remove-last-success-move") {
        removeLastSuccessMove(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "clear-success") {
        clearSuccessSequence(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "remove-last-failure-move") {
        removeLastFailureMove(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "clear-failure-sequence") {
        clearFailureSequence(blockIndex);
        return;
      }
    } catch (error) {
      setStatus(error.message);
      return;
    }
  }

  const editorBoard = event.target.closest("[data-editor-board]");
  if (editorBoard) {
    try {
      handleWeiqiBoardPlacement(Number(editorBoard.dataset.contentBlockIndex), "editor", event);
    } catch (error) {
      setStatus(error.message);
    }
    return;
  }
});

fields.contentBlockFields.addEventListener("mousedown", (event) => {
  const overviewBoard = event.target.closest("[data-overview-board]");
  const viewportHandle = event.target.closest("[data-viewport-handle]");
  const viewportOutline = event.target.closest(".weiqi-viewport-outline");
  if (!overviewBoard || (!viewportHandle && !viewportOutline)) {
    return;
  }

  event.preventDefault();
  try {
    beginWeiqiViewportDrag(Number(overviewBoard.dataset.contentBlockIndex), event);
  } catch (error) {
    setStatus(error.message);
  }
});

document.addEventListener("mousemove", (event) => {
  if (!editorState.weiqiViewportDrag) {
    return;
  }

  try {
    continueWeiqiViewportDrag(event);
  } catch (error) {
    setStatus(error.message);
    endWeiqiViewportDrag();
  }
});

document.addEventListener("mouseup", () => {
  if (editorState.weiqiViewportDrag) {
    endWeiqiViewportDrag();
  }
});

fields.newPostButton.addEventListener("click", () => {
  createPost();
});

fields.newHomePanelButton.addEventListener("click", () => {
  createHomePanel();
});

fields.openPostEditorButton.addEventListener("click", () => {
  syncAllFields();
  openComposer();
});

fields.deletePostButton.addEventListener("click", () => {
  deleteCurrentPost();
});

fields.homePanelFields.addEventListener("click", (event) => {
  const button = event.target.closest("[data-home-panel-index].category-delete-button");
  if (!button) {
    return;
  }

  deleteHomePanel(Number(button.dataset.homePanelIndex));
});

fields.closePostEditorButton.addEventListener("click", () => {
  syncAllFields();
  closeComposer();
});

fields.togglePreviewButton.addEventListener("click", () => {
  toggleComposerPreview();
});

fields.closeButtonBuilderButton.addEventListener("click", () => {
  closeButtonBuilder();
});

fields.buttonBuilderBackdrop.addEventListener("click", () => {
  closeButtonBuilder();
});

fields.closeCitationBuilderButton.addEventListener("click", () => {
  closeCitationBuilder();
});

fields.citationBuilderBackdrop.addEventListener("click", () => {
  closeCitationBuilder();
});

fields.saveButtonLinkButton.addEventListener("click", async () => {
  try {
    await insertCustomButton();
  } catch (error) {
    fields.buttonBuilderStatus.textContent = error.message;
  }
});

fields.saveCitationLinkButton.addEventListener("click", () => {
  try {
    insertCitationLink();
  } catch (error) {
    fields.citationBuilderStatus.textContent = error.message;
  }
});

fields.postEditorBackdrop.addEventListener("click", () => {
  syncAllFields();
  closeComposer();
});

fields.exportButton.addEventListener("click", () => {
  exportBackup();
});

fields.saveButton.addEventListener("click", async () => {
  try {
    await saveAllChanges();
  } catch (error) {
    setStatus(error.message);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editorState.buttonBuilderOpen) {
    closeButtonBuilder();
    return;
  }

  if (event.key === "Escape" && editorState.citationBuilderOpen) {
    closeCitationBuilder();
    return;
  }

  if (event.key === "Escape" && editorState.composerOpen) {
    syncAllFields();
    closeComposer();
  }
});

function setStatus(message) {
  fields.status.textContent = message;
}

function markDirty() {
  editorState.hasUnsavedChanges = true;
}

async function autoSaveChanges() {
  if (!editorState.content || !editorState.hasUnsavedChanges || editorState.saveInFlight) {
    return;
  }

  try {
    await saveAllChanges();
    setStatus("Autosaved to data/content.json and data/posts/");
  } catch (error) {
    setStatus(`Autosave failed: ${error.message}`);
  }
}

initEditor().catch((error) => {
  fields.status.textContent = error.message;
});
