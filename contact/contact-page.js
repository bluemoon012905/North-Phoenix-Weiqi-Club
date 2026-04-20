const { escapeHtml, escapeAttribute } = window.BlueshellContent;

const contactElements = {
  hero: document.getElementById("contact-hero"),
  sections: document.getElementById("contact-sections"),
};

loadContactPage().catch(() => {
  document.title = "Contact | North Phoenix Weiqi";
  renderContactPage({
    brandMark: "North Phoenix Weiqi",
    contactTitle: "Contact",
    contactEyebrow: "Reach out",
    contactDescription: "Could not load site content.",
    contactHref: "",
    feedbackHref: "",
  });
  window.BlueshellContent.initLocalDebugPanels();
});

async function loadContactPage() {
  const response = await fetch("../data/content.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load page content.");
  }

  const content = await response.json();
  const site = content.site || {};
  const contactTitle = site.contactLabel || "Contact";
  document.title = `${contactTitle} | ${site.title || "North Phoenix Weiqi"}`;
  renderContactPage(site);
  window.BlueshellContent.initLocalDebugPanels();
}

function renderContactPage(site) {
  const brandMark = site.brandMark || site.title || "North Phoenix Weiqi";
  const contactTitle = site.contactLabel || "Contact";
  const contactEyebrow = site.contactEyebrow || site.aboutEyebrow || "Reach out";
  const contactDescription = site.contactDescription || site.about || "";
  const email = typeof site.contactHref === "string" ? site.contactHref.trim() : "";
  const feedbackHref = typeof site.feedbackHref === "string" ? site.feedbackHref.trim() : "";
  const hasEmail = Boolean(email);
  const hasFeedback = Boolean(feedbackHref);

  contactElements.hero.innerHTML = `
    <div class="hero-nav">
      <div class="brand-mark">
        <span>${escapeHtml(brandMark)}</span>
      </div>
      <a class="ghost-link" href="/">Back home</a>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">${escapeHtml(contactEyebrow)}</p>
      <h1 id="contact-title">${escapeHtml(contactTitle)}</h1>
      <p>${escapeHtml(contactDescription)}</p>
      <div class="hero-actions">
        ${
          hasEmail
            ? `<a class="pill-link hero-contact-link" href="mailto:${escapeAttribute(email)}">${escapeHtml(email)}</a>`
            : ""
        }
        ${
          hasFeedback
            ? `<a class="ghost-link" href="${escapeAttribute(feedbackHref)}" target="_blank" rel="noreferrer">Open feedback form</a>`
            : ""
        }
      </div>
    </div>
  `;

  contactElements.sections.innerHTML = `
    <section class="section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Direct contact</p>
          <h2>Ways to reach the club</h2>
        </div>
      </div>
      <div class="category-grid">
        <article class="category-card">
          <span class="post-chip">Email</span>
          <h3>${hasEmail ? escapeHtml(contactTitle) : "Not available"}</h3>
          <p>${
            hasEmail
              ? `Send a message to ${escapeHtml(email)}.`
              : "No email address is currently configured."
          }</p>
          <div class="hero-actions">
            ${
              hasEmail
                ? `<a class="pill-link" href="mailto:${escapeAttribute(email)}">Email now</a>
                   <button id="copy-email-button" class="ghost-link" type="button">Copy</button>`
                : ""
            }
          </div>
        </article>
        <article class="category-card">
          <span class="post-chip">Feedback</span>
          <h3>Form</h3>
          <p>${
            hasFeedback
              ? "Use the form if you want to share feedback, details, or a longer note."
              : "No feedback form is currently configured."
          }</p>
          <div class="hero-actions">
            ${
              hasFeedback
                ? `<a class="ghost-link" href="${escapeAttribute(feedbackHref)}" target="_blank" rel="noreferrer">Open form</a>`
                : ""
            }
          </div>
        </article>
      </div>
    </section>
  `;

  bindCopyEmail(email);
}

function bindCopyEmail(email) {
  const copyButton = document.getElementById("copy-email-button");
  if (!copyButton) {
    return;
  }

  copyButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!email) {
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      copyButton.textContent = "Copied";
    } catch {
      copyButton.textContent = "Failed";
    }

    window.setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1600);
  });
}
