const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

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
    validateContent(parsedBody);
    writeSplitContent(parsedBody);
    sendJson(response, 200, { ok: true });
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

function writeSplitContent(content) {
  fs.mkdirSync(postsDir, { recursive: true });

  const siteContent = {
    site: content.site,
    categories: content.categories,
  };
  fs.writeFileSync(contentPath, `${JSON.stringify(siteContent, null, 2)}\n`);

  const nextPostIds = new Set();
  const postsIndex = {
    posts: content.posts.map((post) => {
      nextPostIds.add(post.id);
      const postPath = path.join(postsDir, `${post.id}.json`);
      fs.writeFileSync(postPath, `${JSON.stringify(post, null, 2)}\n`);
      return buildPostIndexEntry(post);
    }),
  };

  fs.writeFileSync(postsIndexPath, `${JSON.stringify(postsIndex, null, 2)}\n`);

  if (fs.existsSync(postsDir)) {
    fs.readdirSync(postsDir, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json" || entry.name === "index.json") {
        return;
      }

      const postId = path.basename(entry.name, ".json");
      if (!nextPostIds.has(postId)) {
        fs.unlinkSync(path.join(postsDir, entry.name));
      }
    });
  }
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
    const variations = Array.isArray(block.variations) && block.variations.length ? block.variations : [{ label: "Main line", moves: block.moves || [] }];
    variations.forEach((variation, variationIndex) => {
      validateWeiqiStoneList(variation.moves, boardSize, `Post ${postIndex + 1} block ${blockIndex + 1} variation ${variationIndex + 1} moves`);
      validateWeiqiStoneProgression(initialPosition, variation.moves, `Post ${postIndex + 1} block ${blockIndex + 1} variation ${variationIndex + 1} moves`);
    });
  }

  if (block.mode === "puzzle") {
    if (typeof block.prompt !== "string" || !block.prompt.trim()) {
      throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} puzzle needs a prompt.`);
    }

    const successSequence = Array.isArray(block.successSequence) ? block.successSequence : Array.isArray(block.solution) ? block.solution : [];
    validateWeiqiStoneList(successSequence, boardSize, `Post ${postIndex + 1} block ${blockIndex + 1} successSequence`);
    validateWeiqiStoneProgression(initialPosition, successSequence, `Post ${postIndex + 1} block ${blockIndex + 1} successSequence`);

    const failureSequences = Array.isArray(block.failureSequences)
      ? block.failureSequences
      : Array.isArray(block.failureStates)
        ? block.failureStates.map((failureState) => ({
            moves: [{ color: successSequence[0]?.color || "black", x: failureState.x, y: failureState.y }],
            message: failureState.message || "",
          }))
        : [];

    validateWeiqiFailureSequences(failureSequences, boardSize, initialPosition, `Post ${postIndex + 1} block ${blockIndex + 1} failureSequences`);
    if (block.explanation != null && typeof block.explanation !== "string") {
      throw new Error(`Post ${postIndex + 1} block ${blockIndex + 1} explanation must be a string.`);
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
    validateWeiqiStoneProgression(initialPosition, sequence.moves || [], `${label} item ${index + 1} moves`);
    if (sequence.message != null && typeof sequence.message !== "string") {
      throw new Error(`${label} item ${index + 1} message must be a string.`);
    }
  });
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

function validateWeiqiStoneProgression(initialPosition, sequence, label) {
  const occupied = new Set();
  initialPosition.forEach((stone) => {
    occupied.add(`${stone.x},${stone.y}`);
  });

  sequence.forEach((stone, index) => {
    const key = `${stone.x},${stone.y}`;
    if (occupied.has(key)) {
      throw new Error(`${label} item ${index + 1} plays on an occupied point.`);
    }
    occupied.add(key);
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
    fs.writeFileSync(filePath, parsedUpload.buffer);

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
