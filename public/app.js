/* ─── ILOVEREPOST · Frontend ─── */

const VIDEOS_PER_PAGE = 120;
const REQUEST_COUNT = 20;

const state = {
  tab: "reposts",
  cursor: "0",
  ids: new Set(),
  loading: false,
  hasMore: false,
  musicRemaining: 3
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
  musicFields: $("music-fields"),
  dlList: $("dl-list"),
  dlAdd: $("dl-add"),
  dlAllBtn: $("dl-all-btn"),
  dlResults: $("dl-results"),
  musicUrl: $("music-url"),
  musicBtn: $("music-btn"),
  musicResults: $("music-results"),
  musicLimitText: $("music-limit-text")
};

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
  dom.musicFields.hidden = tab !== "music";
  dom.grid.innerHTML = "";
  state.ids.clear();
  state.cursor = "0";
  state.hasMore = false;
  dom.profileCard.hidden = true;
  dom.empty.hidden = true;
  dom.sentinel.hidden = true;
  hideSkeletons();
  if (tab === "reposts") setStatus("Enter a username to get started.");
  else if (tab === "download") setStatus("Paste TikTok video links to download.");
  else setStatus("Paste a TikTok video link to identify the music.");
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
    try { await triggerDownload(item.videoUrl, item.playUrl); }
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
  for (const item of items) {
    if (state.ids.has(item.videoId)) continue;
    state.ids.add(item.videoId);
    frag.appendChild(buildCard(item));
  }
  dom.grid.appendChild(frag);
  dom.empty.hidden = dom.grid.children.length > 0;
}

/* ─── Reposts Search ─── */

async function search(append = false) {
  const username = dom.username.value.trim().replace(/^@+/, "");
  const keyword = dom.keyword.value.trim();
  if (!username) { setStatus("Please enter a username.", "error"); return; }
  if (state.loading) return;

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
    renderItems(data.items, append);

    const n = data.items.length;
    const total = state.ids.size;
    const kw = keyword ? ` matching "${keyword}"` : "";
    setStatus(`Loaded ${n} reposts${kw} for @${data.user.username} (${total} total).`, "success");

    if (state.hasMore) {
      dom.sentinel.hidden = false;
      dom.scrollStatus.textContent = `Scroll to load more (${total}/${VIDEOS_PER_PAGE})`;
    }
  } catch (err) {
    hideSkeletons();
    setStatus(err.message, "error");
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
}, { rootMargin: "300px" });

observer.observe(dom.sentinel);

/* ─── Download ─── */

function addDlRow() {
  const row = document.createElement("div");
  row.className = "dl-row dl-item-row";
  row.innerHTML = `
    <div class="input-wrap">
      <label>TikTok URL</label>
      <input type="url" class="dl-url-input" placeholder="https://www.tiktok.com/@user/video/…" autocomplete="off" />
    </div>
    <button class="dl-remove" type="button" title="Remove">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
    </button>`;
  row.querySelector(".dl-remove").addEventListener("click", () => row.remove());
  dom.dlList.appendChild(row);
}

dom.dlAdd.addEventListener("click", addDlRow);

async function triggerDownload(videoUrl, playUrl = "") {
  const res = await fetch(`/api/download?url=${encodeURIComponent(videoUrl)}&playUrl=${encodeURIComponent(playUrl)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Download failed");

  const url = data.downloadUrl;
  const filename = data.filename || "video.mp4";

  // Try blob download (works on mobile + desktop)
  try {
    const fileRes = await fetch(url);
    const blob = await fileRes.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch {
    // Fallback: open in new tab
    window.open(url, "_blank");
  }

  return data;
}

async function downloadAll() {
  const inputs = dom.dlList.querySelectorAll(".dl-url-input");
  const urls = Array.from(inputs).map((i) => i.value.trim()).filter(Boolean);
  if (!urls.length) { setStatus("Please paste at least one TikTok URL.", "error"); return; }
  if (state.loading) return;

  state.loading = true;
  dom.dlAllBtn.disabled = true;
  dom.dlResults.innerHTML = "";
  setStatus(`Downloading ${urls.length} video${urls.length > 1 ? "s" : ""}…`, "loading");

  let ok = 0;
  for (const url of urls) {
    try {
      const res = await fetch(`/api/download?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download failed");

      const item = document.createElement("div");
      item.className = "dl-item";
      item.innerHTML = `
        ${data.thumbnail ? `<img src="${data.thumbnail}" alt="" />` : ""}
        <div class="dl-item-info">
          <h4>${data.title || "TikTok Video"}</h4>
          <p>${data.source || "tiktok"}</p>
        </div>
        <button class="dl-item-btn">Download</button>`;
      item.querySelector(".dl-item-btn").addEventListener("click", async () => {
        const btn = item.querySelector(".dl-item-btn");
        btn.textContent = "Downloading…";
        btn.disabled = true;
        try {
          const fileRes = await fetch(data.downloadUrl);
          const blob = await fileRes.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = data.filename || "video.mp4";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          btn.textContent = "Done ✓";
        } catch {
          window.open(data.downloadUrl, "_blank");
          btn.textContent = "Open";
        }
        btn.disabled = false;
      });
      dom.dlResults.appendChild(item);
      ok++;
    } catch (err) {
      const item = document.createElement("div");
      item.className = "dl-item";
      item.innerHTML = `<div class="dl-item-info"><h4 style="color:var(--error)">${err.message}</h4><p>${url.slice(0, 60)}…</p></div>`;
      dom.dlResults.appendChild(item);
    }
  }

  setStatus(`Downloaded ${ok}/${urls.length} videos.`, ok > 0 ? "success" : "error");
  state.loading = false;
  dom.dlAllBtn.disabled = false;
}

