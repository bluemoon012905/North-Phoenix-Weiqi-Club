const { escapeHtml, formatDate, renderPostBody, escapeAttribute, getSafeImageSource } = window.BlueshellContent;
const speechState = {
  supported: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  active: false,
  utterance: null,
  selectedVoiceURI: "",
  voices: [],
};

loadPost().catch((error) => {
  document.getElementById("post-hero").innerHTML = `
    <div class="hero-copy">
      <p class="eyebrow">Post</p>
      <h1>Not available</h1>
      <p>${escapeHtml(error.message)}</p>
      <div class="hero-actions">
        <a class="ghost-link" href="/">Back home</a>
      </div>
    </div>
  `;
  document.getElementById("post-shell").innerHTML = '<p class="empty-state">That post could not be loaded.</p>';
});

async function loadPost() {
  const params = new URLSearchParams(window.location.search);
  const postId = params.get("post");
  if (!postId) {
    throw new Error("No post was provided.");
  }

  const response = await fetch("../data/content.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load content.");
  }

  const content = await response.json();
  const publishedPosts = (content.posts || []).filter((post) => post.published !== false);
  const post = publishedPosts.find((entry) => entry.id === postId);
  if (!post) {
    throw new Error("That post does not exist.");
  }

  const category = (content.categories || []).find((entry) => entry.id === post.category);
  const categoryName = category?.name || post.category;
  const coverImage = getSafeImageSource(post.coverImage);
  const heroClassNames = ["hero"];
  if (coverImage) {
    heroClassNames.push("hero-with-decoration");
  }

  document.title = `${post.title} | ${content.site?.title || "Blue's collection"}`;
  const heroElement = document.getElementById("post-hero");
  heroElement.className = heroClassNames.join(" ");
  heroElement.innerHTML = `
    <div class="hero-nav">
      <div class="brand-mark">
        <span>${escapeHtml(content.site?.brandMark || content.site?.title || "Blue's collection")}</span>
      </div>
      <div class="hero-actions">
        <a class="ghost-link" href="/category/?category=${encodeURIComponent(post.category)}">Back to ${escapeHtml(categoryName)}</a>
        <a class="ghost-link" href="/">Back home</a>
      </div>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">${escapeHtml(categoryName)}</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p>${escapeHtml(post.summary)}</p>
    </div>
    ${
      coverImage
        ? `<div class="post-hero-cover">
            <img class="post-hero-cover-image" src="${escapeAttribute(coverImage)}" alt="${escapeAttribute(post.title || "Post cover image")}" />
          </div>`
        : ""
    }
  `;

  document.getElementById("post-shell").innerHTML = `
    <div class="post-meta">
      <span class="tag">${formatDate(post.date)}</span>
      ${(post.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
    </div>
    <div class="post-audio-controls">
      <div class="post-audio-main">
        <button class="ghost-link post-audio-button" type="button" ${speechState.supported ? "" : "disabled"}>
          ${speechState.supported ? "Read aloud" : "Read aloud unavailable"}
        </button>
        <label class="post-voice-picker">
          <span class="visually-hidden">Select voice</span>
          <select class="post-voice-select" ${speechState.supported ? "" : "disabled"}>
            <option value="">Default voice</option>
          </select>
        </label>
      </div>
    </div>
    <div class="post-body">${renderPostBody(post)}</div>
  `;

  bindReadAloud(post);
}

function bindReadAloud(post) {
  const button = document.querySelector(".post-audio-button");
  const voiceSelect = document.querySelector(".post-voice-select");
  const postBody = document.querySelector(".post-body");
  if (!button || !voiceSelect || !postBody || !speechState.supported) {
    return;
  }

  const speechText = buildSpeechText(post, postBody);
  if (!speechText.trim()) {
    button.disabled = true;
    button.textContent = "Nothing to read";
    return;
  }

  hydrateVoiceList(voiceSelect);
  voiceSelect.addEventListener("change", (event) => {
    speechState.selectedVoiceURI = event.target.value;
  });
  button.addEventListener("click", () => {
    if (speechState.active) {
      stopReading(button);
      return;
    }

    speakText({
      text: speechText,
      triggerButton: button,
    });
  });

  window.speechSynthesis.cancel();
  speechState.active = false;
  speechState.utterance = null;
  updateAudioButton(button);

  window.addEventListener(
    "beforeunload",
    () => {
      window.speechSynthesis.cancel();
    },
    { once: true }
  );
}

function hydrateVoiceList(select) {
  const populateVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    speechState.voices = voices;
    const selectedValue = speechState.selectedVoiceURI;
    const voiceOptions = voices
      .map((voice) => {
        const label = `${voice.name} (${voice.lang})${voice.default ? " - default" : ""}`;
        return `<option value="${escapeAttribute(voice.voiceURI)}">${escapeHtml(label)}</option>`;
      })
      .join("");

    select.innerHTML = `<option value="">Default voice</option>${voiceOptions}`;
    if (selectedValue && voices.some((voice) => voice.voiceURI === selectedValue)) {
      select.value = selectedValue;
      speechState.selectedVoiceURI = selectedValue;
      return;
    }

    const defaultVoice = voices.find((voice) => voice.default) || voices[0];
    if (defaultVoice) {
      select.value = defaultVoice.voiceURI;
      speechState.selectedVoiceURI = defaultVoice.voiceURI;
    }
  };

  populateVoices();
  window.speechSynthesis.addEventListener("voiceschanged", populateVoices, { once: true });
}

function buildSpeechText(post, postBody) {
  const bodyText = postBody.textContent.replace(/\s+/g, " ").trim();
  return [post.title, post.summary, bodyText].filter(Boolean).join(". ");
}

function speakText({ text, triggerButton }) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;

  const selectedVoice = getSelectedVoice();
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }

  utterance.onend = () => {
    speechState.active = false;
    speechState.utterance = null;
    updateAudioButton(document.querySelector(".post-audio-button"));
  };
  utterance.onerror = () => {
    speechState.active = false;
    speechState.utterance = null;
    updateAudioButton(document.querySelector(".post-audio-button"));
  };

  window.speechSynthesis.cancel();
  speechState.utterance = utterance;
  speechState.active = true;
  updateAudioButton(triggerButton);
  window.speechSynthesis.speak(utterance);
}

function stopReading(button) {
  window.speechSynthesis.cancel();
  speechState.active = false;
  speechState.utterance = null;
  updateAudioButton(button);
}

function updateAudioButton(primaryButton) {
  const readButton = document.querySelector(".post-audio-button");
  if (readButton) {
    readButton.textContent = speechState.active && primaryButton === readButton ? "Stop reading" : "Read aloud";
    readButton.disabled = !speechState.supported;
  }
}

function getSelectedVoice() {
  return speechState.voices.find((voice) => voice.voiceURI === speechState.selectedVoiceURI) || null;
}
