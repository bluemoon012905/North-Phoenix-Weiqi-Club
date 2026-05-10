const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// Local development server that serves the static site and exposes editor APIs.
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const contentPath = path.join(dataDir, "content.json");
const postsDir = path.join(dataDir, "posts");
const postsIndexPath = path.join(postsDir, "index.json");
const assetsImagesDir = path.join(rootDir, "assets", "images");
const postButtonsDir = path.join(assetsImagesDir, "post-buttons");
const postCoversDir = path.join(assetsImagesDir, "post-covers");
const port = process.env.PORT || 4321;
const host = process.env.HOST || "127.0.0.1";
const weiqiBoardSizes = new Set([9, 13, 19]);
const weiqiStoneColors = new Set(["black", "white"]);
const weiqiMarkerShapes = new Set(["circle", "square", "triangle", "cross"]);
const minWeiqiViewSpan = 4;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

// Keep routing simple: explicit API handlers first, then static files, then a homepage fallback.
const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/content" && request.method === "GET") {
    return sendJson(response, 200, loadSplitContent());
  }

  if (requestUrl.pathname === "/api/content" && request.method === "POST") {
    return saveContent(request, response);
  }

  if (requestUrl.pathname === "/api/image-assets" && request.method === "GET") {
    return listImageAssets(response);
  }

  if (requestUrl.pathname === "/api/image-assets" && request.method === "POST") {
    return saveImageAsset(request, response);
  }

  const staticPath = resolvePath(requestUrl.pathname);
  if (!staticPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isDirectory()) {
    const indexPath = path.join(staticPath, "index.html");
    if (fs.existsSync(indexPath)) {
      return sendFile(indexPath, response);
    }
  }

  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    return sendFile(staticPath, response);
  }

  const fallback = path.join(rootDir, "index.html");
  if (fs.existsSync(fallback)) {
    return sendFile(fallback, response);
  }

  response.writeHead(404);
  response.end("Not found");
});

server.listen(port, host, () => {
  console.log(`North Phoenix Weiqi running at http://${host}:${port}`);
});

function resolvePath(requestPath) {
  // Normalize "/" to the homepage and reject any path that escapes the repo root.
  const decodedPath = decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath);
  const fullPath = path.join(rootDir, decodedPath);
  if (!fullPath.startsWith(rootDir)) {
    return null;
  }
  return fullPath;
}

function sendFile(filePath, response) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function saveContent(request, response) {
  try {
    const rawBody = await readBody(request);
    const parsedBody = JSON.parse(rawBody);

    if (!parsedBody || typeof parsedBody !== "object") {
      return sendJson(response, 400, { ok: false, error: "Content payload must be an object." });
    }
    if (!parsedBody.site || !Array.isArray(parsedBody.categories) || !Array.isArray(parsedBody.posts)) {
      return sendJson(response, 400, { ok: false, error: "Content must include site, categories, and posts." });
    }

    const { postResults, fatalError } = validateAndWriteSplitContent(parsedBody);
    if (fatalError) {
      return sendJson(response, 400, { ok: false, error: fatalError });
    }

    const failedPosts = postResults.filter((r) => !r.ok);
    sendJson(response, 200, {
      ok: true,
      postResults,
      warnings: failedPosts.map((r) => `"${r.id}": ${r.error}`),
    });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message });
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function loadSplitContent() {
  // `content.json` keeps shared site/category data while full posts live in `data/posts/`.
  const baseContent = readJsonFile(contentPath, { site: {}, categories: [], posts: [] });
  const inlinePosts = Array.isArray(baseContent.posts) ? baseContent.posts : [];
  const indexedPosts = readPostsFromDirectory();

  return {
    site: baseContent.site || {},
    categories: Array.isArray(baseContent.categories) ? baseContent.categories : [],
    posts: indexedPosts.length ? indexedPosts : inlinePosts,
  };
}

function readPostsFromDirectory() {
  if (!fs.existsSync(postsIndexPath)) {
    return [];
  }

  const indexPayload = readJsonFile(postsIndexPath, { posts: [] });
  const postEntries = Array.isArray(indexPayload.posts) ? indexPayload.posts : [];

  return postEntries.map((entry) => {
    const postId = typeof entry?.id === "string" ? entry.id : "";
    if (!postId) {
      throw new Error("Post index contains an invalid entry.");
    }

    const postPath = path.join(postsDir, `${postId}.json`);
    return readJsonFile(postPath, null);
  });
}

