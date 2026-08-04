/* ─── ILOVEREPOST · Frontend ─── */

const VIDEOS_PER_PAGE = 120;
const REQUEST_COUNT = 20;
const PAGES_PER_LOAD = 6;

const state = {
  tab: "reposts",
  cursor: "0",
  ids: new Set(),
  searchKey: "",
  loading: false,
  hasMore: false,
  username: ""
};

const $ = (s) => document.getElementById(s);

const dom = {
  username: $("username"),
  keyword: $("keyword"),
  searchBtn: $("search-btn"),
  status: $("status"),
  statusText: $("status-text"),
  profileCard: $("profile-card"),
  profileAvatar: $("profile-avatar"),
  profileName: $("profile-name"),
  profileMeta: $("profile-meta"),
  grid: $("results-grid"),
  skeleton: $("skeleton"),
  empty: $("empty-state"),
  sentinel: $("scroll-sentinel"),
  scrollStatus: $("scroll-status"),
  repostsFields: $("reposts-fields"),
  downloadFields: $("download-fields"),
  dlUrl: $("dl-url"),
  dlBtn: $("dl-btn"),
  dlResult: $("dl-result")
};

/* ─── Liquid Glass: cursor tracking ─── */

document.addEventListener("mousemove", (e) => {
  const cards = document.querySelectorAll(".glass-card, .video-card");
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--mouse-x", `${x}%`);
    card.style.setProperty("--mouse-y", `${y}%`);
  }
});

/* ─── Helpers ─── */

function fmt(n) {
  n = Number(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function fmtDur(s) {
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
  dom.statusText.textContent = msg;
}

function showSkeletons(n = 6) {
  dom.skeleton.hidden = false;
  dom.skeleton.innerHTML = "";
  for (let i = 0; i < n; i++) {
    dom.skeleton.innerHTML += `<div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-body"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>`;
  }
}

function hideSkeletons() { dom.skeleton.hidden = true; dom.skeleton.innerHTML = ""; }

/* ─── Tabs ─── */

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  dom.repostsFields.hidden = tab !== "reposts";
  dom.downloadFields.hidden = tab !== "download";
  dom.grid.innerHTML = "";
  state.ids.clear();
  state.searchKey = "";
  state.cursor = "0";
  state.hasMore = false;
  dom.profileCard.hidden = true;
  dom.empty.hidden = true;
  dom.sentinel.hidden = true;
  dom.dlResult.hidden = true;
  dom.dlResult.innerHTML = "";
  if (tab === "reposts") setStatus("Enter a username to get started.");
  else setStatus("Paste a TikTok video link to download.");
}

document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

/* ─── Card Builder ─── */

function buildCard(item) {
  const card = document.createElement("article");
  card.className = "video-card";
  const dur = fmtDur(item.duration);
  card.innerHTML = `
    <div class="video-thumb">
      <img src="${item.thumbnail || "https://via.placeholder.com/360x480?text=."}" alt="" loading="lazy" />
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
          <button class="icon-btn dl-v" title="Download">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2.5v8M4.5 8L8 11.5 11.5 8M3 13.5h10"/></svg>
          </button>
          <a class="icon-btn" href="${item.videoUrl}" target="_blank" rel="noopener" title="View">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10M9 2h5v5M14 2L7.5 8.5"/></svg>
          </a>
        </div>
      </div>
    </div>`;
  card.querySelector(".dl-v").addEventListener("click", async () => {
    const btn = card.querySelector(".dl-v");
    btn.style.opacity = "0.3"; btn.style.pointerEvents = "none";
    try { await doDownload(item.videoUrl, item.playUrl); }
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

function renderItems(items, append = false) {
  if (!append) { dom.grid.innerHTML = ""; state.ids.clear(); }
  const frag = document.createDocumentFragment();
  let added = 0;
  for (const item of items) {
    if (state.ids.has(item.videoId)) continue;
    state.ids.add(item.videoId);
    frag.appendChild(buildCard(item));
    added++;
  }
  dom.grid.appendChild(frag);
  // Only show empty if grid is empty AFTER rendering
  dom.empty.hidden = dom.grid.children.length > 0;
  return added;
}

/* ─── Reposts Search ─── */

async function search(append = false) {
  const username = dom.username.value.trim().replace(/^@+/, "");
  const keyword = dom.keyword.value.trim();
  if (!username) { setStatus("Please enter a username.", "error"); return; }
  if (state.loading) return;

  const sk = `reposts::${username.toLowerCase()}`;
  if (!append) { state.searchKey = sk; state.cursor = "0"; state.ids.clear(); }
  state.username = username;

  state.loading = true;
  dom.searchBtn.disabled = true;
  dom.empty.hidden = true;
  dom.sentinel.hidden = true;

  setStatus(`Searching ${VIDEOS_PER_PAGE} reposts for @${username}…`, "loading");
  if (!append) showSkeletons(6);

  const cursor = append ? state.cursor : "0";
  let url = `/api/reposts?username=${encodeURIComponent(username)}&cursor=${cursor}&count=${REQUEST_COUNT}`;
  if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    hideSkeletons();

    if (!res.ok) throw new Error(data.error || "Request failed");

    state.cursor = data.pagination.cursor;
    state.hasMore = data.pagination.hasMore;

    renderProfile(data.user);
    const added = renderItems(data.items, append);

    const n = data.items.length;
    const total = state.ids.size;
    const kw = keyword ? ` matching "${keyword}"` : "";
    setStatus(`Loaded ${n} reposts${kw} for @${data.user.username} (${total} total).`, "success");

    // Show sentinel for infinite scroll if more pages
    if (state.hasMore) {
      dom.sentinel.hidden = false;
      dom.scrollStatus.textContent = `Scroll to load more (${total}/${VIDEOS_PER_PAGE})`;
    }
  } catch (err) {
    hideSkeletons();
    setStatus(err.message, "error");
    // Don't show empty on error, keep whatever we have
  } finally {
    state.loading = false;
    dom.searchBtn.disabled = false;
  }
}

/* ─── Infinite Scroll ─── */

const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && state.hasMore && !state.loading && state.tab === "reposts") {
    search(true);
  }
}, { rootMargin: "200px" });

