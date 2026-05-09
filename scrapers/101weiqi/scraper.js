#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..", "..");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  loadDotEnv(path.join(rootDir, ".env"));

  const args = parseArgs(process.argv.slice(2));
  const targetUrl = args.positionals[0];
  if (!targetUrl) {
    throw new Error("Usage: npm run scrape:101weiqi -- <book-url> [--out path] [--debug-dir path] [--headful]");
  }

  const username = process.env.WEIQI_USERNAME;
  const password = process.env.WEIQI_PASSWORD;
  const baseUrl = process.env.WEIQI_BASE_URL || "https://www.101weiqi.com";
  const loginPath = process.env.WEIQI_LOGIN_PATH || "/login";
  const profileDir = path.resolve(rootDir, args.flags["profile-dir"] || "tmp/101weiqi/browser-profile");
  const manualLogin = hasFlag(args.flags, "manual-login");

  if (!manualLogin && (!username || !password)) {
    throw new Error("Missing WEIQI_USERNAME or WEIQI_PASSWORD in .env.");
  }

  const slug = makeSlugFromUrl(targetUrl);
  const runDir = path.resolve(rootDir, args.flags.out || `tmp/101weiqi/${slug}`);
  const dataDir = path.join(runDir, "data");
  const rawDir = path.join(runDir, "raw");
  const renderDir = path.join(runDir, "render");
  const artifactsDir = path.join(runDir, "artifacts");
  const outputPath = path.join(dataDir, "scrape.json");

  [runDir, dataDir, rawDir, renderDir, artifactsDir].forEach((dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
  });

  fs.mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !hasFlag(args.flags, "headful"),
    viewport: { width: 1440, height: 1400 },
  });
  const page = context.pages()[0] || (await context.newPage());
  const networkCaptures = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!isInterestingResponse(url)) {
      return;
    }

    const contentType = response.headers()["content-type"] || "";
    const capture = {
      url,
      status: response.status(),
      contentType,
    };

    try {
      if (contentType.includes("application/json")) {
        capture.body = JSON.stringify(await response.json(), null, 2);
      } else if (contentType.includes("text/") || contentType.includes("javascript")) {
        capture.body = truncate(await response.text(), 12000);
      }
    } catch (error) {
      capture.error = error instanceof Error ? error.message : String(error);
    }

    networkCaptures.push(capture);
  });

  try {
    await login(page, {
      baseUrl,
      loginPath,
      username,
      password,
      manualLogin,
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const rawHtml = await page.content();
    const scraped = await extractPageData(page, targetUrl);

    fs.writeFileSync(path.join(rawDir, "page.html"), rawHtml);
    await page.screenshot({
      path: path.join(artifactsDir, "page.png"),
      fullPage: true,
    });
    fs.writeFileSync(path.join(rawDir, "network.json"), `${JSON.stringify(networkCaptures, null, 2)}\n`);

    const payload = {
      sourceUrl: targetUrl,
      scrapedAt: new Date().toISOString(),
      loginMethod: "username-password",
      outputVersion: 1,
      title: scraped.title,
      page: scraped.page,
      board: scraped.board,
      candidates: scraped.candidates,
      debug: {
        htmlPath: path.relative(rootDir, path.join(rawDir, "page.html")),
        screenshotPath: path.relative(rootDir, path.join(artifactsDir, "page.png")),
        networkPath: path.relative(rootDir, path.join(rawDir, "network.json")),
      },
    };

    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    fs.writeFileSync(path.join(renderDir, "index.html"), buildRenderPage(payload));

    console.log(`Saved ${path.relative(rootDir, runDir)}`);
  } finally {
    await context.close();
  }
}

async function login(page, options) {
  const loginUrl = new URL(options.loginPath, options.baseUrl).toString();

  if (options.manualLogin) {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("");
    console.log("Manual login required.");
    console.log(`1. A browser window opened to ${loginUrl}`);
    console.log("2. Log into 101weiqi in that window.");
    console.log("3. After you can access the target page in that same browser, return here and press Enter.");
    await waitForEnter();
    return;
  }

  await page.goto(options.baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem("protocol_checked", "true");
  });
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  await page.locator('input[placeholder="账号名"]').fill(options.username);
  await page.locator('input[placeholder="密码"]').fill(options.password);

  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/wq/login/") && response.request().method() === "POST",
    { timeout: 20000 }
  );

  await page.locator(".login-button.active", { hasText: "登录" }).click();
  const loginResponse = await loginResponsePromise;
  const loginResult = await loginResponse.json().catch(() => null);

  if (!loginResult || loginResult.result !== 0) {
    throw new Error(`Login failed. Response: ${JSON.stringify(loginResult)}`);
  }

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

