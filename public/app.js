const state = {
  plan: "standard",
  nextCursor: "0",
  resultIds: new Set(),
  activeSearchKey: ""
};

const DEFAULT_VIDEOS_PER_CLICK = 60;
const DEFAULT_REQUEST_COUNT = 20;

const dom = {
  form: document.getElementById("search-form"),
  username: document.getElementById("username"),
  keyword: document.getElementById("keyword"),
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
  accountSummary: document.getElementById("account-summary")
};

function formatCount(value) {
  const number = Number(value || 0);

  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(number);
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
    return "The local server is offline. Start the backend on localhost:3000 and try again.";
  }

  return error?.message || fallbackMessage;
}

function getVideosPerClick({ isLoadMore = false } = {}) {
  const pageSize = DEFAULT_REQUEST_COUNT;
  const pages = isLoadMore ? 6 : 6;
  const computed = pageSize * pages;
  return Number.isFinite(computed) && computed > 0 ? computed : DEFAULT_VIDEOS_PER_CLICK;
}

function getRequestCount() {
  return DEFAULT_REQUEST_COUNT;
}

function updateAccountUi() {
  syncDownloadButtons();
}

function renderProfile(profile) {
  dom.profileAvatar.src =
    profile.avatar || "https://via.placeholder.com/112x112.png?text=TT";
  dom.profileAvatar.alt = `${profile.username} avatar`;
  dom.profileName.textContent = `@${profile.username}${profile.verified ? " - verified" : ""}`;
  dom.profileMeta.textContent = `${formatCount(profile.followerCount)} followers - ${formatCount(
    profile.videoCount
  )} videos`;
  dom.profileCard.hidden = false;
}

function getSearchKey(username, keyword) {
  return `${username.toLowerCase()}::${keyword.toLowerCase()}`;
}

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
  anchor.download = payload.filename || "repost-video.mp4";
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

function syncDownloadButtons() {
  const buttons = document.querySelectorAll(".download-video");

  for (const button of buttons) {
    button.textContent = "Download Video";
    button.setAttribute("aria-label", "Download Video");
  }
}

function createResultCard(item) {
  const node = dom.resultTemplate.content.firstElementChild.cloneNode(true);
  const image = node.querySelector(".thumb");
  const caption = node.querySelector(".result-caption");
  const author = node.querySelector(".result-author");
  const likes = node.querySelector(".meta-likes");
  const link = node.querySelector(".open-video");
  const downloadButton = node.querySelector(".download-video");

  image.src = item.thumbnail || "https://via.placeholder.com/720x720.png?text=No+Thumbnail";
  image.alt = item.caption || `TikTok video ${item.videoId}`;
  caption.textContent = item.caption || "No caption available for this video.";
  author.textContent = `@${item.author || "unknown"}`;
  likes.textContent = `${formatCount(item.likes)} likes`;
  link.href = item.videoUrl;
  downloadButton.textContent = "Download Video";
  downloadButton.addEventListener("click", async () => {
    try {
      await handleDownload(item);
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  return node;
}

function renderItems(items, { append = false } = {}) {
  if (!append) {
    dom.resultsGrid.innerHTML = "";
    state.resultIds.clear();
  }

  if (!items.length && !append) {
    setStatus("No matching videos were found for this search.", "error");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    if (state.resultIds.has(item.videoId)) {
      continue;
    }

    state.resultIds.add(item.videoId);
    fragment.appendChild(createResultCard(item));
  }

  dom.resultsGrid.appendChild(fragment);
}

function logSearchDebug(payload) {
  const fetchedCount = payload?.debug?.fetchedVideoCount ?? payload?.items?.length ?? 0;
  const rawFetchedCount = payload?.debug?.rawFetchedVideoCount ?? fetchedCount;
  const nextCursor = payload?.pagination?.cursor ?? "0";
  const pagesFetched = payload?.debug?.pagesFetched ?? 1;

  console.log(
    `[ILOVEREPOST] Fetched ${fetchedCount} videos from TikTok (cursor ${nextCursor})`,
    {
      pagesFetched,
      rawFetchedCount,
      filteredOutCount: payload?.debug?.filteredOutCount ?? 0,
      hasMore: payload?.pagination?.hasMore ?? false,
      username: payload?.user?.username ?? ""
    }
  );
}



async function performSearch({ append = false } = {}) {
  const username = dom.username.value.trim().replace(/^@+/, "");
  const keyword = dom.keyword.value.trim();
  const searchKey = getSearchKey(username, keyword);
  const shouldAppend = append && state.activeSearchKey === searchKey;
  const cursor = shouldAppend ? state.nextCursor : "0";
  const count = getRequestCount();

  if (!username) {
    setStatus("Please enter a TikTok username.", "error");
    return;
  }

  dom.searchButton.disabled = true;
  dom.loadMore.disabled = true;
  dom.resultsTitle.textContent = "Reposted videos";
  const videosPerClick = getVideosPerClick({ isLoadMore: shouldAppend });
  setStatus(`Searching reposts for @${username} (${videosPerClick} videos per click)...`);

  const requestUrl =
    `/api/reposts?username=${encodeURIComponent(username)}` +
    `&keyword=${encodeURIComponent(keyword)}` +
    `&cursor=${encodeURIComponent(cursor)}` +
    `&count=${encodeURIComponent(count)}`;

  try {
    const response = await apiFetch(requestUrl);
    const payload = await response.json();

    if (payload.account) {
      updateAccountUi(payload.account);
    }

    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }

    state.activeSearchKey = searchKey;
    state.nextCursor = payload.pagination.cursor;
    logSearchDebug(payload);
    renderProfile(payload.user);
    renderItems(payload.items, { append: shouldAppend });

    const keywordMessage = keyword ? ` matching "${keyword}"` : "";
    setStatus(
      `Loaded ${payload.items.length} reposts${keywordMessage} for @${payload.user.username}.`,
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

dom.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await performSearch({ append: false });
});

dom.loadMore.addEventListener("click", async () => {
  await performSearch({ append: true });
});
