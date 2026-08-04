import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rm } from "node:fs/promises";

const execFileAsync = promisify(execFile);

const AUDD_TOKEN = "e16e8157711e6e81397bf5a255ffd31a";
const AUDD_API = "https://api.audd.io/";

function extractSpotifyId(url) {
  if (!url) return null;
  const m = url.match(/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function getMetadataFromYtDlp(url) {
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-download",
      "--no-warnings",
      url
    ], { timeout: 25000 });

    const data = JSON.parse(stdout);
    const track = data.track || null;
    const artist = data.artist || null;

    return {
      found: Boolean(track),
      track,
      artist,
      album: data.album || null,
      thumbnail: data.thumbnail || null,
      duration: data.duration || null,
      title: data.title || null
    };
  } catch {
    return { found: false };
  }
}

async function identifyWithAudD(url) {
  const body = new URLSearchParams({
    api_token: AUDD_TOKEN,
    url: url,
    return: "spotify,apple_music,deezer"
  });

  const response = await fetch(AUDD_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(30000)
  });

  const data = await response.json();

  if (data.status === "success" && data.result) {
    const r = data.result;
    return {
      found: true,
      track: r.title || null,
      artist: r.artist || null,
      album: r.album || null,
      thumbnail: r.spotify?.album?.images?.[0]?.url || r.song_link || null,
      spotify: r.spotify?.external_urls?.spotify || null,
      appleMusic: r.apple_music?.url || null,
      deezer: r.deezer?.link || null,
      songLink: r.song_link || null
    };
  }

  return { found: false };
}

function buildSpotifySearchUrl(track, artist) {
  const q = encodeURIComponent(`${track} ${artist}`);
  return `https://open.spotify.com/search/${q}`;
}

function buildYouTubeSearchUrl(track, artist) {
  const q = encodeURIComponent(`${track} ${artist}`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

function buildSoundCloudSearchUrl(track, artist) {
  const q = encodeURIComponent(`${track} ${artist}`);
  return `https://soundcloud.com/search?q=${q}`;
}

export async function identifyMusic(tiktokUrl) {
  // Step 1: try TikTok metadata
  const meta = await getMetadataFromYtDlp(tiktokUrl);

  if (meta.found) {
    return {
      source: "tiktok_metadata",
      track: meta.track,
      artist: meta.artist,
      album: meta.album,
      thumbnail: meta.thumbnail,
      duration: meta.duration,
      links: {
        spotify: buildSpotifySearchUrl(meta.track, meta.artist),
        youtube: buildYouTubeSearchUrl(meta.track, meta.artist),
        soundcloud: buildSoundCloudSearchUrl(meta.track, meta.artist)
      }
    };
  }

  // Step 2: try AudD
  const audd = await identifyWithAudD(tiktokUrl);

  if (audd.found) {
    return {
      source: "audd_api",
      track: audd.track,
      artist: audd.artist,
      album: audd.album,
      thumbnail: audd.thumbnail,
      links: {
        spotify: audd.spotify || buildSpotifySearchUrl(audd.track, audd.artist),
        appleMusic: audd.appleMusic || null,
        deezer: audd.deezer || null,
        youtube: buildYouTubeSearchUrl(audd.track, audd.artist),
        soundcloud: buildSoundCloudSearchUrl(audd.track, audd.artist)
      }
    };
  }

  return { found: false, error: "Could not identify the music from this video." };
}
