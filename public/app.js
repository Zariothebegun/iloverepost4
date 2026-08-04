/* ─── ILOVEREPOST · Frontend ─── */

const state = {
  tab: "reposts",
  cursor: "0",
  ids: new Set(),
  searchKey: "",
  loading: false
};

const $ = (sel) => document.getElementById(sel);

const dom = {
  username: $("username"),
  keyword: $("keyword"),
  keywordWrap: $("keyword-wrap"),
  searchBtn: $("search-btn"),
  status: $("status"),
  profileCard: $("profile-card"),
  profileAvatar: $("profile-avatar"),
  profileName: $("profile-name"),
  profileMeta: $("profile-meta"),
  grid: $("results-grid"),
  skeleton: $("skeleton"),
  empty: $("empty-state"),
  loadMore: $("load-more"),
  tabs: document.querySelectorAll(".tab-btn")
};

/* ─── Helpers ─── */

function fmt(n) {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function fmtDuration(s) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

function setStatus(msg, tone = "idle") {
  dom.status.className = `status-toast ${tone}`;
  const icons = {
    idle: '<circle cx="8" cy="8" r="6"/><path d="M8 5.5v3M8 10.5v.01"/>',
    loading: '<circle cx="8" cy="8" r="6" stroke-dasharray="24" stroke-dashoffset="6"><animateTransform attributeName="transform" type="rotate" values="0 8 8;360 8 8" dur="0.8s" repeatCount="indefinite"/></circle>',
    success: '<circle cx="8" cy="8" r="6"/><path d="M5.5 8l2 2 3-3.5"/>',
    error: '<circle cx="8" cy="8" r="6"/><path d="M6 6l4 4M10 6l-4 4"/>'
  };
  dom.status.querySelector(".status-icon").innerHTML = icons[tone] || icons.idle;
  dom.status.querySelector("span:last-child").textContent = msg;
}

function showSkeletons(count = 6) {
  dom.skeleton.hidden = false;
  dom.skeleton.innerHTML = "";
  for (let i = 0; i < count; i++) {
    dom.skeleton.innerHTML += `
      <div class="skeleton-card">
        <div class="skeleton-thumb"></div>
        <div class="skeleton-body">
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>`;
  }
}

function hideSkeletons() {
  dom.skeleton.hidden = true;
  dom.skeleton.innerHTML = "";
}

/* ─── Tabs ─── */

function switchTab(tab) {
  state.tab = tab;
  dom.tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  dom.keywordWrap.style.display = tab === "reposts" ? "" : "none";
  dom.grid.innerHTML = "";
  state.ids.clear();
  state.searchKey = "";
  dom.profileCard.hidden = true;
  dom.loadMore.hidden = true;
  dom.empty.hidden = true;
  setStatus(tab === "stories" ? "Enter a username to view stories." : "Enter a username to get started.");
}

dom.tabs.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

/* ─── Download ─── */

async function downloadVideo(item) {
  const res = await fetch(`/api/download?url=${encodeURIComponent(item.videoUrl)}&playUrl=${encodeURIComponent(item.playUrl || "")}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Download failed");
  const a = document.createElement("a");
  a.href = data.downloadUrl;
  a.download = data.filename || "video.mp4";
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
}

/* ─── Card Builder ─── */

function buildCard(item) {
  const card = document.createElement("article");
  card.className = "video-card";
  const dur = fmtDuration(item.duration);
  const isStory = item.isStory;
  card.innerHTML = `
    <div class="video-thumb">
      <img src="${item.thumbnail || "https://via.placeholder.com/360x480?text=."}" alt="" loading="lazy" />
      ${isStory ? '<span class="thumb-badge">Story</span>' : ""}
      ${dur ? `<span class="thumb-duration">${dur}</span>` : ""}
    </div>
    <div class="video-body">
      <p class="video-caption">${item.caption || "No caption"}</p>
      <p class="video-author">@${item.author || "unknown"}</p>
      <div class="video-footer">
        <span class="video-stats">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3.5C5.5 1 2 3 2 6c0 4.5 6 7.5 6 7.5s6-3 6-7.5c0-3-3.5-5-6-2.5Z"/></svg>
          ${fmt(item.likes)}
        </span>
        <div class="video-actions">
          <button class="icon-btn dl-btn" title="Download">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2.5v8M4.5 8L8 11.5 11.5 8M3 13.5h10"/></svg>
          </button>
          <a class="icon-btn" href="${item.videoUrl}" target="_blank" rel="noopener" title="View on TikTok">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10M9 2h5v5M14 2L7.5 8.5"/></svg>
          </a>
        </div>
      </div>
    </div>`;
  card.querySelector(".dl-btn").addEventListener("click", async () => {
    const btn = card.querySelector(".dl-btn");
    btn.style.opacity = "0.4";
    btn.style.pointerEvents = "none";
    try { await downloadVideo(item); }
    catch (e) { setStatus(e.message, "error"); }
    finally { btn.style.opacity = ""; btn.style.pointerEvents = ""; }
  });
  return card;
}

/* ─── Render ─── */

function renderProfile(user) {
  dom.profileAvatar.src = user.avatar || "https://via.placeholder.com/96?text=TT";
  dom.profileAvatar.alt = user.username;
  dom.profileName.textContent = `@${user.username}${user.verified ? " ✓" : ""}`;
  dom.profileMeta.textContent = `${fmt(user.followerCount)} followers · ${fmt(user.videoCount)} videos`;
  dom.profileCard.hidden = false;
}

function renderItems(items, { append = false, isStory = false } = {}) {
  if (!append) {
    dom.grid.innerHTML = "";
    state.ids.clear();
  }
  if (!items.length && !append) {
    dom.empty.hidden = false;
    return;
  }
  dom.empty.hidden = true;
  const frag = document.createDocumentFragment();
  for (const item of items) {
    if (state.ids.has(item.videoId)) continue;
    state.ids.add(item.videoId);
    frag.appendChild(buildCard({ ...item, isStory: isStory || item.isStory }));
  }
  dom.grid.appendChild(frag);
}

/* ─── Search ─── */

async function search() {
  const username = dom.username.value.trim().replace(/^@+/, "");
  const keyword = dom.keyword.value.trim();
  if (!username) { setStatus("Please enter a username.", "error"); return; }
  if (state.loading) return;

  const sk = `${state.tab}::${username.toLowerCase()}`;
  const isAppend = state.searchKey === sk && state.cursor !== "0";
  const cursor = isAppend ? state.cursor : "0";
  const isStory = state.tab === "stories";

  state.loading = true;
  dom.searchBtn.disabled = true;
  dom.loadMore.disabled = true;
  dom.empty.hidden = true;
  setStatus(`Searching ${isStory ? "stories" : "reposts"} for @${username}…`, "loading");

  if (!isAppend) showSkeletons(6);

  const ep = isStory ? "stories" : "reposts";
  let url = `/api/${ep}?username=${encodeURIComponent(username)}&cursor=${cursor}&count=20`;
  if (!isStory && keyword) url += `&keyword=${encodeURIComponent(keyword)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    hideSkeletons();

    if (!res.ok) throw new Error(data.error || "Request failed");

    state.searchKey = sk;
    state.cursor = data.pagination.cursor;

    renderProfile(data.user);
    renderItems(data.items, { append: isAppend, isStory });

    const n = data.items.length;
    const type = isStory ? "stories" : "reposts";
    setStatus(`Loaded ${n} ${type} for @${data.user.username}.`, "success");

    dom.loadMore.hidden = !data.pagination.hasMore;
    dom.loadMore.disabled = false;
  } catch (err) {
    hideSkeletons();
    setStatus(err.message, "error");
  } finally {
    state.loading = false;
    dom.searchBtn.disabled = false;
  }
}

/* ─── Events ─── */

dom.searchBtn.addEventListener("click", () => { state.cursor = "0"; search(); });
dom.username.addEventListener("keydown", (e) => { if (e.key === "Enter") { state.cursor = "0"; search(); } });
dom.keyword.addEventListener("keydown", (e) => { if (e.key === "Enter") { state.cursor = "0"; search(); } });
dom.loadMore.addEventListener("click", () => search());
