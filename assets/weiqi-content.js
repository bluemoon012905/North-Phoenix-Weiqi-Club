const BlueshellWeiqi = (() => {
  const BOARD_SIZES = new Set([9, 13, 19]);
  const BLOCK_SELECTOR = "[data-weiqi-block]";
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

  function normalizeAnimatedVariations(block) {
    if (Array.isArray(block.variations) && block.variations.length) {
      return block.variations.map((variation, index) => ({
        id: variation.id || `variation-${index + 1}`,
        label: variation.label || `Variation ${index + 1}`,
        moves: Array.isArray(variation.moves) ? variation.moves : [],
      }));
    }

    return [
      {
        id: "variation-1",
        label: "Main line",
        moves: Array.isArray(block.moves) ? block.moves : [],
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

  function normalizeWeiqiBlock(block) {
    if (!block || block.type !== "weiqi") {
      return block;
    }

    const boardSize = BOARD_SIZES.has(Number(block.boardSize)) ? Number(block.boardSize) : 19;
    return {
      ...block,
      boardSize,
      coordinateSystem: block.coordinateSystem || "zero-based",
      initialPosition: Array.isArray(block.initialPosition) ? block.initialPosition : [],
      markers: Array.isArray(block.markers) ? block.markers : [],
      viewWindow: normalizeViewWindow(boardSize, block.viewWindow),
      variations: normalizeAnimatedVariations(block),
      successSequence: normalizePuzzleSuccessSequence(block),
      failureSequences: normalizePuzzleFailureSequences(block),
    };
  }

  function renderStructuredContentBlocks(blocks) {
    const normalizedBlocks = normalizeBlocks(blocks);
    if (!normalizedBlocks.length) {
      return "";
    }

    return `<div class="post-structured-content">${normalizedBlocks
      .map((rawBlock) => {
        if (rawBlock.type === "weiqi") {
          return renderWeiqiBlockShell(normalizeWeiqiBlock(rawBlock));
        }

        return `
          <section class="structured-block structured-block-unsupported">
            <p class="structured-block-label">Unsupported content</p>
            <pre>${escapeHtml(JSON.stringify(rawBlock, null, 2))}</pre>
          </section>
        `;
      })
      .join("")}</div>`;
  }

  function renderWeiqiBlockShell(block) {
    const payload = escapeAttribute(JSON.stringify(block));
    const modeLabel = escapeHtml(getModeLabel(block.mode));
    const caption = block.caption ? `<p class="weiqi-caption">${escapeHtml(block.caption)}</p>` : "";
    const prompt = block.mode === "puzzle" && block.prompt ? `<p class="weiqi-prompt">${escapeHtml(block.prompt)}</p>` : "";
    const explanation =
      block.mode === "puzzle" && block.explanation
        ? `<div class="weiqi-explanation hidden" data-weiqi-explanation>${escapeHtml(block.explanation)}</div>`
        : "";
    const controls = renderControls(block);

    return `
      <section class="structured-block weiqi-block" data-weiqi-block="${payload}">
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
          )}" tabindex="${block.mode === "puzzle" ? "0" : "-1"}"></div>
        </div>
        ${controls}
        <p class="weiqi-status" data-weiqi-status></p>
        ${explanation}
      </section>
    `;
  }

  function renderControls(block) {
    if (block.mode === "animated") {
      const variationButtons =
        block.variations.length > 1
          ? `<div class="weiqi-variation-tabs">${block.variations
              .map(
                (variation, index) =>
                  `<button type="button" class="secondary-ink" data-weiqi-action="select-variation" data-variation-index="${index}">${escapeHtml(
                    variation.label
                  )}</button>`
              )
              .join("")}</div>`
          : "";

      return `
        ${variationButtons}
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
          <button type="button" class="secondary-ink" data-weiqi-action="hint">Show target count</button>
          <button type="button" class="secondary-ink" data-weiqi-action="reset">Reset puzzle</button>
        </div>
      `;
    }

    return "";
  }

  function init(root = document) {
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
          selectedVariationIndex: 0,
          appliedSolution: [],
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
      const variations = state.block.variations || [];
      const activeVariation = variations[state.selectedVariationIndex] || variations[0] || { moves: [] };
      const totalMoves = Array.isArray(activeVariation.moves) ? activeVariation.moves.length : 0;

      if (action === "select-variation") {
        state.selectedVariationIndex = Number(trigger.dataset.variationIndex) || 0;
        state.moveIndex = 0;
        stopAutoplay(state);
      } else if (action === "prev") {
        state.moveIndex = Math.max(0, state.moveIndex - 1);
        stopAutoplay(state);
      } else if (action === "next") {
        state.moveIndex = Math.min(totalMoves, state.moveIndex + 1);
        if (state.moveIndex >= totalMoves) {
          stopAutoplay(state);
        }
      } else if (action === "reset") {
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
        state.appliedSolution = [];
        state.status = "";
        state.solved = false;
        state.failed = false;
      } else if (action === "hint") {
        state.status = `Success line length: ${(state.block.successSequence || []).length} move${(state.block.successSequence || []).length === 1 ? "" : "s"}.`;
      }
      renderBlock(element, state);
    }
  }

  function startAutoplay(element, state) {
    const activeVariation = (state.block.variations || [])[state.selectedVariationIndex] || { moves: [] };
    const totalMoves = Array.isArray(activeVariation.moves) ? activeVariation.moves.length : 0;
    if (!totalMoves) {
      return;
    }

    if (state.moveIndex >= totalMoves) {
      state.moveIndex = 0;
    }

    state.autoplayTimer = window.setInterval(() => {
      if (state.moveIndex >= totalMoves) {
        stopAutoplay(state);
        renderBlock(element, state);
        return;
      }

      state.moveIndex += 1;
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

    const coordinate = getCoordinateFromPointer(boardElement, state.block.boardSize, event, state.block.viewWindow);
    if (!coordinate) {
      return;
    }

    const occupied = buildStoneMap(state.block.initialPosition, state.appliedSolution);
    if (occupied.has(getPointKey(coordinate))) {
      state.status = "That point is already occupied.";
      renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      return;
    }

    const successSequence = state.block.successSequence || [];
    const expectedMove = successSequence[state.appliedSolution.length];
    if (!expectedMove) {
      state.status = "This puzzle does not have a success sequence yet.";
      renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      return;
    }

    if (expectedMove.x === coordinate.x && expectedMove.y === coordinate.y) {
      state.appliedSolution = [...state.appliedSolution, expectedMove];
      state.status = `Correct move ${state.appliedSolution.length} of ${successSequence.length}.`;
      if (state.appliedSolution.length === successSequence.length) {
        state.solved = true;
        state.status = "Solved.";
      }
    } else {
      const matchingFailure = (state.block.failureSequences || []).find((failureSequence) => {
        const firstMove = failureSequence.moves?.[0];
        return firstMove && firstMove.x === coordinate.x && firstMove.y === coordinate.y;
      });
      state.failed = true;
      state.status = matchingFailure?.message || "That move does not solve the puzzle.";
    }

    renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
  }

  function renderBlock(element, state) {
    const boardElement = element.querySelector("[data-weiqi-board]");
    const statusElement = element.querySelector("[data-weiqi-status]");
    const explanationElement = element.querySelector("[data-weiqi-explanation]");

    if (!boardElement || !statusElement) {
      return;
    }

    const block = state.block;
    const boardState = getBoardStateForMode(state);
    boardElement.innerHTML = buildBoardSvg(block, boardState.stones, boardState.markers, boardState.lastMove, {
      viewWindow: block.viewWindow,
    });

    statusElement.textContent = getStatusText(block, state);
    statusElement.classList.toggle("is-error", Boolean(state.failed));
    statusElement.classList.toggle("is-success", Boolean(state.solved));

    if (explanationElement) {
      explanationElement.classList.toggle("hidden", !(state.solved && block.explanation));
    }

    element.querySelectorAll('[data-weiqi-action="autoplay"]').forEach((button) => {
      button.textContent = state.autoplayTimer ? "Pause" : "Autoplay";
    });

    element.querySelectorAll('[data-weiqi-action="select-variation"]').forEach((button, index) => {
      button.classList.toggle("is-active", index === state.selectedVariationIndex);
    });
  }

  function getBoardStateForMode(state) {
    const block = state.block;
    if (block.mode === "animated") {
      const activeVariation = (block.variations || [])[state.selectedVariationIndex] || { moves: [] };
      const moveSlice = (activeVariation.moves || []).slice(0, state.moveIndex);
      return {
        stones: [...(block.initialPosition || []), ...moveSlice],
        markers: block.markers || [],
        lastMove: moveSlice[moveSlice.length - 1] || null,
      };
    }

    if (block.mode === "puzzle") {
      return {
        stones: [...(block.initialPosition || []), ...state.appliedSolution],
        markers: block.markers || [],
        lastMove: state.appliedSolution[state.appliedSolution.length - 1] || null,
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
      gridLines.push(`<line x1="${offset}" y1="${metrics.padding}" x2="${offset}" y2="${SVG_DIMENSION - metrics.padding}"></line>`);
    }
    for (let y = effectiveViewWindow.yMin; y <= effectiveViewWindow.yMax; y += 1) {
      const { cy: offset } = getSvgPoint({ x: effectiveViewWindow.xMin, y }, effectiveViewWindow, metrics);
      gridLines.push(`<line x1="${metrics.padding}" y1="${offset}" x2="${SVG_DIMENSION - metrics.padding}" y2="${offset}"></line>`);
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
      ? renderViewportOutline(options.viewportOutline, boardSize)
      : "";

    return `
      <svg class="weiqi-board-svg" viewBox="0 0 ${SVG_DIMENSION} ${SVG_DIMENSION}" aria-hidden="true">
        <rect class="weiqi-board-wood" x="0" y="0" width="${SVG_DIMENSION}" height="${SVG_DIMENSION}" rx="18"></rect>
        <g class="weiqi-grid-lines">${gridLines.join("")}</g>
        <g class="weiqi-star-points">${starMarkup}</g>
        <g class="weiqi-stones">${stonesMarkup}</g>
        <g class="weiqi-markers">${markersMarkup}</g>
        ${viewportMarkup}
      </svg>
    `;
  }

  function renderViewportOutline(viewWindow, boardSize) {
    const normalizedViewWindow = normalizeViewWindow(boardSize, viewWindow);
    const metrics = getBoardMetrics(boardSize, getDefaultViewWindow(boardSize));
    const topLeft = getSvgPoint({ x: normalizedViewWindow.xMin, y: normalizedViewWindow.yMin }, getDefaultViewWindow(boardSize), metrics);
    const bottomRight = getSvgPoint({ x: normalizedViewWindow.xMax, y: normalizedViewWindow.yMax }, getDefaultViewWindow(boardSize), metrics);
    const inset = Math.min(metrics.stepX, metrics.stepY) * 0.45;

    return `
      <rect
        class="weiqi-viewport-outline"
        x="${topLeft.cx - inset}"
        y="${topLeft.cy - inset}"
        width="${bottomRight.cx - topLeft.cx + inset * 2}"
        height="${bottomRight.cy - topLeft.cy + inset * 2}"
        rx="10"
      ></rect>
    `;
  }

  function getBoardMetrics(boardSize, viewWindow) {
    const leftInset = viewWindow.xMin === 0 ? 0 : 0.5;
    const rightInset = viewWindow.xMax === boardSize - 1 ? 0 : 0.5;
    const topInset = viewWindow.yMin === 0 ? 0 : 0.5;
    const bottomInset = viewWindow.yMax === boardSize - 1 ? 0 : 0.5;
    const spanX = Math.max(1, viewWindow.xMax - viewWindow.xMin + leftInset + rightInset);
    const spanY = Math.max(1, viewWindow.yMax - viewWindow.yMin + topInset + bottomInset);
    const span = SVG_DIMENSION - SVG_PADDING * 2;
    return {
      padding: SVG_PADDING,
      stepX: span / spanX,
      stepY: span / spanY,
      boardSize,
      leftInset,
      rightInset,
      topInset,
      bottomInset,
    };
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
    const label = marker.label ? `<text class="weiqi-marker-label ${textClass}" x="${cx}" y="${cy + 5}">${escapeHtml(marker.label)}</text>` : "";
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
    const svgX = ((event.clientX - rect.left) / rect.width) * SVG_DIMENSION;
    const svgY = ((event.clientY - rect.top) / rect.height) * SVG_DIMENSION;
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
      const activeVariation = (block.variations || [])[state.selectedVariationIndex] || { label: "Main line", moves: [] };
      const totalMoves = Array.isArray(activeVariation.moves) ? activeVariation.moves.length : 0;
      return totalMoves ? `${activeVariation.label}: move ${state.moveIndex} of ${totalMoves}.` : "Add a variation to animate this diagram.";
    }

    if (block.mode === "puzzle") {
      return "Click an intersection to try the success line.";
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

  return {
    BOARD_SIZES,
    escapeHtml,
    escapeAttribute,
    renderStructuredContentBlocks,
    init,
    normalizeWeiqiBlock,
    normalizeViewWindow,
    getDefaultViewWindow,
    normalizeAnimatedVariations,
    normalizePuzzleSuccessSequence,
    normalizePuzzleFailureSequences,
    buildBoardSvg,
    getCoordinateFromPointer,
    getPointKey,
    buildStoneMap,
  };
})();

window.BlueshellWeiqi = BlueshellWeiqi;
