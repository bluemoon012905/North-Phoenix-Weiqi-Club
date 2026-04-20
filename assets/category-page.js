const categoryHelpers = window.BlueshellContent;

loadCategory().catch((error) => {
  document.getElementById("category-hero").innerHTML = `
    <div class="hero-copy">
      <p class="eyebrow">Category</p>
      <h1>Not available</h1>
      <p>${categoryHelpers.escapeHtml(error.message)}</p>
      <div class="hero-actions">
        <a class="ghost-link" href="/">Back home</a>
      </div>
    </div>
  `;
  document.getElementById("category-heading").textContent = "Unavailable";
  document.getElementById("category-post-grid").innerHTML =
    '<p class="empty-state">That category could not be loaded.</p>';
});

async function loadCategory() {
  const params = new URLSearchParams(window.location.search);
  const categoryId = params.get("category");
  if (!categoryId) {
    throw new Error("No category was provided.");
  }

  const response = await fetch("../data/content.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load content.");
  }

  const content = await response.json();
  const category = (content.categories || []).find((entry) => entry.id === categoryId);
  if (!category) {
    throw new Error("That category does not exist.");
  }

  const posts = (content.posts || [])
    .filter((post) => post.published !== false && post.category === categoryId)
    .sort(categoryHelpers.byNewestDate);

  document.title = `${category.name} | ${content.site?.title || "Blue's collection"}`;
  const heroClassNames = ["hero"];
  const heroDecoration = renderCategoryHeroDecoration(categoryId);
  if (heroDecoration) {
    heroClassNames.push("hero-with-decoration");
  }

  const heroElement = document.getElementById("category-hero");
  heroElement.className = heroClassNames.join(" ");
  heroElement.innerHTML = `
    <div class="hero-nav">
      <div class="brand-mark">
        <span>${categoryHelpers.escapeHtml(content.site?.brandMark || content.site?.title || "Blue's collection")}</span>
      </div>
      <a class="ghost-link" href="/">Back home</a>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">${categoryHelpers.escapeHtml(category.id)}</p>
      <h1>${categoryHelpers.escapeHtml(category.name)}</h1>
      <p>${categoryHelpers.escapeHtml(category.description || "")}</p>
    </div>
    ${heroDecoration}
  `;

  document.getElementById("category-heading").textContent = `${posts.length} post${posts.length === 1 ? "" : "s"} in ${category.name}`;
  document.getElementById("category-post-grid").innerHTML = posts.length
    ? posts.map((post) => renderPostCard(post, category.name)).join("")
    : '<p class="empty-state">No published posts are in this section yet.</p>';
}

function renderPostCard(post, categoryName) {
  const coverImage = categoryHelpers.getSafeImageSource(post.coverImage);
  return `
    <a class="post-card" href="/post/?post=${encodeURIComponent(post.id)}">
      ${
        coverImage
          ? `<img class="post-card-cover" src="${categoryHelpers.escapeAttribute(coverImage)}" alt="${categoryHelpers.escapeAttribute(
              post.title || "Post cover image"
            )}" />`
          : ""
      }
      <span class="post-chip">${categoryHelpers.escapeHtml(categoryName)}</span>
      <h3>${categoryHelpers.escapeHtml(post.title)}</h3>
      <p>${categoryHelpers.escapeHtml(post.summary)}</p>
      <div class="post-meta">
        <span class="tag">${categoryHelpers.formatDate(post.date)}</span>
        ${(post.tags || []).map((tag) => `<span class="tag">${categoryHelpers.escapeHtml(tag)}</span>`).join("")}
      </div>
    </a>
  `;
}

function renderCategoryHeroDecoration(categoryId) {
  if (categoryId === "projects") {
    return `
      <div class="category-hero-decoration" aria-hidden="true">
        <img
          class="category-hero-decoration-image"
          src="../assets/images/turtle-variants/turtle_book.png"
          alt=""
        />
      </div>
    `;
  }

  if (categoryId === "Research") {
    return `
      <div class="category-hero-decoration" aria-hidden="true">
        <img
          class="category-hero-decoration-image"
          src="../assets/images/turtle_DNA.png"
          alt=""
        />
      </div>
    `;
  }

  return "";
}