async function extractPageData(page, targetUrl) {
  return page.evaluate((currentUrl) => {
    const visibleText = (node) => node && node.textContent ? node.textContent.replace(/\s+/g, " ").trim() : "";
    const textList = (selector, limit = 20) => Array.from(document.querySelectorAll(selector))
      .map((node) => visibleText(node))
      .filter(Boolean)
      .slice(0, limit);
    const attrMap = (element) => {
      if (!element) {
        return null;
      }

      const result = {};
      for (const attr of Array.from(element.attributes)) {
        result[attr.name] = attr.value;
      }
      return result;
    };

    const boardElement = document.querySelector([
      "[data-board]",
      "[id*='board']",
      "[class*='board']",
      "[class*='goban']",
      "canvas",
      "svg",
    ].join(", "));

    const boardParent = boardElement ? boardElement.closest("section, article, main, div") : null;
    const inlineScriptMatches = [];
    for (const script of Array.from(document.scripts)) {
      const content = script.textContent || "";
      if (!content) {
        continue;
      }

      if (/(sgf|qipu|book|problem|board|moves|step|variation|answer)/i.test(content)) {
        inlineScriptMatches.push(content.slice(0, 1500));
      }
    }

    const meta = Array.from(document.querySelectorAll("meta[name], meta[property]")).map((node) => ({
      name: node.getAttribute("name") || node.getAttribute("property"),
      content: node.getAttribute("content") || "",
    }));

    return {
      title: document.title.trim(),
      page: {
        url: currentUrl,
        h1: textList("h1", 10),
        h2: textList("h2", 20),
        breadcrumbs: textList("nav a, .breadcrumb a, .breadcrumbs a", 20),
        paragraphs: textList("p", 30),
        meta,
      },
      board: {
        found: Boolean(boardElement),
        tagName: boardElement ? boardElement.tagName.toLowerCase() : null,
        attributes: attrMap(boardElement),
        parentAttributes: attrMap(boardParent),
        parentText: visibleText(boardParent),
        htmlSnippet: boardParent ? boardParent.outerHTML.slice(0, 4000) : null,
      },
      candidates: {
        headings: textList("h1, h2, h3, .title, .book-title, .problem-title", 30),
        inlineScriptMatches,
        scriptSources: Array.from(document.scripts)
          .map((script) => script.src)
          .filter(Boolean),
      },
    };
  }, targetUrl);
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      return;
    }

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { positionals, flags };
}

function hasFlag(flags, key) {
  return flags[key] === true || flags[key] === "true";
}

function makeSlugFromUrl(value) {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function truncate(value, limit) {
  if (typeof value !== "string" || value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n...[truncated]`;
}

function isInterestingResponse(url) {
  return /101weiqi\.com/.test(url) && /(book|problem|question|task|qipu|play|api|sgf|login)/i.test(url);
}

function waitForEnter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

function buildRenderPage(payload) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(payload.title || "101weiqi Capture")}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f0e8;
      --ink: #1d1b19;
      --panel: #fffaf2;
      --line: #d8c7a6;
      --accent: #8a4b08;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(181, 133, 74, 0.16), transparent 32%),
        linear-gradient(180deg, #efe6d5 0%, var(--bg) 100%);
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    h1, h2 { margin: 0 0 12px; }
    .grid {
      display: grid;
      gap: 20px;
      grid-template-columns: 1.1fr 0.9fr;
    }
    .panel {
      background: color-mix(in srgb, var(--panel) 92%, white 8%);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 12px 40px rgba(54, 35, 10, 0.08);
    }
    .eyebrow {
      display: inline-block;
      margin-bottom: 10px;
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    iframe, img {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: white;
    }
    iframe {
      min-height: 760px;
    }
    img {
      display: block;
      height: auto;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
      background: #fcf7ef;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      max-height: 720px;
      overflow: auto;
    }
    .meta {
      display: grid;
      gap: 10px;
      margin-bottom: 16px;
    }
    .meta div {
      padding: 10px 12px;
      border-radius: 12px;
      background: #fcf7ef;
      border: 1px solid var(--line);
    }
    a { color: var(--accent); }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      iframe { min-height: 520px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="panel" style="margin-bottom: 20px;">
      <span class="eyebrow">101weiqi Capture</span>
      <h1>${escapeHtml(payload.title || "Untitled")}</h1>
      <div class="meta">
        <div><strong>Source:</strong> <a href="${escapeHtml(payload.sourceUrl)}">${escapeHtml(payload.sourceUrl)}</a></div>
        <div><strong>Board found:</strong> ${payload.board && payload.board.found ? "yes" : "no"}</div>
        <div><strong>Captured:</strong> ${escapeHtml(payload.scrapedAt || "")}</div>
      </div>
    </div>
    <div class="grid">
      <section class="panel">
        <span class="eyebrow">Rendered Page</span>
        <iframe src="../raw/page.html" title="Captured page"></iframe>
      </section>
      <section class="panel">
        <span class="eyebrow">Screenshot</span>
        <img src="../artifacts/page.png" alt="Captured page screenshot">
      </section>
      <section class="panel">
        <span class="eyebrow">Scrape JSON</span>
        <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
      </section>
      <section class="panel">
        <span class="eyebrow">Board Snippet</span>
        <pre>${escapeHtml(payload.board && payload.board.htmlSnippet ? payload.board.htmlSnippet : "No board snippet captured.")}</pre>
      </section>
    </div>
  </main>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
