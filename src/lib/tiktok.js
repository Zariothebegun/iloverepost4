import { SimpleCookieJar } from "./cookie-jar.js";
import { CONTENT_TYPES } from "./plans.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const UNIVERSAL_DATA_PATTERN =
  /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/;

const REQUEST_TIMEOUT_MS = 15000;
const MAX_REQUEST_ATTEMPTS = 2;

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const merged = headers.get("set-cookie");
  return merged ? [merged] : [];
}

function normalizeUsername(username) {
  return username.replace(/^@+/, "").trim();
}

function buildBrowserHeaders(cookieJar, referer) {
  const headers = {
    "user-agent": USER_AGENT,
    accept: "text/html,application/json,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    referer,
    "sec-ch-ua": '"Chromium";v="145", "Google Chrome";v="145", "Not.A/Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin"
  };

  const cookieHeader = cookieJar.toHeader();
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
}

async function parseJsonResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`TikTok returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

async function performRequest(url, options, cookieJar) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      cookieJar.addSetCookieHeaders(getSetCookieHeaders(response.headers));
      return response;
    } catch (error) {
      lastError = error;

      if (attempt === MAX_REQUEST_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError;
}

function parseUniversalData(html) {
  const match = html.match(UNIVERSAL_DATA_PATTERN);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractProfileContext(universalData, html, normalizedUsername) {
  const scope = universalData?.__DEFAULT_SCOPE__ ?? {};
  const appContext = scope["webapp.app-context"] ?? {};
  const userDetail = scope["webapp.user-detail"] ?? {};
  const userInfo = userDetail.userInfo ?? {};
  const user = userInfo.user ?? null;
  const stats = userInfo.stats ?? null;

  const fallbackSecUid = (html.match(/"secUid":"([^"]+)"/) || [])[1] || "";
  const fallbackNickname = (html.match(/"nickname":"([^"]+)"/) || [])[1] || "";

  if (!user?.secUid && !fallbackSecUid) {
    throw new Error("TikTok profile data did not include a secUid.");
  }

  return {
    appContext,
    user: {
      uniqueId: user?.uniqueId || normalizedUsername,
      nickname: user?.nickname || fallbackNickname,
      secUid: user?.secUid || fallbackSecUid,
      avatarMedium: user?.avatarMedium || "",
      avatarThumb: user?.avatarThumb || "",
      avatarLarger: user?.avatarLarger || "",
      verified: Boolean(user?.verified)
    },
    stats: stats || {}
  };
}

function buildListParams({ secUid, cursor, count, appContext, cookieJar }) {
  const webIdCreatedTime = appContext?.webIdCreatedTime;
  const msToken = cookieJar.get("msToken");

  return {
    WebIdLastTime: webIdCreatedTime || String(Math.floor(Date.now() / 1000)),
    aid: "1988",
    app_language: appContext?.language || "en",
    app_name: "tiktok_web",
    browser_language: "en-US",
    browser_name: "Mozilla",
    browser_online: "true",
    browser_platform: "Win32",
    browser_version: USER_AGENT,
    channel: "tiktok_web",
    count: String(count),
    cursor: String(cursor),
    device_platform: "web_pc",
    from_page: "user",
    language: appContext?.language || "en",
    priority_region: appContext?.region || "US",
    region: appContext?.region || "US",
    secUid,
    tz_name: "Europe/Lisbon",
    user_is_login: "false",
    video_encoding: "mp4",
    ...(msToken ? { msToken } : {})
  };
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function safeNumber(value) {
  return Number(value || 0);
}

function normalizeSearchText(value) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function collectTextValues(value, bucket) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    bucket.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTextValues(entry, bucket);
    }
    return;
  }

  if (typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectTextValues(entry, bucket);
    }
  }
}

function buildSearchableText(item) {
  const bucket = [];

  collectTextValues(item.caption, bucket);
  collectTextValues(item.raw?.desc, bucket);
  collectTextValues(item.raw?.contents, bucket);
  collectTextValues(item.raw?.music?.title, bucket);
  collectTextValues(item.raw?.music?.authorName, bucket);
  collectTextValues(item.raw?.challenges, bucket);
  collectTextValues(item.raw?.stickersOnItem, bucket);
  collectTextValues(item.raw?.anchors, bucket);
  collectTextValues(item.raw?.textExtra, bucket);

  return normalizeSearchText(bucket.join(" "));
}

function mapVideoItem(item) {
  const author = item?.author ?? {};
  const video = item?.video ?? {};
  const stats = item?.stats ?? {};

  return {
    id: safeString(item?.id),
    videoId: safeString(item?.id),
    caption: safeString(item?.desc),
    author: safeString(author.uniqueId || author.nickname),
    authorNickname: safeString(author.nickname),
    authorSecUid: safeString(author.secUid),
    authorAvatar: safeString(author.avatarThumb || author.avatarMedium || author.avatarLarger),
    thumbnail: safeString(video.cover || video.originCover || video.dynamicCover),
    playUrl: safeString(video.playAddr || video.downloadAddr),
    videoUrl: safeString(author.uniqueId)
      ? `https://www.tiktok.com/@${author.uniqueId}/video/${safeString(item?.id)}`
      : `https://www.tiktok.com/video/${safeString(item?.id)}`,
    duration: safeNumber(video.duration),
    width: safeNumber(video.width),
    height: safeNumber(video.height),
    likes: safeNumber(stats.diggCount),
    comments: safeNumber(stats.commentCount),
    shares: safeNumber(stats.shareCount),
    plays: safeNumber(stats.playCount),
    createTime: safeNumber(item?.createTime),
    raw: item ?? {}
  };
}

