const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const UNIVERSAL_DATA_PATTERN =
  /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/;

function safeString(v) {
  return typeof v === "string" ? v : "";
}

function buildSearchUrl(platform, track, artist) {
  const q = encodeURIComponent(`${track} ${artist}`);
  const urls = {
    spotify: `https://open.spotify.com/search/${q}`,
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    soundcloud: `https://soundcloud.com/search?q=${q}`,
    appleMusic: `https://music.apple.com/search?term=${q}`,
    deezer: `https://www.deezer.com/search/${q}`
  };
  return urls[platform] || null;
}

export async function identifyMusic(tiktokUrl) {
  // Fetch the video page with same approach as the downloader
  const response = await fetch(tiktokUrl, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://www.tiktok.com/"
    },
    signal: AbortSignal.timeout(20000),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`TikTok returned HTTP ${response.status}`);
  }

  const html = await response.text();

  // Try __UNIVERSAL_DATA_FOR_REHYDRATION__
  let videoDetail = null;
  const match = html.match(UNIVERSAL_DATA_PATTERN);

  if (match) {
    try {
      const data = JSON.parse(match[1]);
      const scope = data?.__DEFAULT_SCOPE__ ?? {};
      videoDetail =
        scope["webapp.video-detail"]?.itemInfo?.itemStruct ||
        scope["webapp.video-detail"]?.itemInfo?.itemInfo?.itemStruct ||
        null;
    } catch {
      // fall through
    }
  }

  // Fallback: try SIGI_STATE
  if (!videoDetail) {
    const sigiMatch = html.match(/<script id="SIGI_STATE" type="application\/json">([\s\S]*?)<\/script>/);
    if (sigiMatch) {
      try {
        const sigi = JSON.parse(sigiMatch[1]);
        const itemModule = sigi?.ItemModule;
        if (itemModule) {
          const firstKey = Object.keys(itemModule)[0];
          videoDetail = itemModule[firstKey] || null;
        }
      } catch {
        // fall through
      }
    }
  }

  // Fallback: try regex extraction from HTML
  if (!videoDetail) {
    const musicTitleMatch = html.match(/"music":\s*\{[^}]*"title":\s*"([^"]+)"/);
    const musicAuthorMatch = html.match(/"music":\s*\{[^}]*"authorName":\s*"([^"]+)"/);
    if (musicTitleMatch || musicAuthorMatch) {
      videoDetail = {
        music: {
          title: musicTitleMatch?.[1] || "",
          authorName: musicAuthorMatch?.[1] || ""
        }
      };
    }
  }

  if (!videoDetail) {
    throw new Error("Could not find video data on this page. Make sure the link is a valid TikTok video URL.");
  }

  const music = videoDetail.music || {};
  const author = videoDetail.author || {};

  const track = safeString(music.title);
  const artist = safeString(music.authorName) || safeString(author.uniqueId);
  const album = safeString(music.album);
  const cover = safeString(music.coverLarge) || safeString(music.coverMedium) || safeString(music.cover);
  const musicUrl = safeString(music.playUrl);
  const duration = music.duration || videoDetail.video?.duration || 0;

  if (!track && !artist) {
    return {
      found: false,
      error: "No music information found in this video."
    };
  }

  return {
    found: true,
    track: track || "Unknown Track",
    artist: artist || "Unknown Artist",
    album,
    thumbnail: cover,
    duration,
    musicUrl,
    links: {
      spotify: buildSearchUrl("spotify", track || artist, artist),
      youtube: buildSearchUrl("youtube", track || artist, artist),
      soundcloud: buildSearchUrl("soundcloud", track || artist, artist),
      appleMusic: buildSearchUrl("appleMusic", track || artist, artist),
      deezer: buildSearchUrl("deezer", track || artist, artist)
    }
  };
}
