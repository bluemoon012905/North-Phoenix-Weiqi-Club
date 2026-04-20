const {
  DEFAULT_HOME_PANELS,
  ensureHomePanels: ensureContentHomePanels,
  byNewestDate,
  formatDate,
  renderMarkdown,
  sanitizeRichHtml,
  escapeHtml,
  escapeAttribute,
  getSafeImageSource,
} = window.BlueshellContent;

const state = {
  content: null,
  search: "",
  category: "all",
  deviceMode: "desktop",
  turtleFlipped: false,
  turtleImageSrc: "assets/images/turtle.png",
  turtleSpinDuration: 10,
};
const isLocalEnvironment = window.BlueshellContent.isLocalEnvironment;
const DEFAULT_TURTLE_IMAGE = "assets/images/turtle.png";
const TURTLE_VARIANTS_DIR = "/assets/images/turtle-variants/";
const STATIC_TURTLE_VARIANTS = [
  "assets/images/turtle-variants/turtle_100.png",
  "assets/images/turtle-variants/turtle_book.png",
  "assets/images/turtle-variants/turtle_cheese.png",
  "assets/images/turtle-variants/turtle_chicken.png",
  "assets/images/turtle-variants/turtle_cowboy.png",
  "assets/images/turtle-variants/turtle_explode.png",
  "assets/images/turtle-variants/turtle_fishing.png",
  "assets/images/turtle-variants/turtle_fortune.png",
  "assets/images/turtle-variants/turtle_frog.png",
  "assets/images/turtle-variants/turtle_glasses.png",
  "assets/images/turtle-variants/turtle_headphone.png",
  "assets/images/turtle-variants/turtle_infinity.png",
  "assets/images/turtle-variants/turtle_melon.png",
  "assets/images/turtle-variants/turtle_moon.png",
  "assets/images/turtle-variants/turtle_poop.png",
  "assets/images/turtle-variants/turtle_scholar.png",
  "assets/images/turtle-variants/turtle_scropion.png",
  "assets/images/turtle-variants/turtle_sprial.png",
  "assets/images/turtle-variants/turtle_volleyball.png",
];

const elements = {
  hero: document.getElementById("hero"),
  homepageSections: document.getElementById("homepage-sections"),
  categoryGrid: document.getElementById("category-grid"),
  featuredGrid: document.getElementById("featured-grid"),
  postGrid: document.getElementById("post-grid"),
  aboutStrip: document.getElementById("about-strip"),
  searchInput: document.getElementById("search-input"),
  categoryFilter: document.getElementById("category-filter"),
};

async function loadContent() {
  applyDeviceMode();
  window.BlueshellContent.initLocalDebugPanels();
  renderTopBanner();
  await initializeTurtleAppearance();
  const response = await fetch("data/content.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load content.");
  }

  state.content = await response.json();
  ensureHomePanels();
  hydrateFilters();
  renderPage();
}

function hydrateFilters() {
  if (!elements.categoryFilter) {
    return;
  }

  const { categories } = state.content;
  elements.categoryFilter.innerHTML = renderCategoryOptions();
  elements.categoryFilter.value = state.category;
}

function renderPage() {
  renderHero();
  renderHomepageSections();
  renderAbout();
  window.BlueshellContent.initLocalDebugPanels();
}

function applyDeviceMode() {
  const isMobile = window.matchMedia("(max-width: 960px)").matches;
  const nextMode = isMobile ? "mobile" : "desktop";
  const changed = state.deviceMode !== nextMode;
  state.deviceMode = nextMode;
  document.body.dataset.device = state.deviceMode;
  return changed;
}

async function initializeTurtleAppearance() {
  const useVariant = Math.random() < 0.2;
  // const isFastSpin = Math.random() < 0.2;
  const turtleVariants = await discoverTurtleVariants();
  state.turtleImageSrc =
    useVariant && turtleVariants.length ? pickRandom(turtleVariants) : DEFAULT_TURTLE_IMAGE;
  // state.turtleSpinDuration = isFastSpin ? randomBetween(0.9, 2.4) : randomBetween(8.5, 13.5);
  state.turtleSpinDuration = 10;
}

