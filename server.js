const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const rootDir = __dirname;
const contentPath = path.join(rootDir, "data", "content.json");
const assetsImagesDir = path.join(rootDir, "assets", "images");
const postButtonsDir = path.join(assetsImagesDir, "post-buttons");
const postCoversDir = path.join(assetsImagesDir, "post-covers");
const port = process.env.PORT || 4321;
const host = process.env.HOST || "127.0.0.1";

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
    return sendFile(contentPath, response);
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
  console.log(`Blue Shell Almanac running at http://${host}:${port}`);
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

async function saveContent(request, response) {
  try {
    const rawBody = await readBody(request);
    const parsedBody = JSON.parse(rawBody);
    validateContent(parsedBody);
    fs.writeFileSync(contentPath, `${JSON.stringify(parsedBody, null, 2)}\n`);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: error.message }));
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

function validateContent(content) {
  if (!content || typeof content !== "object") {
    throw new Error("Content payload must be an object.");
  }

  if (!content.site || !Array.isArray(content.categories) || !Array.isArray(content.posts)) {
    throw new Error("Content must include site, categories, and posts.");
  }
}

function listImageAssets(response) {
  const assets = walkImageAssets(assetsImagesDir).map((filePath) => ({
    name: path.basename(filePath),
    path: `/${path.relative(rootDir, filePath).replaceAll(path.sep, "/")}`,
  }));

  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: true, assets }));
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

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        ok: true,
        path: `/${path.relative(rootDir, filePath).replaceAll(path.sep, "/")}`,
      })
    );
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: error.message }));
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
  const safeBaseName = path.basename(filename, path.extname(filename)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "") || "button-logo";
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
