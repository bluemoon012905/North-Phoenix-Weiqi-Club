#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");

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

  if (!username || !password) {
    throw new Error("Missing WEIQI_USERNAME or WEIQI_PASSWORD in .env.");
  }

  const slug = makeSlugFromUrl(targetUrl);
  const outputPath = path.resolve(rootDir, args.flags.out || `tmp/101weiqi/${slug}.json`);
  const debugDir = path.resolve(rootDir, args.flags["debug-dir"] || `tmp/101weiqi/${slug}`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(debugDir, { recursive: true });

  const browser = await chromium.launch({
    headless: !hasFlag(args.flags, "headful"),
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1400 },
  });
  const page = await context.newPage();
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
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const rawHtml = await page.content();
    const scraped = await extractPageData(page, targetUrl);

    fs.writeFileSync(path.join(debugDir, "page.html"), rawHtml);
    await page.screenshot({
      path: path.join(debugDir, "page.png"),
      fullPage: true,
    });
    fs.writeFileSync(path.join(debugDir, "network.json"), `${JSON.stringify(networkCaptures, null, 2)}\n`);

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
        htmlPath: path.relative(rootDir, path.join(debugDir, "page.html")),
        screenshotPath: path.relative(rootDir, path.join(debugDir, "page.png")),
        networkPath: path.relative(rootDir, path.join(debugDir, "network.json")),
      },
    };

    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Saved ${path.relative(rootDir, outputPath)}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function login(page, options) {
  const loginUrl = new URL(options.loginPath, options.baseUrl).toString();

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