async function discoverTurtleVariants() {
  try {
    const response = await fetch("/api/image-assets", { cache: "no-store" });
    if (!response.ok) {
      return STATIC_TURTLE_VARIANTS;
    }

    const payload = await response.json();
    if (!payload.ok || !Array.isArray(payload.assets)) {
      return STATIC_TURTLE_VARIANTS;
    }

    const apiVariants = payload.assets
      .map((asset) => asset.path)
      .filter((path) => typeof path === "string" && path.startsWith(TURTLE_VARIANTS_DIR))
      .map((path) => path.slice(1));

    return apiVariants.length ? apiVariants : STATIC_TURTLE_VARIANTS;
  } catch {
    return STATIC_TURTLE_VARIANTS;
  }
}

function renderHero() {
  const { site } = state.content;
  document.title = site.title;
  const contactPageHref = "/contact/";
  const outlinePanel = (site.homepagePanels || []).find((entry) => entry.id === "outline");
  const featuredPanel = (site.homepagePanels || []).find((entry) => entry.id === "featured");
  const featuredPosts = getPublishedPosts()
    .filter((post) => post.featured)
    .sort(byNewestDate)
    .slice(0, 4);
  const turtleFlipClass = state.turtleFlipped ? " is-flipped" : "";
  const turtleSpinStyle = `style="--spin-duration: ${state.turtleSpinDuration.toFixed(2)}s;"`;
  const slideTurtle =
    state.deviceMode === "desktop"
      ? `
        <button class="hero-turtle-wrap turtle-button" type="button" aria-label="Flip turtle" data-debug-name="Hero turtle desktop">
          <span class="turtle-spin" ${turtleSpinStyle} aria-hidden="true">
            <img class="brand-turtle brand-turtle-desktop${turtleFlipClass}" src="${state.turtleImageSrc}" alt="" />
          </span>
        </button>
      `
      : `
        <div class="hero-slide-mobile-turtle" data-debug-name="Hero turtle mobile">
          <button class="turtle-button turtle-button-mobile" type="button" aria-label="Flip turtle">
            <span class="turtle-spin" ${turtleSpinStyle} aria-hidden="true">
              <img class="brand-turtle brand-turtle-mobile${turtleFlipClass}" src="${state.turtleImageSrc}" alt="" />
            </span>
          </button>
        </div>
      `;
  const hero = document.querySelector(".hero");
  hero.innerHTML = `
    <div class="hero-nav" data-debug-name="Hero nav">
      <div class="brand-mark">
        <span>${escapeHtml(site.brandMark || site.title)}</span>
      </div>
      <div class="hero-carousel-arrows" aria-label="Hero navigation" data-debug-name="Hero arrows">
        <button class="hero-arrow" type="button" aria-label="Previous panel" data-hero-direction="prev">&lt;</button>
        <button class="hero-arrow" type="button" aria-label="Next panel" data-hero-direction="next">&gt;</button>
      </div>
    </div>
    <div class="hero-carousel" data-debug-name="Hero carousel">
      <div class="hero-carousel-track" tabindex="0" aria-label="Homepage highlights" data-debug-name="Hero track">
        <section class="hero-slide hero-slide-intro" data-debug-name="Hero intro slide">
          ${slideTurtle}
          <div class="hero-copy" data-debug-name="Hero intro text">
            <p class="eyebrow">${escapeHtml(site.heroEyebrow || "Project journal")}</p>
            <h1>${escapeHtml(site.title)}</h1>
            <p>${escapeHtml(site.tagline)}</p>
            <p>${escapeHtml(site.intro)}</p>
            <div class="hero-actions hero-actions-intro" data-debug-name="Hero intro CTA">
              <button class="pill-link hero-next-button" type="button">Take a look!</button>
            </div>
          </div>
        </section>
        <section class="hero-slide hero-slide-panel" data-debug-name="Hero outline slide">
          <div class="hero-slide-head">
            <p class="eyebrow">${escapeHtml(outlinePanel?.eyebrow || "Outline")}</p>
            <h2>${escapeHtml(outlinePanel?.title || "Outline")}</h2>
          </div>
          <div class="category-grid hero-slide-category-grid">${renderCategories()}</div>
        </section>
        <section class="hero-slide hero-slide-panel" data-debug-name="Hero featured slide">
          <div class="hero-slide-head">
            <p class="eyebrow">${escapeHtml(featuredPanel?.eyebrow || "Featured")}</p>
            <h2>${escapeHtml(featuredPanel?.title || "Current highlights")}</h2>
          </div>
          <div class="featured-grid hero-slide-featured-grid">
            ${
              featuredPosts.length
                ? featuredPosts.map(renderPostCard).join("")
                : `<p class="empty-state">Mark a post as featured in the editor to pin it here.</p>`
            }
          </div>
        </section>
        <section class="hero-slide hero-slide-panel" data-debug-name="Hero about slide">
          <div class="hero-slide-head">
            <p class="eyebrow">${escapeHtml(site.aboutEyebrow || "About me")}</p>
            <h2>${escapeHtml(site.contactLabel || "About me")}</h2>
          </div>
          <div class="custom-panel-body">
            <p>${escapeHtml(site.about || "")}</p>
          </div>
          <div class="hero-actions">
            <a class="pill-link" href="/about/">Read more</a>
          </div>
        </section>
      </div>
      <div class="hero-carousel-dots" aria-label="Hero pages" data-debug-name="Hero dots">
        <button class="hero-dot is-active" type="button" aria-label="Go to page 1" data-slide-index="0"></button>
        <button class="hero-dot" type="button" aria-label="Go to page 2" data-slide-index="1"></button>
        <button class="hero-dot" type="button" aria-label="Go to page 3" data-slide-index="2"></button>
        <button class="hero-dot" type="button" aria-label="Go to page 4" data-slide-index="3"></button>
      </div>
      <p class="hero-carousel-page-indicator" aria-live="polite" data-debug-name="Hero page indicator">01 | 04</p>
    </div>
  `;
  bindTurtleFlip();
  bindHeroCarousel();
  window.BlueshellContent.initLocalDebugPanels();
}