dom.dlAllBtn.addEventListener("click", downloadAll);

/* ─── Music Identification ─── */

function updateMusicLimit() {
  dom.musicLimitText.textContent = `${state.musicRemaining} identification${state.musicRemaining !== 1 ? "s" : ""} remaining`;
  if (state.musicRemaining <= 0) {
    dom.musicBtn.disabled = true;
    dom.musicLimitText.style.color = "var(--error)";
  }
}

async function identifyMusic() {
  const url = dom.musicUrl.value.trim();
  if (!url) { setStatus("Please paste a TikTok video URL.", "error"); return; }
  if (state.loading || state.musicRemaining <= 0) return;

  state.loading = true;
  dom.musicBtn.disabled = true;
  dom.musicResults.innerHTML = "";
  setStatus("Identifying music… this may take a moment.", "loading");

  try {
    const res = await fetch(`/api/music?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    state.musicRemaining = data.remaining ?? 0;
    updateMusicLimit();

    if (!res.ok) throw new Error(data.error || "Identification failed");
    if (!data.found) throw new Error(data.error || "Could not identify the music.");

    const links = data.links || {};
    const linksHtml = [
      links.spotify ? `<a class="music-link" href="${links.spotify}" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7"/></svg> Spotify</a>` : "",
      links.appleMusic ? `<a class="music-link" href="${links.appleMusic}" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 2v10.5a2 2 0 1 1-2-2V5l8-2v8.5a2 2 0 1 1-2-2V3"/></svg> Apple Music</a>` : "",
      links.youtube ? `<a class="music-link" href="${links.youtube}" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="3"/><path d="M6.5 6v4l3.5-2z" fill="currentColor"/></svg> YouTube</a>` : "",
      links.soundcloud ? `<a class="music-link" href="${links.soundcloud}" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10h1M4 8h1M6 6h1M8 5h1M10 6h1M12 7h1M14 9h.5"/><path d="M2 10v2M4 8v4M6 6v6M8 5v7M10 6v6M12 7v5M14 9v3"/></svg> SoundCloud</a>` : "",
      links.deezer ? `<a class="music-link" href="${links.deezer}" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12h2v2H2zM5 10h2v4H5zM8 8h2v6H8zM11 6h2v8h-2z"/></svg> Deezer</a>` : ""
    ].filter(Boolean).join("");

    dom.musicResults.innerHTML = `
      <div class="music-result">
        ${data.thumbnail ? `<img class="music-art" src="${data.thumbnail}" alt="" />` : ""}
        <div class="music-info">
          <h3>${data.track || "Unknown Track"}</h3>
          <p class="artist">${data.artist || "Unknown Artist"}</p>
          ${data.album ? `<p class="album">${data.album}</p>` : ""}
          <div class="music-links">${linksHtml}</div>
          <p class="music-limit">Found via TikTok video metadata</p>
          ${data.musicUrl ? `<button class="music-link" id="play-music-btn"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3l8 5-8 5V3z"/></svg> Play preview</button>` : ""}
        </div>
      </div>`;

    // Play music preview
    const playBtn = document.getElementById("play-music-btn");
    if (playBtn && data.musicUrl) {
      let audio = null;
      playBtn.addEventListener("click", () => {
        if (audio) {
          audio.pause();
          audio = null;
          playBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3l8 5-8 5V3z"/></svg> Play preview';
          return;
        }
        audio = new Audio(data.musicUrl);
        audio.play();
        playBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/></svg> Pause';
        audio.onended = () => {
          playBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3l8 5-8 5V3z"/></svg> Play preview';
          audio = null;
        };
      });
    }

    setStatus(`Identified: ${data.track} by ${data.artist}`, "success");
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    state.loading = false;
    dom.musicBtn.disabled = state.musicRemaining <= 0;
  }
}

dom.musicBtn.addEventListener("click", identifyMusic);
dom.musicUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") identifyMusic(); });

/* ─── Reposts Events ─── */

dom.searchBtn.addEventListener("click", () => { state.cursor = "0"; search(false); });
dom.username.addEventListener("keydown", (e) => { if (e.key === "Enter") { state.cursor = "0"; search(false); } });
dom.keyword.addEventListener("keydown", (e) => { if (e.key === "Enter") { state.cursor = "0"; search(false); } });
