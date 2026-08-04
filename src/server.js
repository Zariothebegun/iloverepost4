import http from "node:http";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { json, sendError, serveStaticFile } from "./lib/http.js";
import { resolveTikTokDownload } from "./lib/downloader.js";
import { executeSearch, normalizeSearchError } from "./lib/search.js";
import { identifyMusic } from "./lib/music-identifier.js";
import { CONTENT_TYPES } from "./lib/plans.js";
import { getUserState, resolveSession } from "./lib/session-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(projectRoot, "public");
const port = Number(process.env.PORT || 3000);

const MUSIC_LIMIT = 3;

function getStaticFilePath(urlPathname) {
  const sanitizedPath =
    urlPathname === "/" ? "/index.html" : urlPathname.replace(/\\/g, "/");
  const resolved = path.normalize(path.join(publicRoot, sanitizedPath));

  if (!resolved.startsWith(publicRoot)) {
    return null;
  }

  return resolved;
}

async function handleApi(request, response, url) {
  const { session } = resolveSession(request, response);

  if (request.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/health")) {
    return json(response, 200, {
      ok: true,
      service: "iloverepost",
      timestamp: new Date().toISOString()
    });
  }

  if (request.method === "GET" && url.pathname === "/api/download") {
    const videoUrl = url.searchParams.get("url") || "";
    const playUrl = url.searchParams.get("playUrl") || "";

    if (!videoUrl) {
      return sendError(response, 400, "The `url` query parameter is required.");
    }

    try {
      const resolved = await resolveTikTokDownload(videoUrl, playUrl);

      return json(response, 200, {
        ok: true,
        ...resolved,
        account: getUserState(session)
      });
    } catch (error) {
      return json(response, 502, {
        error: error.message,
        code: "download_resolution_failed",
        account: getUserState(session)
      });
    }
  }

  if (request.method === "GET" && (url.pathname === "/api/search" || url.pathname === "/api/reposts")) {
    const username = url.searchParams.get("username") || "";
    const cursor = Number(url.searchParams.get("cursor") || "0");
    const count = Math.min(Number(url.searchParams.get("count") || "16"), 35);
    const contentType = CONTENT_TYPES.REPOSTS;
    const keyword = url.searchParams.get("keyword") || "";

    if (!username.trim()) {
      return sendError(response, 400, "The `username` query parameter is required.");
    }

    try {
      const result = await executeSearch({
        session,
        username,
        contentType,
        keyword,
        cursor,
        count
      });

      return json(response, 200, result);
    } catch (error) {
      const normalized = normalizeSearchError(error, session);
      return json(response, normalized.statusCode, {
        ...normalized.payload,
        username: username.replace(/^@+/, "")
      });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/music") {
    const videoUrl = url.searchParams.get("url") || "";

    if (!videoUrl.trim()) {
      return sendError(response, 400, "The `url` query parameter is required.");
    }

    // Rate limit: 3 per session
    if (!session.musicSearches) session.musicSearches = 0;
    if (session.musicSearches >= MUSIC_LIMIT) {
      return sendError(response, 429, `Music identification limit reached (${MUSIC_LIMIT} per session).`);
    }

    session.musicSearches += 1;

    try {
      const result = await identifyMusic(videoUrl);

      return json(response, 200, {
        ok: result.found !== false,
        ...result,
        remaining: MUSIC_LIMIT - session.musicSearches
      });
    } catch (error) {
      return json(response, 502, {
        error: error.message,
        code: "music_identification_failed",
        remaining: MUSIC_LIMIT - session.musicSearches
      });
    }
  }

  return sendError(response, 404, "API route not found.");
}

async function handleStatic(response, url) {
  const filePath = getStaticFilePath(url.pathname);

  if (!filePath) {
    return sendError(response, 400, "Invalid path.");
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }

    return await serveStaticFile(response, filePath);
  } catch {
    return await serveStaticFile(response, path.join(publicRoot, "index.html"));
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      return await handleApi(request, response, url);
    }

    return await handleStatic(response, url);
  } catch (error) {
    return sendError(response, 500, error.message || "Unexpected server error.");
  }
});

server.listen(port, () => {
  console.log(`ILOVEREPOST listening on http://localhost:${port}`);
});