function renderTopBanner() {
  const banner = document.querySelector(".top-banner");
  if (!banner) {
    return;
  }

  const existingLocalLink = banner.querySelector('[data-local-editor-link="true"]');
  if (isLocalEnvironment && !existingLocalLink) {
    banner.insertAdjacentHTML(
      "beforeend",
      '<a class="top-banner-link" data-local-editor-link="true" href="/editor/">Local editor</a>'
    );
  }
  if (!isLocalEnvironment && existingLocalLink) {
    existingLocalLink.remove();
  }
}

function bindTurtleFlip() {
  const turtleButton = document.querySelector(".turtle-button");
  if (!turtleButton) {
    return;
  }

  turtleButton.addEventListener("click", () => {
    state.turtleFlipped = !state.turtleFlipped;
    renderHero();
  });
}

function bindHeroCarousel() {
  const track = document.querySelector(".hero-carousel-track");
  const slides = [...document.querySelectorAll(".hero-slide")];
  const dots = [...document.querySelectorAll(".hero-dot")];
  const pageIndicator = document.querySelector(".hero-carousel-page-indicator");
  const nextButton = document.querySelector(".hero-next-button");
  const arrowButtons = [...document.querySelectorAll(".hero-arrow")];
  if (!track || !dots.length || !slides.length) {
    return;
  }

  const syncTrackHeight = () => {
    const slideWidth = track.clientWidth || 1;
    const nextIndex = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / slideWidth)));
    const activeSlide = slides[nextIndex];
    if (activeSlide) {
      track.style.height = `${activeSlide.offsetHeight}px`;
    }
  };

  const updateActiveDot = () => {
    const slideWidth = track.clientWidth || 1;
    const nextIndex = Math.round(track.scrollLeft / slideWidth);
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === nextIndex);
    });
    if (pageIndicator) {
      pageIndicator.textContent = `${String(nextIndex + 1).padStart(2, "0")} | ${String(dots.length).padStart(2, "0")}`;
    }
    syncTrackHeight();
  };

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const index = Number(dot.dataset.slideIndex || 0);
      track.scrollTo({
        left: track.clientWidth * index,
        behavior: "smooth",
      });
    });
  });

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      track.scrollTo({
        left: track.clientWidth,
        behavior: "smooth",
      });
    });
  }

  arrowButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.heroDirection === "prev" ? -1 : 1;
      const slideWidth = track.clientWidth || 1;
      const currentIndex = Math.round(track.scrollLeft / slideWidth);
      const nextIndex = Math.max(0, Math.min(dots.length - 1, currentIndex + direction));
      track.scrollTo({
        left: slideWidth * nextIndex,
        behavior: "smooth",
      });
    });
  });

  track.addEventListener("scroll", updateActiveDot, { passive: true });
  updateActiveDot();
}

