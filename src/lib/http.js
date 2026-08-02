import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

export function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

export function sendError(response, statusCode, message, extra = {}) {
  json(response, statusCode, {
    error: message,
    ...extra
  });
}

export async function serveStaticFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contents = await readFile(filePath);

  response.writeHead(200, {
    "content-type": MIME_TYPES[extension] || "application/octet-stream"
  });
  response.end(contents);
}
