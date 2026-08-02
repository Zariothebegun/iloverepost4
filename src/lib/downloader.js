const TIKWM_API_URL = "https://www.tikwm.com/api/";
const VIDEO_DATA_PATTERN =
  /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/;

function pickBestVideoUrl(data) {
  return data.hdplay || data.play || data.wmplay || "";
}

function sanitizeFilename(value) {
  return (value || "tiktok-video")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "tiktok-video";
}

function parseJsonScript(html) {
  const match = html.match(VIDEO_DATA_PATTERN);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function buildDirectResult(downloadUrl, title = "") {
  return {
    downloadUrl,
    filename: `${sanitizeFilename(title)}.mp4`,
    title,
    thumbnail: "",
    source: "tiktok_direct"
  };
}

async function resolveViaTikwm(videoUrl) {
  const response = await fetch(TIKWM_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "Mozilla/5.0"
    },
    body: new URLSearchParams({
      url: videoUrl,
      hd: "1"
    })
  });

  const payload = await response.json();

  if (!response.ok || payload?.code !== 0 || !payload?.data) {
    throw new Error(payload?.msg || "Could not resolve a downloadable TikTok video.");
  }

  const downloadUrl = pickBestVideoUrl(payload.data);

  if (!downloadUrl) {
    throw new Error("Downloader service did not return a usable MP4 URL.");
  }

  return {
    downloadUrl,
    filename: `${sanitizeFilename(payload.data.title)}.mp4`,
    title: payload.data.title || "",
    thumbnail: payload.data.cover || "",
    source: "tikwm"
  };
}

async function resolveViaTikTokPage(videoUrl) {
  const response = await fetch(videoUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`TikTok page request failed with ${response.status}.`);
  }

  const universalData = parseJsonScript(html);
  const detail =
    universalData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct ||
    universalData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemInfo?.itemStruct ||
    null;

  const playUrl =
    safeString(detail?.video?.downloadAddr) ||
    safeString(detail?.video?.playAddr) ||
    safeString(detail?.video?.playAddrH264);

  if (!playUrl) {
    throw new Error("TikTok page did not expose a playable video URL.");
  }

  return {
    downloadUrl: playUrl,
    filename: `${sanitizeFilename(detail?.desc || detail?.author?.uniqueId || "tiktok-video")}.mp4`,
    title: safeString(detail?.desc),
    thumbnail: safeString(detail?.video?.cover || detail?.video?.originCover),
    source: "tiktok_page"
  };
}

export async function resolveTikTokDownload(videoUrl, playUrl = "") {
  if (playUrl) {
    return buildDirectResult(playUrl);
  }

  try {
    return await resolveViaTikwm(videoUrl);
  } catch (tikwmError) {
    try {
      return await resolveViaTikTokPage(videoUrl);
    } catch (pageError) {
      throw new Error(
        `Could not resolve a downloadable TikTok video. TikWM: ${tikwmError.message}. TikTok page: ${pageError.message}.`
      );
    }
  }
}