function syncHeroCarouselHeight() {
  const track = document.querySelector(".hero-carousel-track");
  if (!track) {
    return;
  }

  const slides = [...track.querySelectorAll(":scope > .hero-slide")];
  if (!slides.length) {
    return;
  }

  const slideWidth = track.clientWidth || 1;
  const nextIndex = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / slideWidth)));
  const activeSlide = slides[nextIndex];
  if (activeSlide) {
    track.style.height = `${activeSlide.offsetHeight}px`;
  }
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function renderCategories() {
  return state.content.categories
    .map(
      (category) => `
        <a class="category-card" href="/category/?category=${encodeURIComponent(category.id)}">
          <p class="eyebrow">${escapeHtml(category.id)}</p>
          <h3>${escapeHtml(category.name)}</h3>
          <p>${escapeHtml(category.description)}</p>
        </a>
      `
    )
    .join("");
}

function renderFeaturedPosts() {
  const featuredPosts = getPublishedPosts()
    .filter((post) => post.featured)
    .sort(byNewestDate)
    .slice(0, 4);

  return featuredPosts.length
    ? featuredPosts.map(renderPostCard).join("")
    : `<p class="empty-state">Mark a post as featured in the editor to pin it here.</p>`;
}

function renderArchive() {
  const posts = getFilteredPosts();
  return posts.length
    ? posts.map(renderPostCard).join("")
    : `<p class="empty-state">No posts match the current search and filter.</p>`;
}

function renderHomepageSections() {
  const panels = (state.content.site.homepagePanels || []).filter((panel) => panel.enabled !== false);
  elements.homepageSections.innerHTML = panels
    .map((panel) => {
      if (panel.id === "outline" || panel.id === "featured") {
        return "";
      }

      if (panel.type === "category-overview") {
        return `
          <section class="section" aria-labelledby="category-heading" data-debug-name="${escapeAttribute(panel.title || "Category overview")}">
            ${renderSectionHeading(panel, "category-heading")}
            <div class="category-grid">${renderCategories()}</div>
          </section>
        `;
      }

      if (panel.type === "featured-posts") {
        return `
          <section class="section" aria-labelledby="featured-heading" data-debug-name="${escapeAttribute(panel.title || "Featured posts")}">
            ${renderSectionHeading(panel, "featured-heading")}
            <div class="featured-grid">${renderFeaturedPosts()}</div>
          </section>
        `;
      }

      if (panel.type === "archive-posts") {
        return `
          <section class="section archive-section" aria-labelledby="archive-heading" data-debug-name="${escapeAttribute(panel.title || "Archive")}">
            <div class="section-heading archive-heading">
              <div>
                <p class="eyebrow">${escapeHtml(panel.eyebrow || "Archive")}</p>
                <h2 id="archive-heading">${escapeHtml(panel.title || "Browse everything")}</h2>
                ${panel.description ? `<p class="section-copy">${escapeHtml(panel.description)}</p>` : ""}
              </div>
              <div class="archive-controls">
                <label class="search-field">
                  <span class="visually-hidden">Search posts</span>
                  <input id="search-input" type="search" placeholder="Search title, summary, tags" value="${escapeAttribute(state.search)}" />
                </label>
                <label class="filter-field">
                  <span class="visually-hidden">Filter by category</span>
                  <select id="category-filter">${renderCategoryOptions()}</select>
                </label>
              </div>
            </div>
            <div class="post-grid">${renderArchive()}</div>
          </section>
        `;
      }

      return `
        <section class="section custom-panel" aria-labelledby="${escapeAttribute(panel.id)}-heading" data-debug-name="${escapeAttribute(panel.title || panel.id || "Custom panel")}">
          ${renderSectionHeading(panel, `${escapeAttribute(panel.id)}-heading`)}
          <div class="custom-panel-body">${renderMarkdown(panel.body || "")}</div>
        </section>
      `;
    })
    .join("");

  elements.searchInput = document.getElementById("search-input");
  elements.categoryFilter = document.getElementById("category-filter");
  hydrateFilters();
  bindArchiveControls();
  window.BlueshellContent.initLocalDebugPanels();
}

