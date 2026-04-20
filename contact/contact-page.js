const contactElements = {
  hero: document.getElementById("contact-hero"),
  sections: document.getElementById("contact-sections"),
};

loadContactPage().catch(() => {
  document.title = "Contact | Blue";
  const page = window.BlueshellAboutSections.renderContactPage({
    contactLabel: "Contact",
    about: "Could not load site content.",
    contactHref: "",
  });
  contactElements.hero.innerHTML = page.hero;
  contactElements.sections.innerHTML = page.sections;
  window.BlueshellContent.initLocalDebugPanels();
});

async function loadContactPage() {
  const response = await fetch("../data/content.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load page content.");
  }

  const content = await response.json();
  const site = content.site || {};
  const page = window.BlueshellAboutSections.renderContactPage(site);

  document.title = `${site.contactLabel || "Contact"} | Blue`;
  contactElements.hero.innerHTML = page.hero;
  contactElements.sections.innerHTML = page.sections;
  bindCopyEmail(page.email);
  window.BlueshellContent.initLocalDebugPanels();
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