function validateAndWriteSplitContent(content) {
  fs.mkdirSync(postsDir, { recursive: true });

  // Always write the shared site/category data — these have no per-post risk.
  writeJsonFileAtomic(contentPath, { site: content.site, categories: content.categories });

  // Validate and write each post independently. A bad puzzle in one post
  // will not prevent the rest from saving.
  const seenIds = new Set();
  const postResults = [];
  const savedPostIds = new Set();

  content.posts.forEach((post, index) => {
    const postLabel = post?.id ? `"${post.id}"` : `post ${index + 1}`;
    try {
      if (!post || typeof post !== "object") throw new Error("Invalid post object.");
      if (typeof post.id !== "string" || !post.id.trim()) throw new Error("Post needs an id.");
      if (!/^[a-z0-9-]+$/.test(post.id)) throw new Error(`Invalid post id format.`);
      if (seenIds.has(post.id)) throw new Error(`Duplicate post id.`);
      seenIds.add(post.id);

      if (Array.isArray(post.contentBlocks)) {
        post.contentBlocks.forEach((block, blockIndex) => {
          validateContentBlock(block, index, blockIndex);
        });
      }

      const postPath = path.join(postsDir, `${post.id}.json`);
      writeJsonFileAtomic(postPath, post);
      savedPostIds.add(post.id);
      postResults.push({ id: post.id || postLabel, ok: true });
    } catch (error) {
      postResults.push({ id: post?.id || postLabel, ok: false, error: error.message });
    }
  });

  // Build the index from all posts the editor sent — those that failed to
  // save keep their last valid file on disk; the index still points to them.
  const postsIndex = {
    posts: content.posts
      .filter((post) => post && typeof post.id === "string" && post.id.trim())
      .map((post) => buildPostIndexEntry(post)),
  };
  writeJsonFileAtomic(postsIndexPath, postsIndex);

  // Remove files for posts that were deleted from the editor (not in this save at all).
  if (fs.existsSync(postsDir)) {
    const allSentIds = new Set(
      content.posts.filter((p) => p?.id).map((p) => p.id)
    );
    fs.readdirSync(postsDir, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json" || entry.name === "index.json") {
        return;
      }
      const postId = path.basename(entry.name, ".json");
      if (!allSentIds.has(postId)) {
        fs.unlinkSync(path.join(postsDir, entry.name));
      }
    });
  }

  return { postResults, fatalError: null };
}

function buildPostIndexEntry(post) {
  return {
    id: post.id,
    title: post.title,
    category: post.category,
    date: post.date,
    summary: post.summary,
    coverImage: post.coverImage,
    published: post.published,
    featured: post.featured,
    tags: Array.isArray(post.tags) ? post.tags : [],
    bodyFormat: post.bodyFormat,
  };
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFileAtomic(filePath, payload) {
  writeFileAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeFileAtomic(filePath, data) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );

  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

function validateContent(content) {
  if (!content || typeof content !== "object") {
    throw new Error("Content payload must be an object.");
  }

  if (!content.site || !Array.isArray(content.categories) || !Array.isArray(content.posts)) {
    throw new Error("Content must include site, categories, and posts.");
  }

  const postIds = new Set();
  content.posts.forEach((post, index) => {
    if (!post || typeof post !== "object") {
      throw new Error(`Post ${index + 1} is invalid.`);
    }

    if (typeof post.id !== "string" || !post.id.trim()) {
      throw new Error(`Post ${index + 1} needs an id.`);
    }

    if (!/^[a-z0-9-]+$/.test(post.id)) {
      throw new Error(`Post "${post.id}" has an invalid id.`);
    }

    if (postIds.has(post.id)) {
      throw new Error(`Duplicate post id "${post.id}".`);
    }

    postIds.add(post.id);

    if (!Array.isArray(post.contentBlocks)) {
      return;
    }

    post.contentBlocks.forEach((block, blockIndex) => {
      validateContentBlock(block, index, blockIndex);
    });
  });
}

function validateContentBlock(block, postIndex, blockIndex) {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} is invalid.`);
  }

  if (typeof block.type !== "string" || !block.type.trim()) {
    throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} needs a type.`);
  }

  if (block.type !== "weiqi") {
    return;
  }

  validateWeiqiBlock(block, postIndex, blockIndex);
}