function renderSectionHeading(panel, headingId) {
  return `
    <div class="section-heading">
      <div>
        <p class="eyebrow">${escapeHtml(panel.eyebrow || "")}</p>
        <h2 id="${escapeAttribute(headingId)}">${escapeHtml(panel.title || "")}</h2>
        ${panel.description ? `<p class="section-copy">${escapeHtml(panel.description)}</p>` : ""}
      </div>
    </div>
  `;
}

function renderPostCard(post) {
  const categoryName = getCategoryName(post.category);
  const coverImage = getSafeImageSource(post.coverImage);
  return `
    <a class="post-card" href="/post/?post=${encodeURIComponent(post.id)}">
      ${
        coverImage
          ? `<img class="post-card-cover" src="${escapeAttribute(coverImage)}" alt="${escapeAttribute(post.title || "Post cover image")}" />`
          : ""
      }
      <span class="post-chip">${escapeHtml(categoryName)}</span>
      <h3>${escapeHtml(post.title)}</h3>
      <p>${escapeHtml(post.summary)}</p>
      <div class="post-meta">
        <span class="tag">${formatDate(post.date)}</span>
        ${post.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    </a>
  `;
}

function renderAbout() {
  const { site } = state.content;
  elements.aboutStrip.dataset.debugName = "About strip";
  elements.aboutStrip.innerHTML = `
    <div class="about-copy">
      <p class="eyebrow">${escapeHtml(site.aboutEyebrow || "About this archive")}</p>
      <p>${escapeHtml(site.about)}</p>
    </div>
    <div class="hero-actions">
      <a class="pill-link" href="/about/">${escapeHtml(site.contactLabel)}</a>
      ${
        site.feedbackHref
          ? `<a class="ghost-link" href="${escapeAttribute(site.feedbackHref)}" target="_blank" rel="noreferrer">Leave feedback</a>`
          : ""
      }
    </div>
  `;
  window.BlueshellContent.initLocalDebugPanels();
}

function getFilteredPosts() {
  const query = state.search.trim().toLowerCase();
  return getPublishedPosts()
    .filter((post) => state.category === "all" || post.category === state.category)
    .filter((post) => {
      if (!query) {
        return true;
      }

      const haystack = [post.title, post.summary, ...(post.tags || []), post.body].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort(byNewestDate);
}

function getPublishedPosts() {
  return [...state.content.posts].filter((post) => post.published !== false);
}

function renderCategoryOptions() {
  return [
    `<option value="all">All categories</option>`,
    ...state.content.categories.map(
      (category) => `<option value="${escapeAttribute(category.id)}">${escapeHtml(category.name)}</option>`
    ),
  ].join("");
}

function ensureHomePanels() {
  ensureContentHomePanels(state.content, DEFAULT_HOME_PANELS);
}

function bindArchiveControls() {
  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", (event) => {
      state.search = event.target.value;
      renderHomepageSections();
    });
  }

  if (elements.categoryFilter) {
    elements.categoryFilter.addEventListener("change", (event) => {
      state.category = event.target.value;
      renderHomepageSections();
    });
  }
}

function getCategoryName(categoryId) {
  return state.content.categories.find((category) => category.id === categoryId)?.name ?? categoryId;
}

function renderPostBody(post) {
  if (post.bodyFormat === "html") {
    return sanitizeRichHtml(post.body || "");
  }
  return renderMarkdown(post.body || "");
}

loadContent().catch((error) => {
  document.body.innerHTML = `<main class="page-shell"><section class="section"><p class="empty-state">${escapeHtml(
    error.message
  )}</p></section></main>`;
});

window.addEventListener("resize", () => {
  const changed = applyDeviceMode();
  if (changed && state.content) {
    renderHero();
    return;
  }
  syncHeroCarouselHeight();
});
