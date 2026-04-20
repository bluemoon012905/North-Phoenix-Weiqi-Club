const BlueshellContent = {
  isLocalEnvironment: ["localhost", "127.0.0.1", ""].includes(window.location.hostname),
  DEFAULT_HOME_PANELS: [
    {
      id: "outline",
      type: "category-overview",
      eyebrow: "Outline",
      title: "Four rooms, one archive.",
      description: "",
      enabled: true,
    },
    {
      id: "featured",
      type: "featured-posts",
      eyebrow: "Featured",
      title: "Current highlights",
      description: "",
      enabled: true,
    },
    {
      id: "archive",
      type: "archive-posts",
      eyebrow: "Archive",
      title: "Browse everything",
      description: "",
      enabled: true,
    },
  ],

  ensureHomePanels(content, defaults = null) {
    const basePanels = defaults || BlueshellContent.DEFAULT_HOME_PANELS;
    const currentPanels = Array.isArray(content.site?.homepagePanels) ? content.site.homepagePanels : [];
    const customPanels = currentPanels.filter((panel) => !basePanels.some((preset) => preset.id === panel.id));

    content.site.homepagePanels = [
      ...basePanels.map((preset) => ({
        ...preset,
        ...currentPanels.find((panel) => panel.id === preset.id),
      })),
      ...customPanels,
    ];

    return content.site.homepagePanels;
  },

  byNewestDate(left, right) {
    return new Date(right.date) - new Date(left.date);
  },

  formatDate(value) {
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  },

  renderMarkdown(markdown) {
    const lines = markdown.split("\n");
    const fragments = [];
    let listItems = [];
    const renderInlineText = (text) => {
      const urlPattern = /(https?:\/\/[^\s<]+)/g;
      let html = "";
      let lastIndex = 0;

      for (const match of text.matchAll(urlPattern)) {
        const [url] = match;
        const index = match.index ?? 0;
        html += BlueshellContent.escapeHtml(text.slice(lastIndex, index));
        html += `<a href="${BlueshellContent.escapeAttribute(url)}" target="_blank" rel="noreferrer">${BlueshellContent.escapeHtml(url)}</a>`;
        lastIndex = index + url.length;
      }

      html += BlueshellContent.escapeHtml(text.slice(lastIndex));
      return html;
    };

    const flushList = () => {
      if (!listItems.length) {
        return;
      }
      fragments.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      listItems = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushList();
        continue;
      }

      if (line.startsWith("### ")) {
        flushList();
        fragments.push(`<h3>${BlueshellContent.escapeHtml(line.slice(4))}</h3>`);
        continue;
      }

      if (line.startsWith("## ")) {
        flushList();
        fragments.push(`<h2>${BlueshellContent.escapeHtml(line.slice(3))}</h2>`);
        continue;
      }

      if (line.startsWith("- ")) {
        listItems.push(renderInlineText(line.slice(2)));
        continue;
      }

      flushList();
      fragments.push(`<p>${renderInlineText(line)}</p>`);
    }

    flushList();
    return fragments.join("");
  },

  sanitizeRichHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const disallowedTags = new Set(["script", "style", "iframe", "object", "embed", "meta", "link"]);
    const allowedStyleProps = new Set(["text-align", "color", "background-color", "font-family"]);

    const walk = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const tagName = node.tagName.toLowerCase();
      if (disallowedTags.has(tagName)) {
        node.remove();
        return;
      }

      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;

        if (name.startsWith("on")) {
          node.removeAttribute(attribute.name);
          return;
        }

        if (name === "style") {
          const safeStyles = value
            .split(";")
            .map((rule) => rule.trim())
            .filter(Boolean)
            .filter((rule) => {
              const [property, rawValue] = rule.split(":");
              if (!property || !rawValue) {
                return false;
              }

              const normalizedProperty = property.trim().toLowerCase();
              const normalizedValue = rawValue.trim().toLowerCase();
              return (
                allowedStyleProps.has(normalizedProperty) &&
                !normalizedValue.includes("url(") &&
                !normalizedValue.includes("expression")
              );
            });

          if (safeStyles.length) {
            node.setAttribute("style", safeStyles.join("; "));
          } else {
            node.removeAttribute("style");
          }
          return;
        }

        if (tagName === "img" && name === "src") {
          const safeSource =
            value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/");
          if (!safeSource) {
            node.removeAttribute(attribute.name);
          }
          return;
        }

        if ((name === "src" || name === "href") && value.trim().toLowerCase().startsWith("javascript:")) {
          node.removeAttribute(attribute.name);
        }
      });

      [...node.childNodes].forEach(walk);
    };

    [...template.content.childNodes].forEach(walk);
    return template.innerHTML;
  },

  renderPostBody(post) {
    if (post.bodyFormat === "html") {
      return BlueshellContent.sanitizeRichHtml(post.body || "");
    }
    return BlueshellContent.renderMarkdown(post.body || "");
  },

  getSafeImageSource(value) {
    if (typeof value !== "string") {
      return "";
    }

    const normalized = value.trim();
    if (
      normalized.startsWith("data:image/") ||
      normalized.startsWith("http://") ||
      normalized.startsWith("https://") ||
      normalized.startsWith("/")
    ) {
      return normalized;
    }

    return "";
  },

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  },

  escapeAttribute(value) {
    return BlueshellContent.escapeHtml(value);
  },

  initLocalDebugPanels() {
    if (!BlueshellContent.isLocalEnvironment) {
      return;
    }

    const storageKey = "blueshell-debug-panels";
    const banner = document.querySelector(".top-banner");
    if (banner && !banner.querySelector('[data-local-debug-toggle="true"]')) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "top-banner-link top-banner-button";
      toggle.dataset.localDebugToggle = "true";
      banner.append(toggle);

      toggle.addEventListener("click", () => {
        const enabled = !document.body.classList.contains("debug-panels");
        document.body.classList.toggle("debug-panels", enabled);
        try {
          window.localStorage.setItem(storageKey, enabled ? "1" : "0");
        } catch {}
        BlueshellContent.initLocalDebugPanels();
      });
    }

    let enabled = false;
    try {
      enabled = window.localStorage.getItem(storageKey) === "1";
    } catch {}
    document.body.classList.toggle("debug-panels", enabled);

    const toggle = document.querySelector('[data-local-debug-toggle="true"]');
    if (toggle) {
      toggle.textContent = enabled ? "Debug panels: on" : "Debug panels";
      toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    }

    const targets = document.querySelectorAll(
      ".hero, .section, .post-view, .hero-slide, .hero-nav, .hero-carousel, .hero-carousel-track, .hero-carousel-dots, .hero-carousel-page-indicator, .hero-copy, .hero-actions, .hero-turtle-wrap, .hero-slide-mobile-turtle, .asu-media-stage, .contact-link"
    );
    targets.forEach((element, index) => {
      element.classList.add("debug-panel-target");
      element.classList.remove("debug-panel-anchor");
      if (window.getComputedStyle(element).position === "static") {
        element.classList.add("debug-panel-anchor");
      }
      element.querySelectorAll(":scope > .debug-panel-label").forEach((label) => label.remove());

      const label = document.createElement("span");
      label.className = "debug-panel-label";
      label.textContent = BlueshellContent.getDebugPanelName(element, index);
      element.prepend(label);
    });
  },

  getDebugPanelName(element, index) {
    const explicitName = element.dataset.debugName?.trim();
    if (explicitName) {
      return explicitName;
    }

    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const source = document.getElementById(labelledBy);
      const text = source?.textContent?.trim();
      if (text) {
        return text;
      }
    }

    const ariaLabel = element.getAttribute("aria-label")?.trim();
    if (ariaLabel) {
      return ariaLabel;
    }

    const heading = element.querySelector(":scope h1, :scope h2, :scope h3, :scope .eyebrow, :scope strong");
    const headingText = heading?.textContent?.trim();
    if (headingText) {
      return headingText;
    }

    if (element.id) {
      return element.id;
    }

    if (element.classList.contains("hero-slide-intro")) {
      return "Hero intro slide";
    }

    if (element.classList.contains("hero-slide-panel")) {
      return `Hero panel ${index + 1}`;
    }

    if (element.classList.contains("hero-copy")) {
      return "Hero text";
    }

    if (element.classList.contains("hero-turtle-wrap")) {
      return "Hero turtle desktop";
    }

    if (element.classList.contains("hero-slide-mobile-turtle")) {
      return "Hero turtle mobile";
    }

    if (element.classList.contains("hero-actions")) {
      return "Hero actions";
    }

    if (element.classList.contains("hero")) {
      return "Hero";
    }

    if (element.classList.contains("section")) {
      return `Section ${index + 1}`;
    }

    if (element.classList.contains("contact-link")) {
      return element.querySelector("strong")?.textContent?.trim() || `Contact link ${index + 1}`;
    }

    return element.className.split(/\s+/).filter(Boolean)[0] || `Panel ${index + 1}`;
  },
};

window.BlueshellContent = BlueshellContent;