function validateWeiqiBlock(block, postIndex, blockIndex) {
  if (!["static", "animated", "puzzle"].includes(block.mode)) {
    throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} has an invalid Weiqi mode.`);
  }

  if (!weiqiBoardSizes.has(Number(block.boardSize))) {
    throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} must use board size 9, 13, or 19.`);
  }

  if ((block.coordinateSystem || "zero-based") !== "zero-based") {
    throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} must use zero-based coordinates.`);
  }

  const boardSize = Number(block.boardSize);
  const initialPosition = Array.isArray(block.initialPosition) ? block.initialPosition : [];
  validateWeiqiStoneList(initialPosition, boardSize, `Post ${postIndex + 1} block ${blockIndex + 1} initialPosition`);
  validateUniqueBoardPoints(initialPosition, `Post ${postIndex + 1} block ${blockIndex + 1} initialPosition`);
  validateWeiqiViewWindow(block.viewWindow, boardSize, `Post ${postIndex + 1} block ${blockIndex + 1} viewWindow`);

  if (block.mode === "animated") {
    const animationChunks =
      Array.isArray(block.animationChunks) && block.animationChunks.length
        ? block.animationChunks
        : Array.isArray(block.variations) && block.variations.length
          ? block.variations
          : [{ label: "Main line", moves: block.moves || [] }];
    let currentStones = [...initialPosition];
    animationChunks.forEach((chunk, chunkIndex) => {
      validateWeiqiStoneList(chunk.moves, boardSize, `Post ${postIndex + 1} block ${blockIndex + 1} chunk ${chunkIndex + 1} moves`);
      validateWeiqiStoneProgression(
        currentStones,
        chunk.moves,
        boardSize,
        `Post ${postIndex + 1} block ${blockIndex + 1} chunk ${chunkIndex + 1} moves`
      );
      (chunk.moves || []).forEach((move, moveIndex) => {
        validateWeiqiMarkers(
          move.markers,
          boardSize,
          `Post ${postIndex + 1} block ${blockIndex + 1} chunk ${chunkIndex + 1} move ${moveIndex + 1} markers`
        );
      });
      currentStones = applyWeiqiMoveSequence(currentStones, chunk.moves || [], boardSize).stones;
    });
  }

  if (block.mode === "puzzle") {
    if (typeof block.prompt !== "string" || !block.prompt.trim()) {
      throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} puzzle needs a prompt.`);
    }

    const branches = normalizeWeiqiPuzzleBranches(block);
    validateWeiqiPuzzleBranches(branches, boardSize, initialPosition, `Post ${postIndex + 1} block ${blockIndex + 1} branches`);
    if (block.explanation != null && typeof block.explanation !== "string") {
      throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} explanation must be a string.`);
    }
    if (block.defaultIncorrectMessage != null && typeof block.defaultIncorrectMessage !== "string") {
      throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} defaultIncorrectMessage must be a string.`);
    }
  }

  validateWeiqiMarkers(block.markers, boardSize, `Post ${postIndex + 1} block ${blockIndex + 1} markers`);
}

function validateWeiqiStoneList(list, boardSize, label) {
  if (!Array.isArray(list)) {
    throw new Error(`${label} must be an array.`);
  }

  list.forEach((stone, index) => {
    if (!stone || typeof stone !== "object") {
      throw new Error(`${label} item ${index + 1} is invalid.`);
    }
    if (!weiqiStoneColors.has(stone.color)) {
      throw new Error(`${label} item ${index + 1} has an invalid color.`);
    }
    validateBoardPoint(stone.x, stone.y, boardSize, `${label} item ${index + 1}`);
  });
}

function validateWeiqiMarkers(list, boardSize, label) {
  if (list == null) {
    return;
  }
  if (!Array.isArray(list)) {
    throw new Error(`${label} must be an array.`);
  }

  list.forEach((marker, index) => {
    if (!marker || typeof marker !== "object") {
      throw new Error(`${label} item ${index + 1} is invalid.`);
    }

    validateBoardPoint(marker.x, marker.y, boardSize, `${label} item ${index + 1}`);
    if (marker.shape != null && !weiqiMarkerShapes.has(marker.shape)) {
      throw new Error(`${label} item ${index + 1} has an invalid shape.`);
    }
  });
}

