const { chromium } = require('playwright');

let browserInstance = null;
const cache = new Map();
const CACHE_TTL = 30_000;

function normalizeUsername(username) {
  return String(username || '').trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
    .replace(/^@+/, '').split(/[/?#]/)[0].trim().toLowerCase();
}
function safeString(value) { return typeof value === 'string' ? value : ''; }
function safeNumber(value) { return Number(value || 0); }
function normalizeSearchText(value) {
  return safeString(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function collectTextValues(value, bucket) {
  if (!value) return;
  if (typeof value === 'string') { bucket.push(value); return; }
  if (Array.isArray(value)) { value.forEach(item => collectTextValues(item, bucket)); return; }
  if (typeof value === 'object') Object.values(value).forEach(item => collectTextValues(item, bucket));
}
function buildSearchableText(item) {
  const values = [];
  collectTextValues(item.caption, values);
  collectTextValues(item.raw?.desc, values);
  collectTextValues(item.raw?.contents, values);
  collectTextValues(item.raw?.music?.title, values);
  collectTextValues(item.raw?.music?.authorName, values);
  collectTextValues(item.raw?.challenges, values);
  collectTextValues(item.raw?.stickersOnItem, values);
  collectTextValues(item.authorNickname, values);
  collectTextValues(item.author, values);
  return normalizeSearchText(values.join(' '));
}
function extractItems(json) {
  if (!json || typeof json !== 'object') return [];
  const output = [];
  for (const list of [json.itemList, json.items, json.aweme_list, json.item_list]) if (Array.isArray(list)) output.push(...list);
  if (json.itemInfo?.itemStruct) output.push(json.itemInfo.itemStruct);
  return output.filter(Boolean);
}

function filterItemsByKeyword(items, keyword) {
  const normalized = normalizeSearchText(keyword);
  return normalized ? items.filter(item => buildSearchableText(item).includes(normalized)) : items;
}
function mapVideoItem(item) {
  const author = item?.author || {};
  const video = item?.video || {};
  const stats = item?.stats || {};
  const id = safeString(item?.id || item?.video_id || item?.aweme_id);
  const uniqueId = safeString(author.uniqueId || author.unique_id || author.nickname);
  return {
    id, videoId: id, caption: safeString(item?.desc), author: uniqueId,
    authorNickname: safeString(author.nickname), authorSecUid: safeString(author.secUid || author.sec_uid),
    authorAvatar: safeString(author.avatarThumb || author.avatarMedium || author.avatarLarger),
    thumbnail: safeString(video.cover || video.originCover || video.dynamicCover),
    playUrl: safeString(video.playAddr || video.downloadAddr),
    videoUrl: uniqueId ? `https://www.tiktok.com/@${uniqueId}/video/${id}` : `https://www.tiktok.com/video/${id}`,
    duration: safeNumber(video.duration), width: safeNumber(video.width), height: safeNumber(video.height),
    likes: safeNumber(stats.diggCount), comments: safeNumber(stats.commentCount), shares: safeNumber(stats.shareCount),
    plays: safeNumber(stats.playCount), createTime: safeNumber(item?.createTime), raw: item || {}
  };
}
function dedupeItems(items) {
  const seen = new Set();
  return items.filter(item => { const id = item.id || item.videoId; if (!id || seen.has(id)) return false; seen.add(id); return true; });
}
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('[playwright] Launching Chromium...');
    browserInstance = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  }
  return browserInstance;
}

async function fetchPage(browser, username, cursor, count) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }, locale: 'en-US', timezoneId: 'Europe/Lisbon'
  });
  const page = await context.newPage();
  try {
    const profileUrl = `https://www.tiktok.com/@${username}`;
    const navigation = await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    if (!navigation || !navigation.ok()) throw new Error(`Page returned HTTP ${navigation?.status() || 'unknown'}`);
    await page.waitForTimeout(2_000);

    let pageData = await page.evaluate(() => {
      const element = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (!element) return null;
      try { return JSON.parse(element.textContent); } catch (_) { return null; }
    });
    if (!pageData) {
      const fallback = await page.evaluate(() => {
        for (const script of document.querySelectorAll('script')) {
          const text = script.textContent || '';
          const sec = text.match(/"secUid"\s*:\s*"([^"]+)"/);
          if (sec) return { secUid: sec[1], nickname: text.match(/"nickname"\s*:\s*"([^"]+)"/)?.[1] || '' };
        }
        return null;
      });
      if (!fallback) throw new Error(`Could not find profile data for @${username}. Profile may not exist or may be private.`);
      pageData = { fallback };
    }

    let profileInfo;
    if (pageData.fallback) {
      profileInfo = { username, nickname: pageData.fallback.nickname || username, secUid: pageData.fallback.secUid, avatar: '', verified: false, followerCount: 0, followingCount: 0, heartCount: 0, videoCount: 0, webIdCreatedTime: String(Math.floor(Date.now() / 1000)) };
    } else {
      const scope = pageData.__DEFAULT_SCOPE__ || {};
      const userInfo = scope['webapp.user-detail']?.userInfo || {};
      const user = userInfo.user || {};
      const stats = userInfo.stats || {};
      const appContext = scope['webapp.app-context'] || {};
      if (!user.secUid) throw new Error(`No secUid found for @${username}. Profile may not exist or may be private.`);
      profileInfo = {
        username: safeString(user.uniqueId || username), nickname: safeString(user.nickname || username), secUid: safeString(user.secUid),
        avatar: safeString(user.avatarMedium || user.avatarThumb || user.avatarLarger), verified: Boolean(user.verified),
        followerCount: safeNumber(stats.followerCount), followingCount: safeNumber(stats.followingCount),
        heartCount: safeNumber(stats.heart || stats.heartCount), videoCount: safeNumber(stats.videoCount),
        webIdCreatedTime: String(appContext.webIdCreatedTime || Math.floor(Date.now() / 1000))
      };
    }

    const msToken = (await context.cookies()).find(cookie => cookie.name === 'msToken')?.value || '';
    const params = new URLSearchParams({ secUid: profileInfo.secUid, count: String(count), cursor: String(cursor), aid: '1988', app_name: 'tiktok_web', device_platform: 'web_pc', from_page: 'user', region: 'PT', priority_region: 'PT', language: 'en', app_language: 'en', browser_language: 'en-US', browser_name: 'Mozilla', browser_online: 'true', browser_platform: 'Win32', channel: 'tiktok_web', video_encoding: 'mp4', user_is_login: 'false', tz_name: 'Europe/Lisbon', WebIdLastTime: profileInfo.webIdCreatedTime });
    if (msToken) params.set('msToken', msToken);
    const apiUrl = `https://www.tiktok.com/api/repost/item_list/?${params}`;
    const apiResponse = await page.evaluate(async url => {
      const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*', Referer: location.origin + '/' } });
      let json;
      try { json = await response.json(); } catch (_) { json = {}; }
      return { httpStatus: response.status, body: json };
    }, apiUrl);
    return { profileInfo, apiResponse: apiResponse.body || {}, httpStatus: apiResponse.httpStatus, success: apiResponse.httpStatus === 200 && (apiResponse.body?.statusCode === 0 || apiResponse.body?.status_code === 0) };
  } finally { if (page.close) await page.close().catch(() => {}); await context.close().catch(() => {}); }
}

