const state = {
  activeTab: "reposts",
  nextCursor: "0",
  resultIds: new Set(),
  activeSearchKey: ""
};

const DEFAULT_VIDEOS_PER_CLICK = 120;
const DEFAULT_REQUEST_COUNT = 20;

const dom = {
  form: document.getElementById("search-form"),
  username: document.getElementById("username"),
  searchButton: document.getElementById("search-button"),
  statusCard: document.getElementById("status-card"),
  profileCard: document.getElementById("profile-card"),
  profileAvatar: document.getElementById("profile-avatar"),
  profileName: document.getElementById("profile-name"),
  profileMeta: document.getElementById("profile-meta"),
  resultsGrid: document.getElementById("results-grid"),
  loadMore: document.getElementById("load-more"),
  resultsTitle: document.getElementById("results-title"),
  resultTemplate: document.getElementById("result-card-template"),
  storyTemplate: document.getElementById("story-card-template"),
  tabsBar: document.getElementById("tabs-bar")
};

/* ─── Helpers ─── */

function formatCount(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(number);
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function setStatus(message, tone = "") {
  dom.statusCard.textContent = message;
  dom.statusCard.className = `status-card${tone ? ` ${tone}` : ""}`;
}

async function apiFetch(url, options = {}) {
  return fetch(url, options);
}

function getReadableError(error, fallbackMessage) {
  if (error?.message === "Failed to fetch") {
    return "The server is offline. Start the backend and try again.";
  }
  return error?.message || fallbackMessage;
}

function getSearchKey(username) {
  return `${state.activeTab}::${username.toLowerCase()}`;
}

/* ─── Tabs ─── */

dom.tabsBar.addEventListener("click", (event) => {
  const button = event.target.closest(".tab-button");
  if (!button) return;

  const tab = button.dataset.tab;
  if (tab === state.activeTab) return;

  state.activeTab = tab;

  for (const btn of dom.tabsBar.querySelectorAll(".tab-button")) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }

  // Reset results
  dom.resultsGrid.innerHTML = "";
  state.resultIds.clear();
  state.activeSearchKey = "";
  dom.profileCard.hidden = true;
  dom.loadMore.hidden = true;
  dom.resultsTitle.textContent = tab === "stories" ? "TikTok stories" : "TikTok videos";
  setStatus(tab === "stories"
    ? "Enter a TikTok username to search stories."
    : "Enter a TikTok username to search reposts."
  );
});

/* ─── Download ─── */

async function handleDownload(item) {
  const response = await apiFetch(
    `/api/download?url=${encodeURIComponent(item.videoUrl)}&playUrl=${encodeURIComponent(item.playUrl || "")}`
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Download failed.");
  }

  const anchor = document.createElement("a");
  anchor.href = payload.downloadUrl;
  anchor.download = payload.filename || "tiktok-video.mp4";
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

/* ─── Rendering ─── */

function renderProfile(profile) {
  dom.profileAvatar.src = profile.avatar || "https://via.placeholder.com/112x112.png?text=TT";
  dom.profileAvatar.alt = `${profile.username} avatar`;
  dom.profileName.textContent = `@${profile.username}${profile.verified ? " — verified" : ""}`;
  dom.profileMeta.textContent = `${formatCount(profile.followerCount)} followers · ${formatCount(profile.videoCount)} videos`;
  dom.profileCard.hidden = false;
}

function createCard(item, isStory) {
  const template = isStory ? dom.storyTemplate : dom.resultTemplate;
  const node = template.content.firstElementChild.cloneNode(true);
  const image = node.querySelector(".thumb");
  const caption = node.querySelector(".result-caption");
  const author = node.querySelector(".result-author");
  const likes = node.querySelector(".meta-likes");
  const link = node.querySelector(".open-video");
  const downloadButton = node.querySelector(".download-video");
  const durationEl = node.querySelector(".duration-text");

  image.src = item.thumbnail || "https://via.placeholder.com/720x720.png?text=No+Thumbnail";
  image.alt = item.caption || `TikTok video ${item.videoId}`;
  caption.textContent = item.caption || "No caption available.";
  author.textContent = `@${item.author || "unknown"}`;
  likes.textContent = `${formatCount(item.likes)} likes`;
  link.href = item.videoUrl;

  const duration = formatDuration(item.duration);
  if (duration && durationEl) {
    durationEl.textContent = duration;
  } else if (durationEl) {
    durationEl.hidden = true;
  }

  downloadButton.addEventListener("click", async () => {
    const original = downloadButton.textContent;
    downloadButton.textContent = "Downloading…";
    downloadButton.disabled = true;
    try {
      await handleDownload(item);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      downloadButton.textContent = original;
      downloadButton.disabled = false;
    }
  });

  return node;
}

function renderItems(items, { append = false, isStory = false } = {}) {
  if (!append) {
    dom.resultsGrid.innerHTML = "";
    state.resultIds.clear();
  }

  if (!items.length && !append) {
    setStatus(isStory ? "No stories found for this user." : "No matching videos found.", "error");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    if (state.resultIds.has(item.videoId)) continue;
    state.resultIds.add(item.videoId);
    fragment.appendChild(createCard(item, isStory));
  }

  dom.resultsGrid.appendChild(fragment);
}

function logSearchDebug(payload) {
  const fetchedCount = payload?.debug?.fetchedVideoCount ?? payload?.items?.length ?? 0;
  const nextCursor = payload?.pagination?.cursor ?? "0";
  console.log(
    `[ILOVEREPOST] Fetched ${fetchedCount} items (cursor ${nextCursor})`,
    {
      pagesFetched: payload?.debug?.pagesFetched ?? 1,
      hasMore: payload?.pagination?.hasMore ?? false,
      tab: state.activeTab
    }
  );
}

/* ─── Search ─── */

async function performSearch({ append = false } = {}) {
  const username = dom.username.value.trim().replace(/^@+/, "");
  const searchKey = getSearchKey(username);
  const shouldAppend = append && state.activeSearchKey === searchKey;
  const cursor = shouldAppend ? state.nextCursor : "0";
  const isStory = state.activeTab === "stories";

  if (!username) {
    setStatus("Please enter a TikTok username.", "error");
    return;
  }

  dom.searchButton.disabled = true;
  dom.loadMore.disabled = true;
  dom.resultsTitle.textContent = isStory ? "TikTok stories" : "TikTok videos";

  const endpoint = isStory ? "stories" : "reposts";
  setStatus(`Searching ${endpoint} for @${username}…`);

  const requestUrl =
    `/api/${endpoint}?username=${encodeURIComponent(username)}` +
    `&cursor=${encodeURIComponent(cursor)}` +
    `&count=${encodeURIComponent(DEFAULT_REQUEST_COUNT)}`;

  try {
    const response = await apiFetch(requestUrl);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }

    state.activeSearchKey = searchKey;
    state.nextCursor = payload.pagination.cursor;
    logSearchDebug(payload);
    renderProfile(payload.user);
    renderItems(payload.items, { append: shouldAppend, isStory });

    const loadedCount = payload.items.length;
    setStatus(
      `Loaded ${loadedCount} ${isStory ? "stories" : "reposts"} for @${payload.user.username}.`,
      "success"
    );

    dom.loadMore.hidden = !payload.pagination.hasMore;
    dom.loadMore.disabled = false;
  } catch (error) {
    setStatus(getReadableError(error, "Search failed."), "error");
  } finally {
    dom.searchButton.disabled = false;
  }
}

/* ─── Events ─── */

dom.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await performSearch({ append: false });
});

dom.loadMore.addEventListener("click", async () => {
  await performSearch({ append: true });
});
