// Client-side renderer/runtime for structured Weiqi content blocks used in posts and previews.
const BlueshellWeiqi = (() => {
  const BOARD_SIZES = new Set([9, 13, 19]);
  const BLOCK_SELECTOR = "[data-weiqi-block]";
  const STACK_SELECTOR = "[data-weiqi-stack]";
  const boardRegistry = new WeakMap();
  const SVG_DIMENSION = 512;
  const SVG_PADDING = 30;
  const MIN_VIEW_SPAN = 4;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function normalizeBlocks(blocks) {
    return Array.isArray(blocks) ? blocks.filter((block) => block && typeof block === "object") : [];
  }

  function getDefaultViewWindow(boardSize) {
    return {
      xMin: 0,
      yMin: 0,
      xMax: boardSize - 1,
      yMax: boardSize - 1,
    };
  }

  function normalizeViewWindow(boardSize, viewWindow) {
    const fallback = getDefaultViewWindow(boardSize);
    if (!viewWindow || typeof viewWindow !== "object") {
      return fallback;
    }

    const raw = {
      xMin: Number.isInteger(viewWindow.xMin) ? viewWindow.xMin : fallback.xMin,
      yMin: Number.isInteger(viewWindow.yMin) ? viewWindow.yMin : fallback.yMin,
      xMax: Number.isInteger(viewWindow.xMax) ? viewWindow.xMax : fallback.xMax,
      yMax: Number.isInteger(viewWindow.yMax) ? viewWindow.yMax : fallback.yMax,
    };

    raw.xMin = clamp(raw.xMin, 0, boardSize - 1);
    raw.yMin = clamp(raw.yMin, 0, boardSize - 1);
    raw.xMax = clamp(raw.xMax, raw.xMin, boardSize - 1);
    raw.yMax = clamp(raw.yMax, raw.yMin, boardSize - 1);

    const minSpan = Math.min(MIN_VIEW_SPAN, boardSize - 1);
    if (raw.xMax - raw.xMin < minSpan) {
      raw.xMax = clamp(raw.xMin + minSpan, 0, boardSize - 1);
      raw.xMin = clamp(raw.xMax - minSpan, 0, boardSize - 1);
    }
    if (raw.yMax - raw.yMin < minSpan) {
      raw.yMax = clamp(raw.yMin + minSpan, 0, boardSize - 1);
      raw.yMin = clamp(raw.yMax - minSpan, 0, boardSize - 1);
    }

    return raw;
  }

  function normalizeMarker(marker) {
    if (!marker || typeof marker !== "object") {
      return null;
    }

    return {
      x: Number.isInteger(marker.x) ? marker.x : 0,
      y: Number.isInteger(marker.y) ? marker.y : 0,
      ...(typeof marker.label === "string" && marker.label ? { label: marker.label } : {}),
      ...(typeof marker.shape === "string" && marker.shape ? { shape: marker.shape } : {}),
    };
  }

  function normalizeMove(move) {
    if (!move || typeof move !== "object") {
      return null;
    }

    return {
      color: move.color === "white" ? "white" : "black",
      x: Number.isInteger(move.x) ? move.x : 0,
      y: Number.isInteger(move.y) ? move.y : 0,
      markers: Array.isArray(move.markers) ? move.markers.map(normalizeMarker).filter(Boolean) : [],
    };
  }

  function normalizeAnimationChunks(block) {
    // Support both the current `animationChunks` shape and older variation-based content.
    if (Array.isArray(block.animationChunks) && block.animationChunks.length) {
      return block.animationChunks.map((chunk, index) => ({
        id: chunk.id || `chunk-${index + 1}`,
        label: chunk.label || `Chunk ${index + 1}`,
        caption: typeof chunk.caption === "string" ? chunk.caption : "",
        moves: Array.isArray(chunk.moves) ? chunk.moves.map(normalizeMove).filter(Boolean) : [],
      }));
    }

    if (Array.isArray(block.variations) && block.variations.length) {
      return block.variations.map((variation, index) => ({
        id: variation.id || `chunk-${index + 1}`,
        label: variation.label || `Chunk ${index + 1}`,
        caption: typeof variation.caption === "string" ? variation.caption : "",
        moves: Array.isArray(variation.moves) ? variation.moves.map(normalizeMove).filter(Boolean) : [],
      }));
    }

    return [
      {
        id: "chunk-1",
        label: "Main line",
        caption: "",
        moves: Array.isArray(block.moves) ? block.moves.map(normalizeMove).filter(Boolean) : [],
      },
    ];
  }

  function normalizePuzzleSuccessSequence(block) {
    return Array.isArray(block.successSequence) ? block.successSequence : Array.isArray(block.solution) ? block.solution : [];
  }

  function normalizePuzzleFailureSequences(block) {
    if (Array.isArray(block.failureSequences) && block.failureSequences.length) {
      return block.failureSequences.map((sequence, index) => ({
        id: sequence.id || `failure-${index + 1}`,
        label: sequence.label || `Failure ${index + 1}`,
        moves: Array.isArray(sequence.moves) ? sequence.moves : [],
        message: typeof sequence.message === "string" ? sequence.message : "",
      }));
    }

    if (Array.isArray(block.failureStates) && block.failureStates.length) {
      return block.failureStates.map((failureState, index) => ({
        id: `failure-${index + 1}`,
        label: `Failure ${index + 1}`,
        moves: [{ color: normalizePuzzleSuccessSequence(block)[0]?.color || "black", x: failureState.x, y: failureState.y }],
        message: typeof failureState.message === "string" ? failureState.message : "",
      }));
    }

    return [];
  }

  function normalizePuzzleBranches(block) {
    // Puzzle content has evolved over time, so accept authored branches and older success/failure shapes.
    if (Array.isArray(block.branches) && block.branches.length) {
      return block.branches.map((branch, index) => ({
        id: branch.id || `branch-${index + 1}`,
        label: branch.label || `Branch ${index + 1}`,
        moves: Array.isArray(branch.moves) ? branch.moves : [],
        outcome: branch.outcome === "incorrect" ? "incorrect" : "correct",
        message: typeof branch.message === "string" ? branch.message : "",
      }));
    }

    const branches = [];
    const successSequence = normalizePuzzleSuccessSequence(block);
    if (successSequence.length) {
      branches.push({
        id: "branch-1",
        label: "Correct line",
        moves: successSequence,
        outcome: "correct",
        message: "",
      });
    }

    normalizePuzzleFailureSequences(block).forEach((sequence, index) => {
      branches.push({
        id: sequence.id || `branch-${branches.length + 1}`,
        label: sequence.label || `Branch ${index + 2}`,
        moves: Array.isArray(sequence.moves) ? sequence.moves : [],
        outcome: "incorrect",
        message: typeof sequence.message === "string" ? sequence.message : "",
      });
    });

    return branches;
  }

  function normalizeWeiqiBlock(block) {
    if (!block || block.type !== "weiqi") {
      return block;
    }

    const boardSize = BOARD_SIZES.has(Number(block.boardSize)) ? Number(block.boardSize) : 19;
    return {
      ...block,
      boardSize,
      coordinateSystem: block.coordinateSystem || "zero-based",
      stackGroup: typeof block.stackGroup === "string" ? block.stackGroup.trim() : "",
      initialPosition: Array.isArray(block.initialPosition) ? block.initialPosition.map(normalizeMove).filter(Boolean) : [],
      markers: Array.isArray(block.markers) ? block.markers.map(normalizeMarker).filter(Boolean) : [],
      viewWindow: normalizeViewWindow(boardSize, block.viewWindow),
      animationChunks: normalizeAnimationChunks(block),
      successSequence: normalizePuzzleSuccessSequence(block),
      failureSequences: normalizePuzzleFailureSequences(block),
      branches: normalizePuzzleBranches(block),
      defaultIncorrectMessage:
        typeof block.defaultIncorrectMessage === "string" && block.defaultIncorrectMessage.trim()
          ? block.defaultIncorrectMessage
          : "That move does not match an authored variation.",
      playerSide: block.playerSide === "black" ? "black" : block.playerSide === "white" ? "white" : "both",
    };
  }

  function expandInlineBlocks(rootElement, blocks) {
    const normalizedBlocks = normalizeBlocks(blocks);
    const inlinedIndices = new Set();

    rootElement.querySelectorAll("[data-weiqi-block-index]").forEach((placeholder) => {
      const index = parseInt(placeholder.dataset.weiqiBlockIndex, 10);
      if (isNaN(index) || index < 0 || index >= normalizedBlocks.length) {
        return;
      }

      const rawBlock = normalizedBlocks[index];
      let blockHtml;
      if (rawBlock.type === "weiqi") {
        blockHtml = renderWeiqiBlockShell(normalizeWeiqiBlock(rawBlock));
      } else {
        blockHtml = `<section class="structured-block structured-block-unsupported"><p class="structured-block-label">Unsupported content</p><pre>${escapeHtml(JSON.stringify(rawBlock, null, 2))}</pre></section>`;
      }

      const container = document.createElement("div");
      container.innerHTML = blockHtml;
      placeholder.replaceWith(...container.childNodes);
      inlinedIndices.add(index);
    });

    return inlinedIndices;
  }

  function renderStructuredContentBlocks(blocks) {
    const normalizedBlocks = normalizeBlocks(blocks);
    if (!normalizedBlocks.length) {
      return "";
    }

    const renderedBlocks = [];
    for (let index = 0; index < normalizedBlocks.length; index += 1) {
      const rawBlock = normalizedBlocks[index];
      if (rawBlock.type === "weiqi") {
        const normalizedBlock = normalizeWeiqiBlock(rawBlock);
        const stackBlocks = [normalizedBlock];
        while (
          index + 1 < normalizedBlocks.length &&
          normalizedBlocks[index + 1]?.type === "weiqi" &&
          normalizeWeiqiBlock(normalizedBlocks[index + 1]).stackGroup &&
          normalizeWeiqiBlock(normalizedBlocks[index + 1]).stackGroup === normalizedBlock.stackGroup &&
          normalizedBlock.stackGroup
        ) {
          stackBlocks.push(normalizeWeiqiBlock(normalizedBlocks[index + 1]));
          index += 1;
        }

        if (stackBlocks.length > 1) {
          renderedBlocks.push(renderWeiqiStackShell(stackBlocks));
        } else {
          renderedBlocks.push(renderWeiqiBlockShell(normalizedBlock));
        }
        continue;
      }

      renderedBlocks.push(`
        <section class="structured-block structured-block-unsupported">
          <p class="structured-block-label">Unsupported content</p>
          <pre>${escapeHtml(JSON.stringify(rawBlock, null, 2))}</pre>
        </section>
      `);
    }

    return `<div class="post-structured-content">${renderedBlocks.join("")}</div>`;
  }

  function renderWeiqiStackShell(blocks) {
    return `
      <section class="structured-block weiqi-stack" data-weiqi-stack data-active-stack-index="0">
        <div class="weiqi-stack-pages">
          ${blocks
            .map(
              (block, index) => `
                <div class="weiqi-stack-page ${index === 0 ? "" : "hidden"}" data-weiqi-stack-page="${index}">
                  <div class="weiqi-block weiqi-stack-block" data-weiqi-block="${escapeAttribute(JSON.stringify(block))}">
                    ${renderWeiqiBlockInner(block)}
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="weiqi-stack-nav">
          <button type="button" class="secondary-ink" data-weiqi-stack-action="prev" aria-label="Previous stacked board">←</button>
          <p class="weiqi-stack-status" data-weiqi-stack-status>Board 1 of ${blocks.length}</p>
          <button type="button" class="secondary-ink" data-weiqi-stack-action="next" aria-label="Next stacked board">→</button>
        </div>
      </section>
    `;
  }

  function renderWeiqiBlockShell(block) {
    return `
      <section class="structured-block weiqi-block" data-weiqi-block="${escapeAttribute(JSON.stringify(block))}">
        ${renderWeiqiBlockInner(block)}
      </section>
    `;
  }

  function renderWeiqiBlockInner(block) {
    const modeLabel = escapeHtml(getModeLabel(block.mode));
    const caption = block.caption ? `<p class="weiqi-caption">${escapeHtml(block.caption)}</p>` : "";
    const prompt = block.mode === "puzzle" && block.prompt ? `<p class="weiqi-prompt">${escapeHtml(block.prompt)}</p>` : "";
    const explanation =
      block.mode === "puzzle" && block.explanation
        ? `<div class="weiqi-explanation hidden" data-weiqi-explanation>${escapeHtml(block.explanation)}</div>`
        : "";
    const dynamicCaption = block.mode === "animated" ? `<p class="weiqi-dynamic-caption hidden" data-weiqi-dynamic-caption></p>` : "";
    const controls = renderControls(block);

    return `
      <div class="weiqi-header">
        <div>
          <p class="structured-block-label">Weiqi ${modeLabel}</p>
          ${caption}
          ${prompt}
        </div>
        <p class="weiqi-meta">${escapeHtml(`${block.boardSize}x${block.boardSize} board • zero-based coordinates`)}</p>
      </div>
      <div class="weiqi-board-shell ${block.mode === "puzzle" ? "is-clickable" : ""}">
        <div class="weiqi-board" data-weiqi-board role="${block.mode === "puzzle" ? "button" : "img"}" aria-label="${escapeAttribute(
          getAriaLabel(block)
        )}" tabindex="${block.mode === "puzzle" ? "0" : "-1"}" style="${escapeAttribute(
          `--weiqi-board-aspect-ratio: ${getBoardAspectRatioValue(block.boardSize, block.viewWindow)};`
        )}"></div>
      </div>
      ${dynamicCaption}
      ${controls}
      <p class="weiqi-status" data-weiqi-status></p>
      ${explanation}
    `;
  }

  function renderControls(block) {
    if (block.mode === "animated") {
      const chunkButtons =
        block.animationChunks.length > 1
          ? `<div class="weiqi-variation-tabs">${block.animationChunks
              .map(
                (chunk, index) =>
                  `<button type="button" class="secondary-ink" data-weiqi-action="select-chunk" data-chunk-index="${index}">${escapeHtml(
                    chunk.label
                  )}</button>`
              )
              .join("")}</div>`
          : "";

      return `
        ${chunkButtons}
        <div class="weiqi-controls">
          <button type="button" class="secondary-ink" data-weiqi-action="prev">Previous</button>
          <button type="button" class="secondary-ink" data-weiqi-action="next">Next</button>
          <button type="button" class="secondary-ink" data-weiqi-action="autoplay">Autoplay</button>
          <button type="button" class="secondary-ink" data-weiqi-action="reset">Reset</button>
        </div>
      `;
    }

    if (block.mode === "puzzle") {
      return `
        <div class="weiqi-controls">
          <button type="button" class="secondary-ink" data-weiqi-action="hint">Show branch count</button>
          <button type="button" class="secondary-ink" data-weiqi-action="reset">Reset puzzle</button>
        </div>
      `;
    }

    return "";
  }

  function init(root = document) {
    // Re-initialization is expected because editor previews frequently replace innerHTML wholesale.
    root.querySelectorAll(BLOCK_SELECTOR).forEach((element) => {
      try {
        const block = normalizeWeiqiBlock(JSON.parse(element.dataset.weiqiBlock || "null"));
        if (!block || block.type !== "weiqi") {
          return;
        }

        teardown(element);
        const state = {
          block,
          moveIndex: 0,
          selectedChunkIndex: 0,
          appliedMoves: [],
          status: "",
          solved: false,
          failed: false,
          autoplayTimer: null,
        };
        boardRegistry.set(element, state);
        bindBlock(element, state);
        renderBlock(element, state);
      } catch (error) {
        const status = element.querySelector("[data-weiqi-status]");
        if (status) {
          status.textContent = `Weiqi content error: ${error.message}`;
        }
      }
    });
    initStacks(root);
  }

  function initStacks(root = document) {
    root.querySelectorAll(STACK_SELECTOR).forEach((stackElement) => {
      if (stackElement.dataset.weiqiStackBound === "true") {
        updateStackDisplay(stackElement);
        return;
      }

      stackElement.dataset.weiqiStackBound = "true";
      stackElement.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-weiqi-stack-action]");
        if (!actionButton) {
          return;
        }

        const pages = [...stackElement.querySelectorAll("[data-weiqi-stack-page]")];
        const currentIndex = Number(stackElement.dataset.activeStackIndex || "0");
        const delta = actionButton.dataset.weiqiStackAction === "prev" ? -1 : 1;
        const nextIndex = (currentIndex + delta + pages.length) % pages.length;
        stackElement.dataset.activeStackIndex = String(nextIndex);
        updateStackDisplay(stackElement);
      });

      updateStackDisplay(stackElement);
    });
  }

  function updateStackDisplay(stackElement) {
    const pages = [...stackElement.querySelectorAll("[data-weiqi-stack-page]")];
    const activeIndex = clamp(Number(stackElement.dataset.activeStackIndex || "0"), 0, Math.max(0, pages.length - 1));
    stackElement.dataset.activeStackIndex = String(activeIndex);
    pages.forEach((page, index) => {
      page.classList.toggle("hidden", index !== activeIndex);
    });
    const status = stackElement.querySelector("[data-weiqi-stack-status]");
    if (status) {
      status.textContent = `Board ${activeIndex + 1} of ${pages.length}`;
    }
  }

  function teardown(element) {
    const state = boardRegistry.get(element);
    if (state?.autoplayTimer) {
      window.clearInterval(state.autoplayTimer);
      state.autoplayTimer = null;
    }
    boardRegistry.delete(element);
  }

  function bindBlock(element, state) {
    element.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-weiqi-action]");
      if (actionButton) {
        event.preventDefault();
        handleAction(element, state, actionButton.dataset.weiqiAction, actionButton);
        return;
      }

      const boardElement = event.target.closest("[data-weiqi-board]");
      if (boardElement && state.block.mode === "puzzle") {
        handlePuzzleMove(boardElement, state, event);
      }
    });

    const boardElement = element.querySelector("[data-weiqi-board]");
    if (boardElement && state.block.mode === "puzzle") {
      boardElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.status = "Use a mouse or trackpad click on a board intersection to play a move.";
          renderBlock(element, state);
        }
      });
    }
  }

  function handleAction(element, state, action, trigger) {
    if (state.block.mode === "animated") {
      const chunks = state.block.animationChunks || [];
      const activeChunk = chunks[state.selectedChunkIndex] || chunks[0] || { moves: [] };
      const totalMoves = getChunkMoveCount(activeChunk);

      if (action === "select-chunk") {
        state.selectedChunkIndex = Number(trigger.dataset.chunkIndex) || 0;
        state.moveIndex = 0;
        stopAutoplay(state);
      } else if (action === "prev") {
        if (state.moveIndex > 0) {
          state.moveIndex -= 1;
        } else if (state.selectedChunkIndex > 0) {
          state.selectedChunkIndex -= 1;
          state.moveIndex = getChunkMoveCount(chunks[state.selectedChunkIndex] || chunks[0]);
        }
        stopAutoplay(state);
      } else if (action === "next") {
        if (!advanceAnimatedStep(state)) {
          stopAutoplay(state);
        }
      } else if (action === "reset") {
        state.selectedChunkIndex = 0;
        state.moveIndex = 0;
        stopAutoplay(state);
      } else if (action === "autoplay") {
        if (state.autoplayTimer) {
          stopAutoplay(state);
        } else {
          startAutoplay(element, state);
        }
      }
      renderBlock(element, state);
      return;
    }

    if (state.block.mode === "puzzle") {
      if (action === "reset") {
        state.appliedMoves = [];
        state.status = "";
        state.solved = false;
        state.failed = false;
      } else if (action === "hint") {
        const correctCount = (state.block.branches || []).filter((branch) => branch.outcome === "correct").length;
        const incorrectCount = (state.block.branches || []).filter((branch) => branch.outcome !== "correct").length;
        state.status = `${correctCount} correct ending${correctCount === 1 ? "" : "s"}, ${incorrectCount} incorrect ending${incorrectCount === 1 ? "" : "s"}.`;
      }
      renderBlock(element, state);
    }
  }

  function startAutoplay(element, state) {
    const chunks = state.block.animationChunks || [];
    if (!chunks.length || !chunks.some((chunk) => getChunkMoveCount(chunk))) {
      return;
    }

    if (
      state.selectedChunkIndex >= chunks.length - 1 &&
      state.moveIndex >= getChunkMoveCount(chunks[chunks.length - 1] || { moves: [] })
    ) {
      state.selectedChunkIndex = 0;
      state.moveIndex = 0;
    }

    state.autoplayTimer = window.setInterval(() => {
      if (!advanceAnimatedStep(state)) {
        stopAutoplay(state);
        renderBlock(element, state);
        return;
      }
      renderBlock(element, state);
    }, 1100);
  }

  function stopAutoplay(state) {
    if (state.autoplayTimer) {
      window.clearInterval(state.autoplayTimer);
      state.autoplayTimer = null;
    }
  }

  function handlePuzzleMove(boardElement, state, event) {
    if (state.failed || state.solved) {
      return;
    }

    const playerSide = state.block.playerSide || "both";
    const branches = state.block.branches || [];

    // In single-side mode, silently ignore clicks when it is the opponent's turn.
    if (playerSide !== "both" && branches.length > 0) {
      const currentMatches = getMatchingPuzzleBranches(branches, state.appliedMoves);
      const nextExpectedColor = currentMatches[0]?.moves?.[state.appliedMoves.length]?.color;
      if (nextExpectedColor && nextExpectedColor !== playerSide) {
        return;
      }
    }

    const coordinate = getCoordinateFromPointer(boardElement, state.block.boardSize, event, state.block.viewWindow);
    if (!coordinate) {
      return;
    }

    const occupied = buildStoneMap(state.block.initialPosition, state.appliedMoves);
    if (occupied.has(getPointKey(coordinate))) {
      state.status = "That point is already occupied.";
      renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      return;
    }

    if (!branches.length) {
      state.status = "This puzzle does not have any authored branches yet.";
      renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      return;
    }

    const matchingBranches = getMatchingPuzzleBranches(branches, state.appliedMoves);
    const nextMoveIndex = state.appliedMoves.length;
    const nextBranches = matchingBranches.filter((branch) => {
      const move = branch.moves?.[nextMoveIndex];
      return move && move.x === coordinate.x && move.y === coordinate.y;
    });

    if (!nextBranches.length) {
      state.failed = true;
      state.status = state.block.defaultIncorrectMessage || "That move does not solve the puzzle.";
      renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      return;
    }

    const nextMove = nextBranches[0].moves[nextMoveIndex];
    state.appliedMoves = [...state.appliedMoves, nextMove];
    const exactMatches = nextBranches.filter((branch) => branch.moves.length === state.appliedMoves.length);
    if (exactMatches.length) {
      const terminalBranch = exactMatches[0];
      if (terminalBranch.outcome === "correct") {
        state.solved = true;
        state.status = terminalBranch.message || "Solved.";
      } else {
        state.failed = true;
        state.status = terminalBranch.message || state.block.defaultIncorrectMessage || "That move does not solve the puzzle.";
      }
      renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      return;
    }

    // In single-side mode, auto-play a randomly chosen opponent response.
    // Distinct moves are deduplicated by position so transposing branches that share
    // the same opponent move count as one option and stay in play together.
    if (playerSide !== "both") {
      const opponentMoveIndex = state.appliedMoves.length;
      const remainingBranches = getMatchingPuzzleBranches(branches, state.appliedMoves);

      const distinctOpponentMoves = [];
      const seenOpponentKeys = new Set();
      remainingBranches.forEach((branch) => {
        const move = branch.moves?.[opponentMoveIndex];
        if (move && move.color !== playerSide) {
          const key = getPointKey(move);
          if (!seenOpponentKeys.has(key)) {
            seenOpponentKeys.add(key);
            distinctOpponentMoves.push(move);
          }
        }
      });

      if (distinctOpponentMoves.length > 0) {
        const opponentMove = distinctOpponentMoves[Math.floor(Math.random() * distinctOpponentMoves.length)];
        state.appliedMoves = [...state.appliedMoves, opponentMove];

        // Re-match with the chosen opponent move applied so transpositions resolve correctly.
        const afterOpponentBranches = getMatchingPuzzleBranches(branches, state.appliedMoves);
        const exactAfterOpponent = afterOpponentBranches.filter((b) => b.moves.length === state.appliedMoves.length);
        if (exactAfterOpponent.length) {
          const terminalBranch = exactAfterOpponent[0];
          if (terminalBranch.outcome === "correct") {
            state.solved = true;
            state.status = terminalBranch.message || "Solved.";
          } else {
            state.failed = true;
            state.status = terminalBranch.message || state.block.defaultIncorrectMessage || "That move does not solve the puzzle.";
          }
          renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
          return;
        }

        state.status = `Your move accepted. ${afterOpponentBranches.length} continuation${afterOpponentBranches.length === 1 ? "" : "s"} remain.`;
        renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
        return;
      }
    }

    const remainingMatches = getMatchingPuzzleBranches(branches, state.appliedMoves);
    state.status = `Move ${state.appliedMoves.length} accepted. ${remainingMatches.length} authored continuation${remainingMatches.length === 1 ? "" : "s"} remain.`;
    renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
  }

  function renderBlock(element, state) {
    const boardElement = element.querySelector("[data-weiqi-board]");
    const statusElement = element.querySelector("[data-weiqi-status]");
    const explanationElement = element.querySelector("[data-weiqi-explanation]");
    const dynamicCaptionElement = element.querySelector("[data-weiqi-dynamic-caption]");

    if (!boardElement || !statusElement) {
      return;
    }

    const block = state.block;
    const boardState = getBoardStateForMode(state);
    boardElement.style.setProperty("--weiqi-board-aspect-ratio", getBoardAspectRatioValue(block.boardSize, block.viewWindow));
    boardElement.innerHTML = buildBoardSvg(block, boardState.stones, boardState.markers, boardState.lastMove, {
      viewWindow: block.viewWindow,
    });

    statusElement.textContent = getStatusText(block, state);
    statusElement.classList.toggle("is-error", Boolean(state.failed));
    statusElement.classList.toggle("is-success", Boolean(state.solved));

    if (dynamicCaptionElement) {
      const caption = getAnimatedCaption(state);
      dynamicCaptionElement.textContent = caption;
      dynamicCaptionElement.classList.toggle("hidden", !caption);
    }

    if (explanationElement) {
      explanationElement.classList.toggle("hidden", !(state.solved && block.explanation));
    }

    element.querySelectorAll('[data-weiqi-action="autoplay"]').forEach((button) => {
      button.textContent = state.autoplayTimer ? "Pause" : "Autoplay";
    });

    element.querySelectorAll('[data-weiqi-action="select-chunk"]').forEach((button, index) => {
      button.classList.toggle("is-active", index === state.selectedChunkIndex);
    });
  }

  function getBoardStateForMode(state) {
    const block = state.block;
    if (block.mode === "animated") {
      const playbackState = getAnimatedPlaybackState(block, state.selectedChunkIndex, state.moveIndex);
      return {
        stones: [...(block.initialPosition || []), ...playbackState.moves],
        markers: [...(block.markers || []), ...(playbackState.activeMove?.markers || [])],
        lastMove: playbackState.activeMove || null,
      };
    }

    if (block.mode === "puzzle") {
      return {
        stones: [...(block.initialPosition || []), ...state.appliedMoves],
        markers: block.markers || [],
        lastMove: state.appliedMoves[state.appliedMoves.length - 1] || null,
      };
    }

    return {
      stones: block.initialPosition || [],
      markers: block.markers || [],
      lastMove: null,
    };
  }

  function buildBoardSvg(block, stones, markers, lastMove, options = {}) {
    const boardSize = Number(block.boardSize);
    const effectiveViewWindow = normalizeViewWindow(boardSize, options.cropToFullBoard ? getDefaultViewWindow(boardSize) : options.viewWindow || block.viewWindow);
    const metrics = getBoardMetrics(boardSize, effectiveViewWindow);
    const stoneMap = buildStoneMap(stones);
    const visibleStones = stones.filter((stone) => pointInViewWindow(stone, effectiveViewWindow));
    const visibleMarkers = markers.filter((marker) => pointInViewWindow(marker, effectiveViewWindow));

    const gridLines = [];
    for (let x = effectiveViewWindow.xMin; x <= effectiveViewWindow.xMax; x += 1) {
      const { cx: offset } = getSvgPoint({ x, y: effectiveViewWindow.yMin }, effectiveViewWindow, metrics);
      gridLines.push(`<line x1="${offset}" y1="${metrics.padding}" x2="${offset}" y2="${metrics.height - metrics.padding}"></line>`);
    }
    for (let y = effectiveViewWindow.yMin; y <= effectiveViewWindow.yMax; y += 1) {
      const { cy: offset } = getSvgPoint({ x: effectiveViewWindow.xMin, y }, effectiveViewWindow, metrics);
      gridLines.push(`<line x1="${metrics.padding}" y1="${offset}" x2="${metrics.width - metrics.padding}" y2="${offset}"></line>`);
    }

    const starMarkup = getStarPoints(boardSize)
      .filter((point) => pointInViewWindow(point, effectiveViewWindow))
      .map((point) => {
        const { cx, cy } = getSvgPoint(point, effectiveViewWindow, metrics);
        return `<circle class="weiqi-star-point" cx="${cx}" cy="${cy}" r="${Math.max(3, Math.min(metrics.stepX, metrics.stepY) * 0.09)}"></circle>`;
      })
      .join("");

    const stonesMarkup = visibleStones
      .map((stone) => renderStone(stone, { ...metrics, viewWindow: effectiveViewWindow, lastMove }))
      .join("");

    const markersMarkup = visibleMarkers
      .map((marker) => renderMarker(marker, stoneMap.get(getPointKey(marker)), { ...metrics, viewWindow: effectiveViewWindow }))
      .join("");

    const viewportMarkup = options.viewportOutline
      ? renderViewportOutline(options.viewportOutline, boardSize, options.viewportHandles)
      : "";

    return `
      <svg class="weiqi-board-svg" viewBox="0 0 ${metrics.width} ${metrics.height}" aria-hidden="true">
        <rect class="weiqi-board-wood" x="0" y="0" width="${metrics.width}" height="${metrics.height}" rx="18"></rect>
        <g class="weiqi-grid-lines">${gridLines.join("")}</g>
        <g class="weiqi-star-points">${starMarkup}</g>
        <g class="weiqi-stones">${stonesMarkup}</g>
        <g class="weiqi-markers">${markersMarkup}</g>
        ${viewportMarkup}
      </svg>
    `;
  }

  function renderViewportOutline(viewWindow, boardSize, includeHandles = false) {
    const normalizedViewWindow = normalizeViewWindow(boardSize, viewWindow);
    const metrics = getBoardMetrics(boardSize, getDefaultViewWindow(boardSize));
    const topLeft = getSvgPoint({ x: normalizedViewWindow.xMin, y: normalizedViewWindow.yMin }, getDefaultViewWindow(boardSize), metrics);
    const bottomRight = getSvgPoint({ x: normalizedViewWindow.xMax, y: normalizedViewWindow.yMax }, getDefaultViewWindow(boardSize), metrics);
    const inset = Math.min(metrics.stepX, metrics.stepY) * 0.45;
    const handleRadius = Math.max(8, Math.min(metrics.stepX, metrics.stepY) * 0.22);
    const handles = includeHandles
      ? [
          { key: "nw", point: topLeft },
          { key: "ne", point: { cx: bottomRight.cx, cy: topLeft.cy } },
          { key: "sw", point: { cx: topLeft.cx, cy: bottomRight.cy } },
          { key: "se", point: bottomRight },
        ]
          .map(
            ({ key, point }) =>
              `<circle class="weiqi-viewport-handle" data-viewport-handle="${key}" cx="${point.cx}" cy="${point.cy}" r="${handleRadius}"></circle>`
          )
          .join("")
      : "";

    return `
      <g class="weiqi-viewport-editor">
        <rect
          class="weiqi-viewport-outline"
          x="${topLeft.cx - inset}"
          y="${topLeft.cy - inset}"
          width="${bottomRight.cx - topLeft.cx + inset * 2}"
          height="${bottomRight.cy - topLeft.cy + inset * 2}"
          rx="10"
        ></rect>
        ${handles}
      </g>
    `;
  }

  function getBoardMetrics(boardSize, viewWindow) {
    const leftInset = viewWindow.xMin === 0 ? 0 : 0.5;
    const rightInset = viewWindow.xMax === boardSize - 1 ? 0 : 0.5;
    const topInset = viewWindow.yMin === 0 ? 0 : 0.5;
    const bottomInset = viewWindow.yMax === boardSize - 1 ? 0 : 0.5;
    const spanX = Math.max(1, viewWindow.xMax - viewWindow.xMin + leftInset + rightInset);
    const spanY = Math.max(1, viewWindow.yMax - viewWindow.yMin + topInset + bottomInset);
    const step = (SVG_DIMENSION - SVG_PADDING * 2) / Math.max(spanX, spanY);
    return {
      padding: SVG_PADDING,
      stepX: step,
      stepY: step,
      width: SVG_PADDING * 2 + spanX * step,
      height: SVG_PADDING * 2 + spanY * step,
      boardSize,
      leftInset,
      rightInset,
      topInset,
      bottomInset,
    };
  }

  function getBoardAspectRatioValue(boardSize, viewWindow) {
    const metrics = getBoardMetrics(boardSize, normalizeViewWindow(boardSize, viewWindow));
    return `${metrics.width} / ${metrics.height}`;
  }

  function getSvgPoint(point, viewWindow, metrics) {
    return {
      cx: metrics.padding + (metrics.leftInset + point.x - viewWindow.xMin) * metrics.stepX,
      cy: metrics.padding + (metrics.topInset + point.y - viewWindow.yMin) * metrics.stepY,
    };
  }

  function pointInViewWindow(point, viewWindow) {
    return point.x >= viewWindow.xMin && point.x <= viewWindow.xMax && point.y >= viewWindow.yMin && point.y <= viewWindow.yMax;
  }

  function renderStone(stone, context) {
    const { cx, cy } = getSvgPoint(stone, context.viewWindow, context);
    const radius = Math.max(10, Math.min(context.stepX, context.stepY) * 0.44);
    const stoneClass = stone.color === "white" ? "weiqi-stone stone-white" : "weiqi-stone stone-black";
    const isLastMove = context.lastMove && context.lastMove.x === stone.x && context.lastMove.y === stone.y;
    const highlight = isLastMove
      ? `<circle class="weiqi-last-move" cx="${cx}" cy="${cy}" r="${Math.max(4, radius * 0.2)}"></circle>`
      : "";

    return `
      <g class="weiqi-stone-group">
        <circle class="${stoneClass}" cx="${cx}" cy="${cy}" r="${radius}"></circle>
        ${highlight}
      </g>
    `;
  }

  function renderMarker(marker, occupiedStone, context) {
    const { cx, cy } = getSvgPoint(marker, context.viewWindow, context);
    const textClass = occupiedStone?.color === "black" ? "on-black" : occupiedStone?.color === "white" ? "on-white" : "";
    const label = marker.label
      ? `<text class="weiqi-marker-label ${textClass}" x="${cx}" y="${cy}" dominant-baseline="middle">${escapeHtml(marker.label)}</text>`
      : "";
    const shape = renderMarkerShape(marker.shape, cx, cy, Math.min(context.stepX, context.stepY) * 0.32, occupiedStone?.color);
    return `<g class="weiqi-marker-group">${shape}${label}</g>`;
  }

  function renderMarkerShape(shape, cx, cy, size, stoneColor) {
    if (!shape) {
      return "";
    }

    const shapeClass = `weiqi-marker-shape ${stoneColor === "black" ? "on-black" : stoneColor === "white" ? "on-white" : ""}`;
    if (shape === "circle") {
      return `<circle class="${shapeClass}" cx="${cx}" cy="${cy}" r="${size}"></circle>`;
    }
    if (shape === "square") {
      return `<rect class="${shapeClass}" x="${cx - size}" y="${cy - size}" width="${size * 2}" height="${size * 2}"></rect>`;
    }
    if (shape === "triangle") {
      return `<path class="${shapeClass}" d="M ${cx} ${cy - size} L ${cx + size} ${cy + size} L ${cx - size} ${cy + size} Z"></path>`;
    }
    if (shape === "cross") {
      return `<path class="${shapeClass}" d="M ${cx - size} ${cy - size} L ${cx + size} ${cy + size} M ${cx + size} ${cy - size} L ${cx - size} ${cy + size}"></path>`;
    }
    return "";
  }

  function getStarPoints(size) {
    if (!BOARD_SIZES.has(size)) {
      return [];
    }

    if (size === 9) {
      return [
        { x: 2, y: 2 },
        { x: 6, y: 2 },
        { x: 4, y: 4 },
        { x: 2, y: 6 },
        { x: 6, y: 6 },
      ];
    }

    if (size === 13) {
      return [
        { x: 3, y: 3 },
        { x: 9, y: 3 },
        { x: 6, y: 6 },
        { x: 3, y: 9 },
        { x: 9, y: 9 },
      ];
    }

    return [
      { x: 3, y: 3 },
      { x: 9, y: 3 },
      { x: 15, y: 3 },
      { x: 3, y: 9 },
      { x: 9, y: 9 },
      { x: 15, y: 9 },
      { x: 3, y: 15 },
      { x: 9, y: 15 },
      { x: 15, y: 15 },
    ];
  }

  function buildStoneMap(...stoneLists) {
    const map = new Map();
    stoneLists.flat().forEach((stone) => {
      if (!stone || typeof stone.x !== "number" || typeof stone.y !== "number") {
        return;
      }
      map.set(getPointKey(stone), stone);
    });
    return map;
  }

  function getPointKey(point) {
    return `${point.x},${point.y}`;
  }

  function getCoordinateFromPointer(boardElement, boardSize, event, viewWindow = getDefaultViewWindow(boardSize)) {
    const rect = boardElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const normalizedViewWindow = normalizeViewWindow(boardSize, viewWindow);
    const metrics = getBoardMetrics(boardSize, normalizedViewWindow);
    const svgX = ((event.clientX - rect.left) / rect.width) * metrics.width;
    const svgY = ((event.clientY - rect.top) / rect.height) * metrics.height;
    const x = Math.round((svgX - metrics.padding) / metrics.stepX - metrics.leftInset) + normalizedViewWindow.xMin;
    const y = Math.round((svgY - metrics.padding) / metrics.stepY - metrics.topInset) + normalizedViewWindow.yMin;

    if (x < normalizedViewWindow.xMin || x > normalizedViewWindow.xMax || y < normalizedViewWindow.yMin || y > normalizedViewWindow.yMax) {
      return null;
    }

    return { x, y };
  }

  function getStatusText(block, state) {
    if (state.status) {
      return state.status;
    }

    if (block.mode === "animated") {
      const activeChunk = (block.animationChunks || [])[state.selectedChunkIndex] || { label: "Main line", moves: [] };
      const totalMoves = getChunkMoveCount(activeChunk);
      return totalMoves ? `${activeChunk.label}: move ${state.moveIndex} of ${totalMoves}.` : "Add a chunk to animate this diagram.";
    }

    if (block.mode === "puzzle") {
      if (block.playerSide === "black") {
        return "Black to play. Click an intersection to make your move.";
      }
      if (block.playerSide === "white") {
        return "White to play. Click an intersection to make your move.";
      }
      return "Click an intersection to follow an authored branch.";
    }

    return block.markers?.length ? "Static board with markers." : "Static board.";
  }

  function getModeLabel(mode) {
    if (mode === "animated") {
      return "Animation";
    }
    if (mode === "puzzle") {
      return "Puzzle";
    }
    return "Diagram";
  }

  function getAriaLabel(block) {
    if (block.mode === "animated") {
      return block.caption || "Animated Weiqi board";
    }
    if (block.mode === "puzzle") {
      return block.prompt || block.caption || "Interactive Weiqi puzzle";
    }
    return block.caption || "Weiqi board position";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getChunkMoveCount(chunk) {
    return Array.isArray(chunk?.moves) ? chunk.moves.length : 0;
  }

  function advanceAnimatedStep(state) {
    const chunks = state.block.animationChunks || [];
    if (!chunks.length) {
      return false;
    }

    const activeChunk = chunks[state.selectedChunkIndex] || chunks[0] || { moves: [] };
    if (state.moveIndex < getChunkMoveCount(activeChunk)) {
      state.moveIndex += 1;
      return true;
    }

    if (state.selectedChunkIndex < chunks.length - 1) {
      state.selectedChunkIndex += 1;
      state.moveIndex = getChunkMoveCount(chunks[state.selectedChunkIndex] || chunks[0]) ? 1 : 0;
      return true;
    }

    return false;
  }

  function getAnimatedPlaybackState(block, chunkIndex, moveIndex) {
    const chunks = block.animationChunks || [];
    const safeChunkIndex = clamp(chunkIndex, 0, Math.max(0, chunks.length - 1));
    const moves = [];

    chunks.forEach((chunk, index) => {
      const chunkMoves = Array.isArray(chunk.moves) ? chunk.moves : [];
      if (index < safeChunkIndex) {
        moves.push(...chunkMoves);
        return;
      }
      if (index === safeChunkIndex) {
        moves.push(...chunkMoves.slice(0, moveIndex));
      }
    });

    const activeChunk = chunks[safeChunkIndex] || null;
    const activeMove = activeChunk && moveIndex > 0 ? activeChunk.moves[moveIndex - 1] || null : null;
    return {
      activeChunk,
      activeMove,
      moves,
    };
  }

  function getAnimatedCaption(state) {
    if (state.block.mode !== "animated" || state.moveIndex <= 0) {
      return "";
    }

    const activeChunk = (state.block.animationChunks || [])[state.selectedChunkIndex] || null;
    return activeChunk?.caption || "";
  }

  function getMatchingPuzzleBranches(branches, playedMoves) {
    return (branches || []).filter((branch) => isBranchPrefixMatch(branch, playedMoves));
  }

  function isBranchPrefixMatch(branch, playedMoves) {
    if (!Array.isArray(branch?.moves) || branch.moves.length < playedMoves.length) {
      return false;
    }

    return playedMoves.every((move, index) => {
      const branchMove = branch.moves[index];
      return branchMove && branchMove.color === move.color && branchMove.x === move.x && branchMove.y === move.y;
    });
  }

  return {
    BOARD_SIZES,
    escapeHtml,
    escapeAttribute,
    expandInlineBlocks,
    renderStructuredContentBlocks,
    init,
    normalizeWeiqiBlock,
    normalizeViewWindow,
    getDefaultViewWindow,
    normalizeAnimationChunks,
    normalizeAnimatedVariations: normalizeAnimationChunks,
    normalizePuzzleSuccessSequence,
    normalizePuzzleFailureSequences,
    normalizePuzzleBranches,
    buildBoardSvg,
    getBoardAspectRatioValue,
    getCoordinateFromPointer,
    getPointKey,
    buildStoneMap,
  };
})();

window.BlueshellWeiqi = BlueshellWeiqi;