async function searchTikTokProfile({ username, contentType = 'reposts', keyword = '', cursor = 0, count = 20, pagesToFetch = 1 }) {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error('A TikTok username is required.');
  const cacheKey = `${normalized}:${keyword}:${cursor}:${pagesToFetch}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const browser = await getBrowser();
  let profileInfo, allItems = [], hasMore = true, currentCursor = Number(cursor) || 0, pagesFetched = 0;
  while (hasMore && pagesFetched < Math.min(Math.max(Number(pagesToFetch) || 1, 1), 8)) {
    const result = await fetchPage(browser, normalized, currentCursor, count);
    if (!result.success) {
      if (result.apiResponse?.statusCode === 10222) { hasMore = false; if (!profileInfo) profileInfo = result.profileInfo; break; }
      throw new Error(`TikTok API returned status ${result.apiResponse?.statusCode ?? result.httpStatus ?? 'unknown'}`);
    }
    profileInfo ||= result.profileInfo;
    const raw = Array.isArray(result.apiResponse.itemList) ? result.apiResponse.itemList : [];
    allItems.push(...raw.map(mapVideoItem));
    hasMore = Boolean(result.apiResponse.hasMore);
    currentCursor = Number(result.apiResponse.cursor ?? currentCursor);
    pagesFetched++;
    console.log(`[playwright] Page ${pagesFetched}: ${raw.length} items, cursor=${currentCursor}, hasMore=${hasMore}`);
  }
  const uniqueItems = dedupeItems(allItems);
  const items = filterItemsByKeyword(uniqueItems, keyword);
  const data = { success: true, user: { username: profileInfo?.username || normalized, nickname: profileInfo?.nickname || normalized, secUid: profileInfo?.secUid || '', avatar: profileInfo?.avatar || '', verified: Boolean(profileInfo?.verified), followerCount: profileInfo?.followerCount || 0, followingCount: profileInfo?.followingCount || 0, heartCount: profileInfo?.heartCount || 0, videoCount: profileInfo?.videoCount || 0 }, totalFound: uniqueItems.length, search: { contentType, keyword: keyword || '' }, pagination: { cursor: String(currentCursor), hasMore, count }, items, debug: { pagesFetched, rawItemCount: allItems.length, uniqueItemCount: uniqueItems.length, filteredCount: items.length, method: 'playwright-cookies+browser-context-api' } };
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}
async function closeBrowser() { if (browserInstance?.isConnected()) await browserInstance.close(); browserInstance = null; }
function extractTikTokStatusCode(error) { const match = safeString(error?.message).match(/status (\d+)/i); return match ? Number(match[1]) : null; }
module.exports = { searchTikTokProfile, closeBrowser, normalizeUsername, normalizeSearchText, filterItemsByKeyword, buildSearchableText, mapVideoItem, extractItems, extractTikTokStatusCode };
