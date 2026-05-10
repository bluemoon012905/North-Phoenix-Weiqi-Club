(function attachBlueshellEditorWeiqiTools() {
  const {
    normalizeWeiqiBlock,
    normalizeViewWindow,
    getDefaultViewWindow,
    normalizeAnimatedVariations,
    normalizePuzzleBranches,
    getCoordinateFromPointer: getWeiqiCoordinateFromPointer,
    getPointKey,
    buildStoneMap,
    applyMoveSequence,
    applyMoveToStoneMap,
  } = window.BlueshellWeiqi;

  const WEIQI_BOARD_SIZES = [9, 13, 19];
  const WEIQI_STONE_COLORS = new Set(["black", "white"]);
  const WEIQI_MARKER_SHAPES = new Set(["", "circle", "square", "triangle", "cross"]);
  const WEIQI_MARKER_MODES = new Set(["label-alpha", "label-numeric", "triangle", "square", "erase"]);

  let env = null;

  function configure(nextEnv) {
    env = nextEnv;
  }

  function getEnv() {
    if (!env) {
      throw new Error("Weiqi editor tools have not been configured.");
    }
    return env;
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

  function validateStoneProgression(initialPosition, sequence, boardSize, label) {
    let stoneMap = buildStoneMap(initialPosition);
    sequence.forEach((stone, index) => {
      try {
        stoneMap = applyMoveToStoneMap(stoneMap, stone, boardSize).stoneMap;
      } catch (error) {
        throw new Error(`${label} item ${index + 1} is invalid: ${error.message}`);
      }
    });
  }

  function validatePuzzleBranches(initialPosition, branches, boardSize, labelPrefix = "Puzzle branch", playerSide = "both", options = {}) {
    const normalizedBranches = Array.isArray(branches) ? branches : [];
    const allowIncompletePrefixOverlap = options.allowIncompletePrefixOverlap === true;

    normalizedBranches.forEach((branch, branchIndex) => {
      if (!branch || typeof branch !== "object") {
        throw new Error(`${labelPrefix} ${branchIndex + 1} is invalid.`);
      }
      if (branch.outcome !== "correct" && branch.outcome !== "incorrect") {
        throw new Error(`${labelPrefix} ${branchIndex + 1} must end in correct or incorrect.`);
      }
      if (branch.message != null && typeof branch.message !== "string") {
        throw new Error(`${labelPrefix} ${branchIndex + 1} message must be a string.`);
      }

      if (playerSide !== "both" && Array.isArray(branch.moves) && branch.moves.length > 0) {
        const branchLabel = branch.label || `${labelPrefix} ${branchIndex + 1}`;
        const firstMove = branch.moves[0];
        if (firstMove && firstMove.color !== playerSide) {
          throw new Error(
            `${branchLabel} starts with ${firstMove.color}, but player side is set to "${playerSide} to play". The first move must be ${playerSide}.`
          );
        }
        const opponentSide = playerSide === "black" ? "white" : "black";
        branch.moves.forEach((move, moveIndex) => {
          const expectedColor = moveIndex % 2 === 0 ? playerSide : opponentSide;
          if (move.color !== expectedColor) {
            throw new Error(
              `${branchLabel} move ${moveIndex + 1} should be ${expectedColor} (player side: ${playerSide}), but is ${move.color}.`
            );
          }
        });
      }

      validateStoneProgression(initialPosition, branch.moves || [], boardSize, branch.label || `${labelPrefix} ${branchIndex + 1}`);
    });

    for (let i = 0; i < normalizedBranches.length; i += 1) {
      for (let j = i + 1; j < normalizedBranches.length; j += 1) {
        const a = normalizedBranches[i];
        const b = normalizedBranches[j];
        const sharedLength = Math.min(a.moves.length, b.moves.length);
        let diverged = false;

        for (let k = 0; k < sharedLength; k += 1) {
          const aMove = a.moves[k];
          const bMove = b.moves[k];
          if (!aMove || !bMove || aMove.color !== bMove.color || aMove.x !== bMove.x || aMove.y !== bMove.y) {
            diverged = true;
            break;
          }
        }

        if (allowIncompletePrefixOverlap) {
          continue;
        }

        if (!diverged && (a.moves.length === sharedLength || b.moves.length === sharedLength)) {
          throw new Error(`Puzzle branches "${a.label || `Branch ${i + 1}`}" and "${b.label || `Branch ${j + 1}`}" cannot end on the same prefix path.`);
        }
      }
    }
  }

  function sanitizeWeiqiStackGroup(block) {
    if (!block || block.type !== "weiqi") {
      return block;
    }

    return {
      ...block,
      stackGroup: typeof block.stackGroup === "string" ? block.stackGroup.trim() : "",
    };
  }

  function cleanupWeiqiStackGroups(blocks = []) {
    blocks.forEach((block, index) => {
      if (block?.type !== "weiqi" || !block.stackGroup) {
        return;
      }

      const previousBlock = blocks[index - 1];
      const nextBlock = blocks[index + 1];
      const hasAdjacentMatch =
        (previousBlock?.type === "weiqi" && previousBlock.stackGroup === block.stackGroup) ||
        (nextBlock?.type === "weiqi" && nextBlock.stackGroup === block.stackGroup);

      if (!hasAdjacentMatch) {
        blocks[index] = {
          ...block,
          stackGroup: "",
        };
      }
    });
  }

  function createDefaultPuzzleBranch(index = 0) {
    return {
      id: `branch-${index + 1}`,
      label: `Branch ${index + 1}`,
      moves: [],
      outcome: "correct",
      message: "",
    };
  }

  function ensureEditablePuzzleBranches(branches) {
    if (Array.isArray(branches) && branches.length) {
      return branches;
    }
    return [createDefaultPuzzleBranch(0)];
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
      stackGroup: card.querySelector('[data-weiqi-key="stackGroup"]')?.value.trim() || "",
      initialPosition: parseStoneText(card.querySelector('[data-weiqi-key="initialPosition"]').value, boardSize, "Initial position"),
      markers: parseMarkerText(card.querySelector('[data-weiqi-key="markers"]').value, boardSize),
      viewWindow: JSON.parse(card.querySelector('[data-weiqi-key="viewWindow"]').value || "{}"),
    });
    validateUniqueStonePoints(block.initialPosition, "Initial position");

    if (mode === "animated") {
      block.animationChunks = normalizeAnimatedVariations({
        animationChunks: JSON.parse(card.querySelector('[data-weiqi-key="animationChunks"]').value || "[]"),
      });
      let currentStones = [...block.initialPosition];
      block.animationChunks.forEach((chunk) => {
        validateStoneProgression(currentStones, chunk.moves, block.boardSize, chunk.label || "Chunk");
        currentStones = applyMoveSequence(currentStones, chunk.moves || [], block.boardSize).stones;
      });
    }

    if (mode === "puzzle") {
      const rawPlayerSide = card.querySelector('[data-weiqi-key="playerSide"]')?.value || "both";
      block.playerSide = rawPlayerSide === "black" ? "black" : rawPlayerSide === "white" ? "white" : "both";
      block.prompt = card.querySelector('[data-weiqi-key="prompt"]').value.trim() || "Black to play. Find the best move.";
      block.branches = ensureEditablePuzzleBranches(
        normalizePuzzleBranches({
          branches: JSON.parse(card.querySelector('[data-weiqi-key="branches"]').value || "[]"),
        })
      );
      validatePuzzleBranches(block.initialPosition, block.branches, block.boardSize, "Puzzle branch", block.playerSide, {
        allowIncompletePrefixOverlap: true,
      });
      block.defaultIncorrectMessage = card.querySelector('[data-weiqi-key="defaultIncorrectMessage"]').value.trim();
      block.explanation = card.querySelector('[data-weiqi-key="explanation"]').value.trim();
    }

    return sanitizeWeiqiStackGroup(block);
  }

  function collectContentBlocksFromEditor({ throwOnError = true } = {}) {
    const { fields, setStatus } = getEnv();
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

  function syncStructuredContentBlocks(options = {}) {
    const { getCurrentPost, renderPostPreview, markDirty } = getEnv();
    const post = getCurrentPost();
    if (!post) {
      return true;
    }

    const nextBlocks = collectContentBlocksFromEditor(options);
    if (!nextBlocks) {
      return false;
    }

    post.contentBlocks = nextBlocks;
    cleanupWeiqiStackGroups(post.contentBlocks);
    renderPostPreview(post);
    markDirty();
    return true;
  }

  function addWeiqiBlock(mode = "static") {
    const { getCurrentPost, getDefaultWeiqiBlock, getWeiqiEditorState, renderContentBlockFields, renderPostPreview, markDirty, setStatus } = getEnv();
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
    const { getCurrentPost, renderContentBlockFields, renderPostPreview, markDirty, setStatus } = getEnv();
    const post = getCurrentPost();
    if (!post || !Array.isArray(post.contentBlocks) || !post.contentBlocks[blockIndex]) {
      return;
    }

    if (!syncStructuredContentBlocks({ throwOnError: false })) {
      return;
    }

    post.contentBlocks.splice(blockIndex, 1);
    cleanupWeiqiStackGroups(post.contentBlocks);
    renderContentBlockFields(post);
    renderPostPreview(post);
    markDirty();
    setStatus("Deleted structured content block");
  }

  function withEditableWeiqiBlock(blockIndex, updater, statusMessage = "") {
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields, renderPostPreview, markDirty, setStatus } = getEnv();
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

  function moveViewWindowToCoordinate(block, coordinate) {
    const currentWindow = normalizeViewWindow(block.boardSize, block.viewWindow);
    const width = currentWindow.xMax - currentWindow.xMin;
    const height = currentWindow.yMax - currentWindow.yMin;
    let xMin = coordinate.x - Math.floor(width / 2);
    let yMin = coordinate.y - Math.floor(height / 2);
    xMin = Math.max(0, Math.min(block.boardSize - 1 - width, xMin));
    yMin = Math.max(0, Math.min(block.boardSize - 1 - height, yMin));
    block.viewWindow = normalizeViewWindow(block.boardSize, {
      xMin,
      yMin,
      xMax: xMin + width,
      yMax: yMin + height,
    });
  }

  function handleWeiqiBoardPlacement(blockIndex, boardType, event) {
    const {
      getCurrentPost,
      fields,
      getWeiqiEditorState,
      renderContentBlockFields,
      renderPostPreview,
      markDirty,
    } = getEnv();
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
    } else if (editorUiState.layer === "branch") {
      appendStoneToPuzzleBranch(block, editorUiState, coordinate);
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

    let color;
    if (tool === "alternate") {
      const blackCount = nextStones.filter((stone) => stone.color === "black").length;
      const whiteCount = nextStones.filter((stone) => stone.color === "white").length;
      color = blackCount <= whiteCount ? "black" : "white";
    } else {
      color = tool === "white" ? "white" : "black";
    }
    nextStones.push({ color, x: coordinate.x, y: coordinate.y });
    block.initialPosition = nextStones;
  }

  function placeMarkerOnBlock(block, coordinate, editorUiState) {
    if (block.mode === "animated") {
      const chunk = block.animationChunks?.[editorUiState.selectedChunkIndex] || block.animationChunks?.[0];
      const move = chunk?.moves?.[Math.max(0, (editorUiState.selectedMoveIndex || 1) - 1)];
      if (!move) {
        throw new Error("Select an animation move before adding markers.");
      }

      const nextMarkers = (move.markers || []).filter((marker) => getPointKey(marker) !== getPointKey(coordinate));
      if (editorUiState.markerMode === "erase") {
        move.markers = nextMarkers;
        return;
      }

      const nextMarker = buildMarkerForMode(nextMarkers, coordinate, editorUiState.markerMode);
      if (!nextMarker) {
        move.markers = nextMarkers;
        return;
      }

      nextMarkers.push(nextMarker);
      move.markers = nextMarkers;
      return;
    }

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
    const chunk = block.animationChunks[editorUiState.selectedChunkIndex] || block.animationChunks[0];
    if (!chunk) {
      return;
    }

    const priorMoves = (block.animationChunks || []).slice(0, editorUiState.selectedChunkIndex).flatMap((entry) => entry.moves || []);
    const currentStones = applyMoveSequence(block.initialPosition || [], priorMoves, block.boardSize).stones;
    updateSequenceMoves(currentStones, chunk.moves, block.boardSize, coordinate, editorUiState.tool);
    editorUiState.selectedMoveIndex = chunk.moves.length;
  }

  function appendStoneToPuzzleBranch(block, editorUiState, coordinate) {
    const branch = block.branches[editorUiState.selectedBranchIndex] || block.branches[0];
    if (!branch) {
      return;
    }

    const playerSide = block.playerSide;
    let tool = "auto";
    if (playerSide === "black" || playerSide === "white") {
      const opponentSide = playerSide === "black" ? "white" : "black";
      tool = branch.moves.length % 2 === 0 ? playerSide : opponentSide;
    }

    updateSequenceMoves(block.initialPosition, branch.moves, block.boardSize, coordinate, tool);
  }

  function updateSequenceMoves(initialPosition, sequence, boardSize, coordinate, tool) {
    const occupied = applyMoveSequence(initialPosition, sequence, boardSize).stoneMap;
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
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields } = getEnv();
    const post = getCurrentPost();
    const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
    const validLayers = new Set(["initial", "variation", "branch", "markers"]);
    if (!block || !validLayers.has(layer)) {
      return;
    }
    getWeiqiEditorState(blockIndex, block).layer = layer;
    renderContentBlockFields(post);
  }

  function setWeiqiEditorOpen(blockIndex, isOpen) {
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields } = getEnv();
    const post = getCurrentPost();
    const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
    if (!block) {
      return;
    }
    getWeiqiEditorState(blockIndex, block).isOpen = isOpen;
    renderContentBlockFields(post);
  }

  function setWeiqiEditorTool(blockIndex, tool) {
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields } = getEnv();
    const post = getCurrentPost();
    const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
    if (!block) {
      return;
    }
    const state = getWeiqiEditorState(blockIndex, block);
    state.tool = tool;
    if (block.mode === "static") {
      state.layer = "initial";
    }
    renderContentBlockFields(post);
  }

  function setWeiqiEditorMarkerMode(blockIndex, markerMode) {
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields } = getEnv();
    const post = getCurrentPost();
    const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
    if (!block) {
      return;
    }
    const state = getWeiqiEditorState(blockIndex, block);
    state.markerMode = markerMode;
    if (block.mode === "static") {
      state.layer = "markers";
    }
    renderContentBlockFields(post);
  }

  function toggleWeiqiEditorOverview(blockIndex) {
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields } = getEnv();
    const post = getCurrentPost();
    const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
    if (!block) {
      return;
    }
    const state = getWeiqiEditorState(blockIndex, block);
    state.showOverview = !state.showOverview;
    renderContentBlockFields(post);
  }

  function moveContentBlock(fromIndex, toIndex) {
    const { getCurrentPost, renderContentBlockFields, renderPostPreview, markDirty, setStatus } = getEnv();
    const post = getCurrentPost();
    if (!post || !Array.isArray(post.contentBlocks)) {
      return null;
    }

    if (!syncStructuredContentBlocks({ throwOnError: false })) {
      return null;
    }

    const maxIndex = post.contentBlocks.length - 1;
    const nextIndex = Math.max(0, Math.min(toIndex, maxIndex));
    if (fromIndex === nextIndex || !post.contentBlocks[fromIndex]) {
      renderContentBlockFields(post);
      return {
        movedIndex: fromIndex,
        partnerIndex: fromIndex,
      };
    }

    const [movedBlock] = post.contentBlocks.splice(fromIndex, 1);
    post.contentBlocks.splice(nextIndex, 0, movedBlock);
    cleanupWeiqiStackGroups(post.contentBlocks);
    renderContentBlockFields(post);
    renderPostPreview(post);
    markDirty();
    setStatus(`Moved Weiqi block to position ${nextIndex + 1}`);
    return {
      movedIndex: nextIndex,
      partnerIndex: nextIndex > fromIndex ? nextIndex - 1 : nextIndex + 1,
    };
  }

  function stackWeiqiBlocks(firstIndex, secondIndex) {
    const { getCurrentPost, renderContentBlockFields, renderPostPreview, markDirty, setStatus } = getEnv();
    const post = getCurrentPost();
    if (!post || !Array.isArray(post.contentBlocks)) {
      return;
    }

    const firstBlock = normalizeWeiqiBlock(post.contentBlocks[firstIndex]);
    const secondBlock = normalizeWeiqiBlock(post.contentBlocks[secondIndex]);
    if (!firstBlock || !secondBlock || firstBlock.type !== "weiqi" || secondBlock.type !== "weiqi") {
      return;
    }

    const nextStackGroup = firstBlock.stackGroup || secondBlock.stackGroup || `stack-${Date.now()}`;
    firstBlock.stackGroup = nextStackGroup;
    secondBlock.stackGroup = nextStackGroup;
    post.contentBlocks[firstIndex] = sanitizeWeiqiStackGroup(firstBlock);
    post.contentBlocks[secondIndex] = sanitizeWeiqiStackGroup(secondBlock);
    cleanupWeiqiStackGroups(post.contentBlocks);
    renderContentBlockFields(post);
    renderPostPreview(post);
    markDirty();
    setStatus("Stacked the two Weiqi blocks for the public post view.");
  }

  function unstackWeiqiBlock(blockIndex) {
    const { getCurrentPost, renderContentBlockFields, renderPostPreview, markDirty, setStatus } = getEnv();
    const post = getCurrentPost();
    if (!post || !Array.isArray(post.contentBlocks) || !post.contentBlocks[blockIndex]) {
      return;
    }

    if (!syncStructuredContentBlocks({ throwOnError: false })) {
      return;
    }

    const block = normalizeWeiqiBlock(post.contentBlocks[blockIndex]);
    if (!block || block.type !== "weiqi" || !block.stackGroup) {
      return;
    }

    block.stackGroup = "";
    post.contentBlocks[blockIndex] = sanitizeWeiqiStackGroup(block);
    cleanupWeiqiStackGroups(post.contentBlocks);
    renderContentBlockFields(post);
    renderPostPreview(post);
    markDirty();
    setStatus("Removed this Weiqi block from its public stack.");
  }

  function addAnimatedVariation(blockIndex) {
    withEditableWeiqiBlock(
      blockIndex,
      (block, editorUiState) => {
        editorUiState.isOpen = true;
        const nextIndex = (block.animationChunks?.length || 0) + 1;
        block.animationChunks.push({
          id: `chunk-${Date.now()}`,
          label: `Chunk ${nextIndex}`,
          caption: "",
          moves: [],
        });
        editorUiState.selectedChunkIndex = block.animationChunks.length - 1;
        editorUiState.selectedMoveIndex = 0;
        editorUiState.layer = "variation";
      },
      "Added animation chunk"
    );
  }

  function selectAnimatedVariation(blockIndex, variationIndex) {
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields } = getEnv();
    const post = getCurrentPost();
    const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
    if (!block) {
      return;
    }
    const state = getWeiqiEditorState(blockIndex, block);
    state.selectedChunkIndex = variationIndex;
    state.selectedMoveIndex = 0;
    renderContentBlockFields(post);
  }

  function renameAnimatedVariation(blockIndex, label) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const chunk = block.animationChunks[editorUiState.selectedChunkIndex] || block.animationChunks[0];
      if (chunk) {
        chunk.label = label.trim() || chunk.label;
      }
    });
  }

  function deleteAnimatedVariation(blockIndex) {
    withEditableWeiqiBlock(
      blockIndex,
      (block, editorUiState) => {
        if (block.animationChunks.length <= 1) {
          return;
        }
        block.animationChunks.splice(editorUiState.selectedChunkIndex, 1);
        editorUiState.selectedChunkIndex = Math.max(0, editorUiState.selectedChunkIndex - 1);
        editorUiState.selectedMoveIndex = 0;
      },
      "Deleted animation chunk"
    );
  }

  function removeLastVariationMove(blockIndex) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const chunk = block.animationChunks[editorUiState.selectedChunkIndex] || block.animationChunks[0];
      chunk?.moves?.pop();
      editorUiState.selectedMoveIndex = Math.min(editorUiState.selectedMoveIndex || 0, chunk?.moves?.length || 0);
    });
  }

  function clearVariation(blockIndex) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const chunk = block.animationChunks[editorUiState.selectedChunkIndex] || block.animationChunks[0];
      if (chunk) {
        chunk.moves = [];
        editorUiState.selectedMoveIndex = 0;
      }
    });
  }

  function renameAnimationCaption(blockIndex, caption) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const chunk = block.animationChunks[editorUiState.selectedChunkIndex] || block.animationChunks[0];
      if (chunk) {
        chunk.caption = caption;
      }
    });
  }

  function moveAnimationChunk(blockIndex, direction) {
    withEditableWeiqiBlock(
      blockIndex,
      (block, editorUiState) => {
        const fromIndex = editorUiState.selectedChunkIndex;
        const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
        if (toIndex < 0 || toIndex >= (block.animationChunks || []).length) {
          return;
        }
        const [chunk] = block.animationChunks.splice(fromIndex, 1);
        block.animationChunks.splice(toIndex, 0, chunk);
        editorUiState.selectedChunkIndex = toIndex;
      },
      `Moved animation chunk ${direction}`
    );
  }

  function selectAnimationMove(blockIndex, moveIndex) {
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields } = getEnv();
    const post = getCurrentPost();
    const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
    if (!block) {
      return;
    }

    const state = getWeiqiEditorState(blockIndex, block);
    const chunk = block.animationChunks[state.selectedChunkIndex] || block.animationChunks[0];
    const maxMoveIndex = Array.isArray(chunk?.moves) ? chunk.moves.length : 0;
    state.selectedMoveIndex = Math.max(0, Math.min(moveIndex, maxMoveIndex));
    renderContentBlockFields(post);
  }

  function addPuzzleBranch(blockIndex) {
    withEditableWeiqiBlock(
      blockIndex,
      (block, editorUiState) => {
        editorUiState.isOpen = true;
        const nextIndex = (block.branches?.length || 0) + 1;
        block.branches.push({
          id: `branch-${Date.now()}`,
          label: `Branch ${nextIndex}`,
          moves: [],
          outcome: "correct",
          message: "",
        });
        editorUiState.selectedBranchIndex = block.branches.length - 1;
        editorUiState.layer = "branch";
      },
      "Added puzzle branch"
    );
  }

  function selectPuzzleBranch(blockIndex, branchIndex) {
    const { getCurrentPost, getWeiqiEditorState, renderContentBlockFields } = getEnv();
    const post = getCurrentPost();
    const block = normalizeWeiqiBlock(post?.contentBlocks?.[blockIndex]);
    if (!block) {
      return;
    }
    getWeiqiEditorState(blockIndex, block).selectedBranchIndex = branchIndex;
    renderContentBlockFields(post);
  }

  function renamePuzzleBranch(blockIndex, label) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const branch = block.branches[editorUiState.selectedBranchIndex] || block.branches[0];
      if (branch) {
        branch.label = label.trim() || branch.label;
      }
    });
  }

  function setPuzzleBranchOutcome(blockIndex, outcome) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const branch = block.branches[editorUiState.selectedBranchIndex] || block.branches[0];
      if (branch) {
        branch.outcome = outcome === "correct" ? "correct" : "incorrect";
        if (!branch.label.trim()) {
          branch.label = "Branch";
        }
      }
    });
  }

  function editPuzzleBranchMessage(blockIndex, message) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const branch = block.branches[editorUiState.selectedBranchIndex] || block.branches[0];
      if (branch) {
        branch.message = message;
      }
    });
  }

  function deletePuzzleBranch(blockIndex) {
    withEditableWeiqiBlock(
      blockIndex,
      (block, editorUiState) => {
        if (block.branches.length <= 1) {
          return;
        }
        block.branches.splice(editorUiState.selectedBranchIndex, 1);
        editorUiState.selectedBranchIndex = Math.max(0, editorUiState.selectedBranchIndex - 1);
      },
      "Deleted puzzle branch"
    );
  }

  function removeLastPuzzleBranchMove(blockIndex) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const branch = block.branches[editorUiState.selectedBranchIndex] || block.branches[0];
      branch?.moves?.pop();
    });
  }

  function clearPuzzleBranch(blockIndex) {
    withEditableWeiqiBlock(blockIndex, (block, editorUiState) => {
      const branch = block.branches[editorUiState.selectedBranchIndex] || block.branches[0];
      if (branch) {
        branch.moves = [];
      }
    });
  }

  function beginWeiqiViewportDrag(blockIndex, event) {
    const { getCurrentPost, fields, editorState } = getEnv();
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
    const { editorState, getCurrentPost, fields, renderContentBlockFields, renderPostPreview, markDirty } = getEnv();
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
    const { editorState } = getEnv();
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

  window.BlueshellEditorWeiqiTools = {
    configure,
    assertBoardSize,
    assertCoordinateInBounds,
    validateUniqueStonePoints,
    validateStoneProgression,
    validatePuzzleBranches,
    sanitizeWeiqiStackGroup,
    cleanupWeiqiStackGroups,
    collectContentBlocksFromEditor,
    syncStructuredContentBlocks,
    addWeiqiBlock,
    deleteContentBlock,
    handleWeiqiBoardPlacement,
    setWeiqiEditorLayer,
    setWeiqiEditorOpen,
    setWeiqiEditorTool,
    setWeiqiEditorMarkerMode,
    toggleWeiqiEditorOverview,
    moveContentBlock,
    stackWeiqiBlocks,
    unstackWeiqiBlock,
    addAnimatedVariation,
    selectAnimatedVariation,
    renameAnimatedVariation,
    deleteAnimatedVariation,
    removeLastVariationMove,
    clearVariation,
    renameAnimationCaption,
    moveAnimationChunk,
    selectAnimationMove,
    addPuzzleBranch,
    selectPuzzleBranch,
    renamePuzzleBranch,
    setPuzzleBranchOutcome,
    editPuzzleBranchMessage,
    deletePuzzleBranch,
    removeLastPuzzleBranchMove,
    clearPuzzleBranch,
    beginWeiqiViewportDrag,
    continueWeiqiViewportDrag,
    endWeiqiViewportDrag,
  };
})();