function validateWeiqiFailureStates(list, boardSize, label) {
  if (list == null) {
    return;
  }
  if (!Array.isArray(list)) {
    throw new Error(`${label} must be an array.`);
  }

  list.forEach((failure, index) => {
    if (!failure || typeof failure !== "object") {
      throw new Error(`${label} item ${index + 1} is invalid.`);
    }
    validateBoardPoint(failure.x, failure.y, boardSize, `${label} item ${index + 1}`);
    if (failure.message != null && typeof failure.message !== "string") {
      throw new Error(`${label} item ${index + 1} message must be a string.`);
    }
  });
}

function validateWeiqiFailureSequences(list, boardSize, initialPosition, label) {
  if (list == null) {
    return;
  }
  if (!Array.isArray(list)) {
    throw new Error(`${label} must be an array.`);
  }

  list.forEach((sequence, index) => {
    if (!sequence || typeof sequence !== "object") {
      throw new Error(`${label} item ${index + 1} is invalid.`);
    }
    validateWeiqiStoneList(sequence.moves || [], boardSize, `${label} item ${index + 1} moves`);
    validateWeiqiStoneProgression(initialPosition, sequence.moves || [], boardSize, `${label} item ${index + 1} moves`);
    if (sequence.message != null && typeof sequence.message !== "string") {
      throw new Error(`${label} item ${index + 1} message must be a string.`);
    }
  });
}

