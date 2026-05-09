const BlueshellWeiqi = (() => {
  const BOARD_SIZES = new Set([9, 13, 19]);
  const BLOCK_SELECTOR = "[data-weiqi-block]";
  const boardRegistry = new WeakMap();

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

  function renderStructuredContentBlocks(blocks) {
    const normalizedBlocks = normalizeBlocks(blocks);
    if (!normalizedBlocks.length) {
      return "";
    }

    return `<div class="post-structured-content">${normalizedBlocks
      .map((block) => {
        if (block.type === "weiqi") {
          return renderWeiqiBlockShell(block);
        }

        return `
          <section class="structured-block structured-block-unsupported">
            <p class="structured-block-label">Unsupported content</p>
            <pre>${escapeHtml(JSON.stringify(block, null, 2))}</pre>
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
    const controls = renderControls(block.mode);

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

  function renderControls(mode) {
    if (mode === "animated") {
      return `
        <div class="weiqi-controls">
          <button type="button" class="secondary-ink" data-weiqi-action="prev">Previous</button>
          <button type="button" class="secondary-ink" data-weiqi-action="next">Next</button>
          <button type="button" class="secondary-ink" data-weiqi-action="autoplay">Autoplay</button>
          <button type="button" class="secondary-ink" data-weiqi-action="reset">Reset</button>
        </div>
      `;
    }

    if (mode === "puzzle") {
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
        const block = JSON.parse(element.dataset.weiqiBlock || "null");
        if (!block || block.type !== "weiqi") {
          return;
        }

        teardown(element);
        const state = {
          block,
          moveIndex: 0,
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
        handleAction(element, state, actionButton.dataset.weiqiAction);
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
          const rect = boardElement.getBoundingClientRect();
          const syntheticEvent = {
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          };
          event.preventDefault();
          handlePuzzleMove(boardElement, state, syntheticEvent, { announceOnly: true });
        }
      });
    }
  }

  function handleAction(element, state, action) {
    if (state.block.mode === "animated") {
      const totalMoves = Array.isArray(state.block.moves) ? state.block.moves.length : 0;
      if (action === "prev") {
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
        state.status = `Solution length: ${(state.block.solution || []).length} move${(state.block.solution || []).length === 1 ? "" : "s"}.`;
      }
      renderBlock(element, state);
    }
  }

  function startAutoplay(element, state) {
    const totalMoves = Array.isArray(state.block.moves) ? state.block.moves.length : 0;
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

  function handlePuzzleMove(boardElement, state, event, options = {}) {
    if (state.failed || state.solved) {
      return;
    }

    const coordinate = getCoordinateFromPointer(boardElement, state.block.boardSize, event);
    if (!coordinate) {
      if (options.announceOnly) {
        state.status = "Click a board intersection to play the next move.";
        renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      }
      return;
    }

    const occupied = buildStoneMap(state.block.initialPosition, state.appliedSolution);
    if (occupied.has(getPointKey(coordinate))) {
      state.status = "That point is already occupied.";
      renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      return;
    }

    const solution = Array.isArray(state.block.solution) ? state.block.solution : [];
    const expectedMove = solution[state.appliedSolution.length];
    if (!expectedMove) {
      state.status = "This puzzle does not have a solution sequence yet.";
      renderBlock(boardElement.closest(BLOCK_SELECTOR), state);
      return;
    }

    if (expectedMove.x === coordinate.x && expectedMove.y === coordinate.y) {
      state.appliedSolution = [...state.appliedSolution, expectedMove];
      state.status = `Correct move ${state.appliedSolution.length} of ${solution.length}.`;
      if (state.appliedSolution.length === solution.length) {
        state.solved = true;
        state.status = "Solved.";
      }
    } else {
      const matchingFailure = (state.block.failureStates || []).find((failure) => failure.x === coordinate.x && failure.y === coordinate.y);
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
    boardElement.innerHTML = buildBoardSvg(block, boardState.stones, boardState.markers, boardState.lastMove);

    statusElement.textContent = getStatusText(block, state);
    statusElement.classList.toggle("is-error", Boolean(state.failed));
    statusElement.classList.toggle("is-success", Boolean(state.solved));

    if (explanationElement) {
      explanationElement.classList.toggle("hidden", !(state.solved && block.explanation));
    }

    element.querySelectorAll('[data-weiqi-action="autoplay"]').forEach((button) => {
      button.textContent = state.autoplayTimer ? "Pause" : "Autoplay";
    });
  }

  function getBoardStateForMode(state) {
    const block = state.block;
    if (block.mode === "animated") {
      const moveSlice = (block.moves || []).slice(0, state.moveIndex);
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

  function buildBoardSvg(block, stones, markers, lastMove) {
    const size = Number(block.boardSize);
    const dimension = 512;
    const padding = 30;
    const span = dimension - padding * 2;
    const step = size > 1 ? span / (size - 1) : 0;
    const starPoints = getStarPoints(size);
    const stoneMap = buildStoneMap(stones);

    const gridLines = [];
    for (let index = 0; index < size; index += 1) {
      const offset = padding + index * step;
      gridLines.push(`<line x1="${padding}" y1="${offset}" x2="${dimension - padding}" y2="${offset}"></line>`);
      gridLines.push(`<line x1="${offset}" y1="${padding}" x2="${offset}" y2="${dimension - padding}"></line>`);
    }

    const starMarkup = starPoints
      .map((point) => {
        const cx = padding + point.x * step;
        const cy = padding + point.y * step;
        return `<circle class="weiqi-star-point" cx="${cx}" cy="${cy}" r="${Math.max(3, step * 0.09)}"></circle>`;
      })
      .join("");

    const stonesMarkup = stones
      .map((stone) => renderStone(stone, { padding, step, size, lastMove }))
      .join("");

    const markersMarkup = markers
      .map((marker) => renderMarker(marker, stoneMap.get(getPointKey(marker)), { padding, step }))
      .join("");

    return `
      <svg class="weiqi-board-svg" viewBox="0 0 ${dimension} ${dimension}" aria-hidden="true">
        <rect class="weiqi-board-wood" x="0" y="0" width="${dimension}" height="${dimension}" rx="18"></rect>
        <g class="weiqi-grid-lines">${gridLines.join("")}</g>
        <g class="weiqi-star-points">${starMarkup}</g>
        <g class="weiqi-stones">${stonesMarkup}</g>
        <g class="weiqi-markers">${markersMarkup}</g>
      </svg>
    `;
  }

  function renderStone(stone, context) {
    const cx = context.padding + stone.x * context.step;
    const cy = context.padding + stone.y * context.step;
    const radius = Math.max(10, context.step * 0.44);
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
    const cx = context.padding + marker.x * context.step;
    const cy = context.padding + marker.y * context.step;
    const textClass = occupiedStone?.color === "black" ? "on-black" : occupiedStone?.color === "white" ? "on-white" : "";
    const label = marker.label ? `<text class="weiqi-marker-label ${textClass}" x="${cx}" y="${cy + 5}">${escapeHtml(marker.label)}</text>` : "";
    const shape = renderMarkerShape(marker.shape, cx, cy, context.step * 0.32, occupiedStone?.color);
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

  function getCoordinateFromPointer(boardElement, boardSize, event) {
    const rect = boardElement.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const dimension = Math.min(rect.width, rect.height);
    const padding = (30 / 512) * dimension;
    const span = dimension - padding * 2;
    const step = boardSize > 1 ? span / (boardSize - 1) : 0;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const x = Math.round((localX - padding) / step);
    const y = Math.round((localY - padding) / step);

    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
      return null;
    }

    return { x, y };
  }

  function getStatusText(block, state) {
    if (state.status) {
      return state.status;
    }

    if (block.mode === "animated") {
      const totalMoves = Array.isArray(block.moves) ? block.moves.length : 0;
      return totalMoves ? `Showing move ${state.moveIndex} of ${totalMoves}.` : "Add moves to animate this diagram.";
    }

    if (block.mode === "puzzle") {
      return "Click an intersection to try the puzzle.";
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

  return {
    renderStructuredContentBlocks,
    init,
  };
})();

window.BlueshellWeiqi = BlueshellWeiqi;