async function bootstrapProfileContext(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error("A TikTok username is required.");
  }

  const profileUrl = `https://www.tiktok.com/@${normalizedUsername}`;
  const cookieJar = new SimpleCookieJar();
  const response = await performRequest(
    profileUrl,
    {
      headers: buildBrowserHeaders(cookieJar, "https://www.tiktok.com/")
    },
    cookieJar
  );

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`TikTok request failed with ${response.status}: ${html.slice(0, 200)}`);
  }

  const universalData = parseUniversalData(html);
  const { appContext, user, stats } = extractProfileContext(universalData, html, normalizedUsername);

  return {
    normalizedUsername,
    profileUrl,
    cookieJar,
    appContext,
    user,
    stats
  };
}

async function fetchRepostList(profileContext, cursor, count) {
  const listUrl = new URL("https://www.tiktok.com/api/repost/item_list/");
  const params = buildListParams({
    secUid: profileContext.user.secUid,
    cursor,
    count,
    appContext: profileContext.appContext,
    cookieJar: profileContext.cookieJar
  });

  for (const [key, value] of Object.entries(params)) {
    listUrl.searchParams.set(key, value);
  }

  const response = await performRequest(
    listUrl,
    {
      headers: {
        ...buildBrowserHeaders(profileContext.cookieJar, profileContext.profileUrl),
        accept: "application/json, text/plain, */*",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin"
      }
    },
    profileContext.cookieJar
  );

  return parseJsonResponse(response);
}

function filterItemsByKeyword(items, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return items;
  }

  return items.filter((item) => buildSearchableText(item).includes(normalizedKeyword));
}

function buildResult(profileContext, payload, contentType, count, cursor, keyword) {
  const itemList = Array.isArray(payload?.itemList)
    ? payload.itemList.map((item) => (item?.raw ? item : mapVideoItem(item)))
    : [];
  const filteredItems = filterItemsByKeyword(itemList, keyword);

  return {
    user: {
      username: safeString(profileContext.user.uniqueId || profileContext.normalizedUsername),
      nickname: safeString(profileContext.user.nickname),
      secUid: safeString(profileContext.user.secUid),
      avatar:
        safeString(profileContext.user.avatarMedium) ||
        safeString(profileContext.user.avatarThumb) ||
        safeString(profileContext.user.avatarLarger),
      verified: Boolean(profileContext.user.verified),
      followerCount: safeNumber(profileContext.stats?.followerCount),
      followingCount: safeNumber(profileContext.stats?.followingCount),
      heartCount: safeNumber(profileContext.stats?.heartCount),
      videoCount: safeNumber(profileContext.stats?.videoCount)
    },
    search: {
      contentType,
      keyword
    },
    pagination: {
      cursor: String(payload?.cursor ?? cursor),
      hasMore: Boolean(payload?.hasMore),
      count: Number(count)
    },
    items: filteredItems,
    debug: {
      requestLogId: safeString(payload?.extra?.logid),
      filteredOutCount: itemList.length - filteredItems.length,
      msTokenPresent: Boolean(profileContext.cookieJar.get("msToken"))
    }
  };
}

function dedupeItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = safeString(item?.videoId || item?.id);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function fetchRepostPages(profileContext, cursor, count, pagesToFetch) {
  const aggregatedItems = [];
  let currentCursor = cursor;
  let hasMore = true;
  let pagesFetched = 0;
  let lastLogId = "";
  let rawItemCount = 0;

  for (let pageIndex = 0; pageIndex < pagesToFetch; pageIndex += 1) {
    if (!hasMore && pageIndex > 0) {
      break;
    }

    const payload = await fetchRepostList(profileContext, currentCursor, count);

    if (payload?.statusCode || payload?.status_code) {
      const code = payload?.statusCode ?? payload?.status_code;
      const message = payload?.status_msg || payload?.message || "TikTok repost request failed.";
      throw new Error(`TikTok repost request failed (${code}): ${message}`);
    }

    const pageItems = Array.isArray(payload?.itemList) ? payload.itemList.map(mapVideoItem) : [];
    const nextCursor = Number(payload?.cursor ?? currentCursor);
    const safeNextCursor = Number.isFinite(nextCursor) && nextCursor >= 0 ? nextCursor : currentCursor;

    aggregatedItems.push(...pageItems);
    rawItemCount += pageItems.length;
    pagesFetched += 1;
    hasMore = Boolean(payload?.hasMore);
    lastLogId = safeString(payload?.extra?.logid) || lastLogId;

    if (!hasMore || safeNextCursor === currentCursor || pageItems.length === 0) {
      currentCursor = safeNextCursor;
      break;
    }

    currentCursor = safeNextCursor;
  }

  const uniqueItems = dedupeItems(aggregatedItems);

  return {
    itemList: uniqueItems,
    cursor: currentCursor,
    hasMore,
    extra: {
      logid: lastLogId
    },
    debug: {
      pagesFetched,
      rawItemCount,
      uniqueItemCount: uniqueItems.length
    }
  };
}

async function fetchKeywordSearchPages(profileContext, cursor, count, pagesToFetch, keyword, maxCursor) {
  const aggregatedItems = [];
  let currentCursor = cursor;
  let hasMore = true;
  let pagesFetched = 0;
  let rawItemCount = 0;
  let lastLogId = "";

  while (hasMore && pagesFetched < pagesToFetch && currentCursor <= maxCursor) {
    const payload = await fetchRepostPages(profileContext, currentCursor, count, 1);
    const pageItems = Array.isArray(payload?.itemList) ? payload.itemList : [];
    const filteredItems = filterItemsByKeyword(pageItems, keyword);

    aggregatedItems.push(...pageItems);
    pagesFetched += payload.debug?.pagesFetched || 1;
    rawItemCount += payload.debug?.rawItemCount || pageItems.length;
    hasMore = Boolean(payload?.hasMore);
    lastLogId = safeString(payload?.extra?.logid) || lastLogId;

    if (filteredItems.length > 0 || !hasMore || payload.cursor === currentCursor) {
      currentCursor = Number(payload.cursor ?? currentCursor);
      break;
    }

    currentCursor = Number(payload.cursor ?? currentCursor);
  }

  const uniqueItems = dedupeItems(aggregatedItems);

  return {
    itemList: uniqueItems,
    cursor: currentCursor,
    hasMore,
    extra: {
      logid: lastLogId
    },
    debug: {
      pagesFetched,
      rawItemCount,
      uniqueItemCount: uniqueItems.length
    }
  };
}

function extractTikTokStatusCode(error) {
  const message = safeString(error?.message);
  const match = message.match(/\((\d+)\)/);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

export { normalizeSearchText };

export async function searchTikTokProfile({
  username,
  contentType = CONTENT_TYPES.REPOSTS,
  keyword = "",
  cursor = 0,
  count = 16,
  pagesToFetch = 1,
  maxSearchCursor = 400
}) {
  async function run(profileContext) {
    if (contentType !== CONTENT_TYPES.REPOSTS) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const payload = keyword
      ? await fetchKeywordSearchPages(
          profileContext,
          cursor,
          count,
          Math.max(1, pagesToFetch),
          keyword,
          Math.max(cursor, maxSearchCursor)
        )
      : await fetchRepostPages(profileContext, cursor, count, Math.max(1, pagesToFetch));
    const result = buildResult(profileContext, payload, contentType, count, cursor, keyword);

    return {
      ...result,
      debug: {
        ...result.debug,
        pagesFetched: payload.debug.pagesFetched,
        fetchedVideoCount: payload.debug.uniqueItemCount,
        rawFetchedVideoCount: payload.debug.rawItemCount
      }
    };
  }

  let profileContext = await bootstrapProfileContext(username);

  try {
    return await run(profileContext);
  } catch (error) {
    // TikTok sometimes returns transient bot-protection errors (e.g. 100004). A fresh cookie jar
    // (new profile bootstrap) can succeed without the user doing anything.
    const code = extractTikTokStatusCode(error);
    if (code === 100004) {
      profileContext = await bootstrapProfileContext(username);
      return await run(profileContext);
    }

    throw error;
  }
}
