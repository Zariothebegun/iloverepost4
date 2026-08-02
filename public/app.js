const state = {
  plan: "free",
  preferredPlan: window.localStorage.getItem("ilr_plan") || "free",
  nextCursor: "0",
  resultIds: new Set(),
  activeSearchKey: "",
  plans: {}
};

const DEFAULT_VIDEOS_PER_CLICK = 60;
const DEFAULT_REQUEST_COUNT = 20;

const dom = {
  dismissBanner: document.getElementById("dismiss-banner"),
  topBanner: document.getElementById("top-banner"),
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
  planPill: document.getElementById("plan-pill"),
  accountSummary: document.getElementById("account-summary"),
  quickPlanToggle: document.getElementById("quick-plan-toggle"),
  proPlanButton: document.getElementById("pro-plan-button"),
  freePlanButton: document.getElementById("free-plan-button")
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
  const headers = new Headers(options.headers || {});
  headers.set("x-ilr-plan", state.preferredPlan || state.plan || "free");

  return fetch(url, {
    ...options,
    headers
  });
}

function getReadableError(error, fallbackMessage) {
  if (error?.message === "Failed to fetch") {
    return "The local server is offline. Start the backend on localhost:3000 and try again.";
  }

  return error?.message || fallbackMessage;
}

function getPlanDetails(planId) {
  return state.plans?.[planId] || {};
}

function getVideosPerClick(planId, { isLoadMore = false } = {}) {
  const plan = getPlanDetails(planId);
  const pageSize = Number(plan.pageSize) || DEFAULT_REQUEST_COUNT;
  const pages = Number(isLoadMore ? plan.loadMorePageRequests : plan.initialPageRequests) || 3;
  const computed = pageSize * pages;
  return Number.isFinite(computed) && computed > 0 ? computed : DEFAULT_VIDEOS_PER_CLICK;
}

function getRequestCount(planId) {
  const plan = getPlanDetails(planId);
  return Number(plan.pageSize) || DEFAULT_REQUEST_COUNT;
}

function updateAccountUi(account) {
  state.plan = account.plan || "free";
  state.preferredPlan = state.plan;
  window.localStorage.setItem("ilr_plan", state.preferredPlan);
  dom.planPill.textContent = state.plan.toUpperCase();
  dom.topBanner.hidden = state.plan === "pro";
  dom.quickPlanToggle.textContent = state.plan === "pro" ? "Switch to Free" : "Switch to Pro";
  const videosPerClick = getVideosPerClick(state.plan);

  if (state.plan === "pro") {
    dom.accountSummary.textContent = `Reposts only | ${videosPerClick} videos per click | Unlimited searches`;
    dom.freePlanButton.disabled = false;
    dom.freePlanButton.textContent = "Switch to Free";
    dom.proPlanButton.textContent = "Current Plan";
    dom.proPlanButton.disabled = true;
  } else {
    const remaining = account.searchesRemaining ?? 0;
    dom.accountSummary.textContent = `Reposts only | ${videosPerClick} videos per click | ${remaining} free searches left today`;
    dom.freePlanButton.disabled = true;
    dom.freePlanButton.textContent = "Current Plan";
    dom.proPlanButton.textContent = "Upgrade to Pro";
    dom.proPlanButton.disabled = false;
  }

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
  downloadButton.textContent = state.plan === "pro" ? "Download Video" : "Download (Pro)";
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

async function fetchPlans() {
  const response = await apiFetch("/api/plans");
  const payload = await response.json();

  state.plans = payload.plans || {};

  if ((payload.account?.plan || "free") !== state.preferredPlan) {
    await setPlan(state.preferredPlan, { silent: true });
    return;
  }

  updateAccountUi(payload.account);
}

async function setPlan(plan, { silent = false } = {}) {
  state.preferredPlan = plan;
  window.localStorage.setItem("ilr_plan", plan);
  const response = await apiFetch(`/api/account/plan?plan=${encodeURIComponent(plan)}`, {
    method: "POST"
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Could not change plan.");
  }

  updateAccountUi(payload.account);

  if (!silent) {
    setStatus(payload.note, "success");
  }
}

async function ensurePlanSynced() {
  if (state.plan === state.preferredPlan) {
    return;
  }

  await setPlan(state.preferredPlan, { silent: true });
}

async function performSearch({ append = false } = {}) {
  const username = dom.username.value.trim().replace(/^@+/, "");
  const keyword = dom.keyword.value.trim();
  const searchKey = getSearchKey(username, keyword);
  const shouldAppend = append && state.activeSearchKey === searchKey;
  const cursor = shouldAppend ? state.nextCursor : "0";
  const effectivePlan = state.preferredPlan || state.plan || "free";
  const count = getRequestCount(effectivePlan);

  if (!username) {
    setStatus("Please enter a TikTok username.", "error");
    return;
  }

  dom.searchButton.disabled = true;
  dom.loadMore.disabled = true;
  dom.resultsTitle.textContent = "Reposted videos";
  const videosPerClick = getVideosPerClick(effectivePlan, { isLoadMore: shouldAppend });
  setStatus(`Searching reposts for @${username} (${videosPerClick} videos per click)...`);

  const requestUrl =
    `/api/reposts?username=${encodeURIComponent(username)}` +
    `&keyword=${encodeURIComponent(keyword)}` +
    `&cursor=${encodeURIComponent(cursor)}` +
    `&count=${encodeURIComponent(count)}`;

  try {
    await ensurePlanSynced();
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

dom.dismissBanner.addEventListener("click", () => {
  dom.topBanner.hidden = true;
});

dom.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await performSearch({ append: false });
});

dom.loadMore.addEventListener("click", async () => {
  await performSearch({ append: true });
});

dom.quickPlanToggle.addEventListener("click", async () => {
  const nextPlan = state.plan === "pro" ? "free" : "pro";

  try {
    await setPlan(nextPlan);
  } catch (error) {
    setStatus(getReadableError(error, `Could not switch to ${nextPlan}.`), "error");
  }
});

dom.proPlanButton.addEventListener("click", async () => {
  try {
    await setPlan("pro");
  } catch (error) {
    setStatus(getReadableError(error, "Could not switch to Pro."), "error");
  }
});

dom.freePlanButton.addEventListener("click", async () => {
  if (!dom.freePlanButton.disabled) {
    try {
      await setPlan("free");
    } catch (error) {
      setStatus(getReadableError(error, "Could not switch to Free."), "error");
    }
  }
});

document.getElementById("login-button").addEventListener("click", async () => {
  setStatus("Authentication will be connected to Supabase later. Demo mode is active.", "success");
});

document.getElementById("signup-button").addEventListener("click", async () => {
  try {
    await setPlan("pro");
  } catch (error) {
    setStatus(getReadableError(error, "Could not switch to Pro."), "error");
  }
});

fetchPlans().catch((error) => {
  setStatus(getReadableError(error, "Could not load plan data."), "error");
});
