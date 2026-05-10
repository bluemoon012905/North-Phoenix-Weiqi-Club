// Centralized event wiring keeps the editor logic module focused on state transitions and rendering.
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
  // Treat pasted images like uploads so the editor does not leave blob URLs in saved content.
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

fields.insertInlineWeiqiButton.addEventListener("click", () => {
  insertWeiqiBlockInline();
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

  if (!trySyncAllFields("Fix the current post before switching")) {
    return;
  }
  selectPost(button.dataset.postId, { openComposer: true });
});

fields.contentBlockFields.addEventListener("input", (event) => {
  // Re-render immediately when the block mode changes because the visible controls are mode-specific.
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

  if (event.target.matches('[data-action="rename-animation-chunk"]')) {
    renameAnimatedVariation(blockIndex, event.target.value);
    return;
  }

  if (event.target.matches('[data-action="edit-animation-caption"]')) {
    renameAnimationCaption(blockIndex, event.target.value);
    return;
  }

  if (event.target.matches('[data-action="rename-puzzle-branch"]')) {
    renamePuzzleBranch(blockIndex, event.target.value);
    return;
  }

  if (event.target.matches('[data-action="edit-puzzle-branch-message"]')) {
    editPuzzleBranchMessage(blockIndex, event.target.value);
    return;
  }

  if (event.target.matches('[data-action="set-puzzle-branch-outcome"]')) {
    setPuzzleBranchOutcome(blockIndex, event.target.value);
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
      if (actionButton.dataset.action === "toggle-editor-overview") {
        toggleWeiqiEditorOverview(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "add-animation-chunk") {
        addAnimatedVariation(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "select-animation-chunk") {
        selectAnimatedVariation(blockIndex, Number(actionButton.dataset.chunkIndex));
        return;
      }
      if (actionButton.dataset.action === "delete-animation-chunk") {
        deleteAnimatedVariation(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "move-animation-chunk-up") {
        moveAnimationChunk(blockIndex, "up");
        return;
      }
      if (actionButton.dataset.action === "move-animation-chunk-down") {
        moveAnimationChunk(blockIndex, "down");
        return;
      }
      if (actionButton.dataset.action === "select-animation-move") {
        selectAnimationMove(blockIndex, Number(actionButton.dataset.moveIndex));
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
      if (actionButton.dataset.action === "add-puzzle-branch") {
        addPuzzleBranch(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "select-puzzle-branch") {
        selectPuzzleBranch(blockIndex, Number(actionButton.dataset.branchIndex));
        return;
      }
      if (actionButton.dataset.action === "delete-puzzle-branch") {
        deletePuzzleBranch(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "remove-last-puzzle-branch-move") {
        removeLastPuzzleBranchMove(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "clear-puzzle-branch") {
        clearPuzzleBranch(blockIndex);
        return;
      }
      if (actionButton.dataset.action === "unstack-block") {
        unstackWeiqiBlock(blockIndex);
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
  // Prevent text selection while dragging the Weiqi viewport window in the overview board.
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

fields.contentBlockFields.addEventListener("dragstart", (event) => {
  const dragHandle = event.target.closest("[data-drag-block-handle]");
  if (!dragHandle) {
    return;
  }

  beginContentBlockDrag(Number(dragHandle.dataset.contentBlockIndex));
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragHandle.dataset.contentBlockIndex || "");
  }
});

fields.contentBlockFields.addEventListener("dragover", (event) => {
  const card = event.target.closest(".content-block-card");
  if (!card || !editorState.contentBlockDrag) {
    return;
  }

  const targetIndex = Number(card.dataset.contentBlockCardIndex);
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  const targetSide = getContentBlockDropTargetFromPointer(card, event);
  setContentBlockDropTarget(targetIndex, targetSide);
});

fields.contentBlockFields.addEventListener("dragleave", (event) => {
  const card = event.target.closest(".content-block-card");
  if (!card || !editorState.contentBlockDrag) {
    return;
  }

  const relatedTarget = event.relatedTarget;
  if (relatedTarget && card.contains(relatedTarget)) {
    return;
  }

  const targetIndex = Number(card.dataset.contentBlockCardIndex);
  if (editorState.contentBlockDrag.targetIndex === targetIndex) {
    card.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
    editorState.contentBlockDrag.targetIndex = null;
    editorState.contentBlockDrag.targetSide = null;
  }
});

fields.contentBlockFields.addEventListener("drop", (event) => {
  const card = event.target.closest(".content-block-card");
  if (!card || !editorState.contentBlockDrag) {
    return;
  }

  event.preventDefault();
  const sourceIndex = editorState.contentBlockDrag.sourceIndex;
  const hoveredTargetIndex = Number(card.dataset.contentBlockCardIndex);
  const targetIndex = Number.isInteger(editorState.contentBlockDrag.targetIndex)
    ? editorState.contentBlockDrag.targetIndex
    : hoveredTargetIndex;
  const targetSide = editorState.contentBlockDrag.targetSide || getContentBlockDropTargetFromPointer(card, event);
  endContentBlockDrag();

  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) {
    return;
  }

  const insertionIndex =
    targetSide === "after"
      ? sourceIndex < targetIndex
        ? targetIndex
        : targetIndex + 1
      : sourceIndex < targetIndex
        ? targetIndex - 1
        : targetIndex;

  if (sourceIndex === insertionIndex) {
    return;
  }

  const result = moveContentBlock(sourceIndex, insertionIndex);
  if (!result) {
    return;
  }

  if (!Number.isInteger(result.partnerIndex) || result.partnerIndex < 0) {
    return;
  }

  const post = getCurrentPost();
  const firstBlock = post?.contentBlocks?.[result.movedIndex];
  const secondBlock = post?.contentBlocks?.[result.partnerIndex];
  if (firstBlock?.type !== "weiqi" || secondBlock?.type !== "weiqi") {
    return;
  }

  if (window.confirm("Stack these two Weiqi blocks together in the public post view?")) {
    stackWeiqiBlocks(result.movedIndex, result.partnerIndex);
  }
});

fields.contentBlockFields.addEventListener("dragend", () => {
  endContentBlockDrag();
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
  if (!trySyncAllFields("Fix the current post before opening the composer")) {
    return;
  }
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
  if (!trySyncAllFields("Fix the current post before closing")) {
    return;
  }
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
  if (!trySyncAllFields("Fix the current post before closing")) {
    return;
  }
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
    if (trySyncAllFields("Fix the current post before closing")) {
      closeComposer();
    }
  }
});

function setStatus(message) {
  fields.status.textContent = message;
}

function markDirty() {
  editorState.hasUnsavedChanges = true;
}

async function autoSaveChanges() {
  // Autosave is intentionally conservative: only save when dirty and never overlap requests.
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
