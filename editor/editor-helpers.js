const BlueshellEditorHelpers = {
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

  renderMarkdown(markdown) {
    const lines = markdown.split("\n");
    const fragments = [];
    let listItems = [];

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
        fragments.push(`<h3>${BlueshellEditorHelpers.escapeHtml(line.slice(4))}</h3>`);
        continue;
      }

      if (line.startsWith("## ")) {
        flushList();
        fragments.push(`<h2>${BlueshellEditorHelpers.escapeHtml(line.slice(3))}</h2>`);
        continue;
      }

      if (line.startsWith("- ")) {
        listItems.push(BlueshellEditorHelpers.escapeHtml(line.slice(2)));
        continue;
      }

      flushList();
      fragments.push(`<p>${BlueshellEditorHelpers.escapeHtml(line)}</p>`);
    }

    flushList();
    return fragments.join("");
  },

  getEditableBodyHtml(post) {
    if (post.bodyFormat === "html") {
      return BlueshellEditorHelpers.sanitizeRichHtml(post.body || "");
    }
    return BlueshellEditorHelpers.renderMarkdown(post.body || "");
  },

  renderPostBody(post) {
    if (post.bodyFormat === "html") {
      return BlueshellEditorHelpers.sanitizeRichHtml(post.body || "");
    }
    return BlueshellEditorHelpers.renderMarkdown(post.body || "");
  },

  normalizeComposerHtml(html) {
    const cleaned = BlueshellEditorHelpers.sanitizeRichHtml(html || "").trim();
    return cleaned || "<p></p>";
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

  readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  slugify(value) {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "untitled-post"
    );
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
    return BlueshellEditorHelpers.escapeHtml(value);
  },
};

window.BlueshellEditorHelpers = BlueshellEditorHelpers;