function normalizeWeiqiPuzzleBranches(block) {
  if (Array.isArray(block.branches) && block.branches.length) {
    return block.branches.map((branch, index) => ({
      id: branch.id || `branch-${index + 1}`,
      label: branch.label || `Branch ${index + 1}`,
      moves: Array.isArray(branch.moves) ? branch.moves : [],
      outcome: branch.outcome === "incorrect" ? "incorrect" : "correct",
      message: typeof branch.message === "string" ? branch.message : "",
    }));
  }

  const successSequence = Array.isArray(block.successSequence) ? block.successSequence : Array.isArray(block.solution) ? block.solution : [];
  const branches = successSequence.length
    ? [
        {
          id: "branch-1",
          label: "Correct line",
          moves: successSequence,
          outcome: "correct",
          message: "",
        },
      ]
    : [];

  const failureSequences = Array.isArray(block.failureSequences)
    ? block.failureSequences
    : Array.isArray(block.failureStates)
      ? block.failureStates.map((failureState) => ({
          moves: [{ color: successSequence[0]?.color || "black", x: failureState.x, y: failureState.y }],
          message: failureState.message || "",
        }))
      : [];

  failureSequences.forEach((sequence, index) => {
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

function validateWeiqiPuzzleBranches(list, boardSize, initialPosition, label) {
  if (!Array.isArray(list)) {
    throw new Error(`${label} must be an array.`);
  }

  list.forEach((branch, index) => {
    if (!branch || typeof branch !== "object") {
      throw new Error(`${label} item ${index + 1} is invalid.`);
    }
    if (branch.outcome !== "correct" && branch.outcome !== "incorrect") {
      throw new Error(`${label} item ${index + 1} must end in correct or incorrect.`);
    }
    validateWeiqiStoneList(branch.moves || [], boardSize, `${label} item ${index + 1} moves`);
    validateWeiqiStoneProgression(initialPosition, branch.moves || [], boardSize, `${label} item ${index + 1} moves`);
    if (branch.message != null && typeof branch.message !== "string") {
      throw new Error(`${label} item ${index + 1} message must be a string.`);
    }
  });

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const branchA = list[i];
      const branchB = list[j];
      // Skip overlap check for branches still being built (no moves yet).
      if (!branchA.moves.length || !branchB.moves.length) {
        continue;
      }
      const sharedLength = Math.min(branchA.moves.length, branchB.moves.length);
      let diverged = false;

      for (let moveIndex = 0; moveIndex < sharedLength; moveIndex += 1) {
        const moveA = branchA.moves[moveIndex];
        const moveB = branchB.moves[moveIndex];
        if (!moveA || !moveB || moveA.color !== moveB.color || moveA.x !== moveB.x || moveA.y !== moveB.y) {
          diverged = true;
          break;
        }
      }

      if (!diverged && (branchA.moves.length === sharedLength || branchB.moves.length === sharedLength)) {
        throw new Error(
          `${label} items ${i + 1} and ${j + 1} share the same move path — one branch ends where the other passes through. Give them different first moves or extend the shorter branch so they diverge.`
        );
      }
    }
  }
}

function validateWeiqiViewWindow(viewWindow, boardSize, label) {
  if (viewWindow == null) {
    return;
  }
  if (!viewWindow || typeof viewWindow !== "object") {
    throw new Error(`${label} must be an object.`);
  }

  ["xMin", "yMin", "xMax", "yMax"].forEach((key) => {
    if (!Number.isInteger(viewWindow[key])) {
      throw new Error(`${label} ${key} must be an integer.`);
    }
  });

  validateBoardPoint(viewWindow.xMin, viewWindow.yMin, boardSize, `${label} top-left`);
  validateBoardPoint(viewWindow.xMax, viewWindow.yMax, boardSize, `${label} bottom-right`);
  if (viewWindow.xMax < viewWindow.xMin || viewWindow.yMax < viewWindow.yMin) {
    throw new Error(`${label} has inverted bounds.`);
  }

  const minSpan = Math.min(minWeiqiViewSpan, boardSize - 1);
  if (viewWindow.xMax - viewWindow.xMin < minSpan || viewWindow.yMax - viewWindow.yMin < minSpan) {
    throw new Error(`${label} is too small.`);
  }
}

function validateUniqueBoardPoints(stones, label) {
  const seen = new Set();
  stones.forEach((stone, index) => {
    const key = `${stone.x},${stone.y}`;
    if (seen.has(key)) {
      throw new Error(`${label} item ${index + 1} repeats an occupied point.`);
    }
    seen.add(key);
  });
}

function getBoardPointKey(point) {
  return `${point.x},${point.y}`;
}

function buildWeiqiStoneMap(stones = []) {
  const stoneMap = new Map();
  stones.forEach((stone) => {
    stoneMap.set(getBoardPointKey(stone), stone);
  });
  return stoneMap;
}

function getNeighborBoardPoints(point, boardSize) {
  const neighbors = [];
  if (point.x > 0) {
    neighbors.push({ x: point.x - 1, y: point.y });
  }
  if (point.x < boardSize - 1) {
    neighbors.push({ x: point.x + 1, y: point.y });
  }
  if (point.y > 0) {
    neighbors.push({ x: point.x, y: point.y - 1 });
  }
  if (point.y < boardSize - 1) {
    neighbors.push({ x: point.x, y: point.y + 1 });
  }
  return neighbors;
}

function collectWeiqiGroup(stoneMap, startPoint, boardSize) {
  const startStone = stoneMap.get(getBoardPointKey(startPoint));
  if (!startStone) {
    return { stones: [], liberties: new Set() };
  }

  const queue = [startStone];
  const visited = new Set();
  const stones = [];
  const liberties = new Set();

  while (queue.length) {
    const stone = queue.pop();
    const stoneKey = getBoardPointKey(stone);
    if (visited.has(stoneKey)) {
      continue;
    }

    visited.add(stoneKey);
    stones.push(stone);

    getNeighborBoardPoints(stone, boardSize).forEach((neighbor) => {
      const neighborKey = getBoardPointKey(neighbor);
      const neighborStone = stoneMap.get(neighborKey);
      if (!neighborStone) {
        liberties.add(neighborKey);
        return;
      }
      if (neighborStone.color === startStone.color && !visited.has(neighborKey)) {
        queue.push(neighborStone);
      }
    });
  }

  return { stones, liberties };
}

function applyWeiqiMoveToStoneMap(stoneMap, move, boardSize) {
  const pointKey = getBoardPointKey(move);
  if (stoneMap.has(pointKey)) {
    throw new Error(`plays on an occupied point at (${move.x}, ${move.y})`);
  }

  const nextMap = new Map(stoneMap);
  const placedStone = { ...move };
  nextMap.set(pointKey, placedStone);

  const opponentColor = move.color === "black" ? "white" : "black";
  const processedGroups = new Set();

  getNeighborBoardPoints(move, boardSize).forEach((neighbor) => {
    const neighborKey = getBoardPointKey(neighbor);
    const neighborStone = nextMap.get(neighborKey);
    if (!neighborStone || neighborStone.color !== opponentColor || processedGroups.has(neighborKey)) {
      return;
    }

    const group = collectWeiqiGroup(nextMap, neighborStone, boardSize);
    group.stones.forEach((stone) => processedGroups.add(getBoardPointKey(stone)));
    if (group.liberties.size === 0) {
      group.stones.forEach((stone) => {
        nextMap.delete(getBoardPointKey(stone));
      });
    }
  });

  const ownGroup = collectWeiqiGroup(nextMap, placedStone, boardSize);
  if (ownGroup.liberties.size === 0) {
    throw new Error(`has no liberties after captures at (${move.x}, ${move.y})`);
  }

  return {
    stoneMap: nextMap,
    stones: [...nextMap.values()],
  };
}

function applyWeiqiMoveSequence(initialPosition, sequence, boardSize) {
  let stoneMap = buildWeiqiStoneMap(initialPosition);
  (sequence || []).forEach((move) => {
    stoneMap = applyWeiqiMoveToStoneMap(stoneMap, move, boardSize).stoneMap;
  });
  return {
    stoneMap,
    stones: [...stoneMap.values()],
  };
}

function validateWeiqiStoneProgression(initialPosition, sequence, boardSize, label) {
  let stoneMap = buildWeiqiStoneMap(initialPosition);
  sequence.forEach((stone, index) => {
    try {
      stoneMap = applyWeiqiMoveToStoneMap(stoneMap, stone, boardSize).stoneMap;
    } catch (error) {
      throw new Error(`${label} item ${index + 1} ${error.message}.`);
    }
  });
}

function validateBoardPoint(x, y, boardSize, label) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`${label} must use integer x and y coordinates.`);
  }

  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
    throw new Error(`${label} is outside the ${boardSize}x${boardSize} board.`);
  }
}