observer.observe(dom.sentinel);

/* ─── Download ─── */

async function doDownload(videoUrl, playUrl = "") {
  const res = await fetch(`/api/download?url=${encodeURIComponent(videoUrl)}&playUrl=${encodeURIComponent(playUrl)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Download failed");
  const a = document.createElement("a");
  a.href = data.downloadUrl;
  a.download = data.filename || "video.mp4";
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
  return data;
}

async function downloadFromUrl() {
  const url = dom.dlUrl.value.trim();
  if (!url) { setStatus("Please paste a TikTok URL.", "error"); return; }
  if (state.loading) return;

  state.loading = true;
  dom.dlBtn.disabled = true;
  setStatus("Resolving download…", "loading");

  try {
    const res = await fetch(`/api/download?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Download failed");

    dom.dlResult.hidden = false;
    dom.dlResult.innerHTML = `
      <div class="dl-success">
        ${data.thumbnail ? `<img src="${data.thumbnail}" alt="" />` : ""}
        <div class="dl-info">
          <h4>${data.title || "TikTok Video"}</h4>
          <p>${data.source === "tikwm" ? "Resolved via TikWM" : "Resolved from TikTok"}</p>
        </div>
        <button class="dl-download-btn" id="dl-go">Download MP4</button>
      </div>`;

    dom.dlResult.querySelector("#dl-go").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename || "video.mp4";
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    });

    setStatus("Download ready!", "success");
  } catch (err) {
    dom.dlResult.hidden = true;
    setStatus(err.message, "error");
  } finally {
    state.loading = false;
    dom.dlBtn.disabled = false;
  }
}

/* ─── Events ─── */

dom.searchBtn.addEventListener("click", () => search(false));
dom.username.addEventListener("keydown", (e) => { if (e.key === "Enter") search(false); });
dom.keyword.addEventListener("keydown", (e) => { if (e.key === "Enter") search(false); });
dom.dlBtn.addEventListener("click", downloadFromUrl);
dom.dlUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") downloadFromUrl(); });