function listImageAssets(response) {
  const assets = walkImageAssets(assetsImagesDir).map((filePath) => ({
    name: path.basename(filePath),
    path: `/${path.relative(rootDir, filePath).replaceAll(path.sep, "/")}`,
  }));

  sendJson(response, 200, { ok: true, assets });
}

async function saveImageAsset(request, response) {
  try {
    const rawBody = await readBody(request);
    const { filename, dataUrl, collection } = JSON.parse(rawBody);
    const parsedUpload = parseImageUpload(filename, dataUrl);
    const targetDir = getImageCollectionDir(collection);
    fs.mkdirSync(targetDir, { recursive: true });

    const finalName = getUniqueUploadName(targetDir, parsedUpload.filename);
    const filePath = path.join(targetDir, finalName);
    writeFileAtomic(filePath, parsedUpload.buffer);

    sendJson(response, 200, {
      ok: true,
      path: `/${path.relative(rootDir, filePath).replaceAll(path.sep, "/")}`,
    });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message });
  }
}

function walkImageAssets(startDir) {
  if (!fs.existsSync(startDir)) {
    return [];
  }

  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  const files = [];
  entries.forEach((entry) => {
    const entryPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkImageAssets(entryPath));
      return;
    }

    if (isImageFilename(entry.name)) {
      files.push(entryPath);
    }
  });
  return files;
}

function getImageCollectionDir(collection) {
  if (collection === "post-covers") {
    return postCoversDir;
  }

  return postButtonsDir;
}

function isImageFilename(filename) {
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(path.extname(filename).toLowerCase());
}

function parseImageUpload(filename, dataUrl) {
  if (typeof filename !== "string" || !filename.trim()) {
    throw new Error("Uploaded image needs a filename.");
  }

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    throw new Error("Uploaded image must be a data URL.");
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Uploaded image format is invalid.");
  }

  const extension = normalizeImageExtension(match[1]);
  const safeBaseName =
    path.basename(filename, path.extname(filename)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "") || "button-logo";
  return {
    filename: `${safeBaseName}.${extension}`,
    buffer: Buffer.from(match[2], "base64"),
  };
}

function normalizeImageExtension(mimeType) {
  const mapping = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };

  const extension = mapping[mimeType.toLowerCase()];
  if (!extension) {
    throw new Error("That image type is not supported.");
  }
  return extension;
}

function getUniqueUploadName(targetDir, filename) {
  const extension = path.extname(filename);
  const baseName = path.basename(filename, extension);
  let candidate = filename;
  let counter = 1;

  while (fs.existsSync(path.join(targetDir, candidate))) {
    counter += 1;
    candidate = `${baseName}-${counter}${extension}`;
  }

  return candidate;
}
