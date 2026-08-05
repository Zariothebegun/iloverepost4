import { LRUCache } from "lru-cache";

// ========== CONFIG ==========
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const JITTER_MIN_MS = 2000;
const JITTER_MAX_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 3000;

// ========== CACHE ==========
const apiCache = new LRUCache({
  max: 500,
  ttl: CACHE_TTL_MS,
  updateAgeOnGet: true
});

export function getCacheKey(url, extra = "") {
  return `${url}${extra ? `|${extra}` : ""}`;
}

export function getCached(key) {
  return apiCache.get(key);
}

export function setCached(key, value) {
  apiCache.set(key, value);
}

export function getCacheStats() {
  return { size: apiCache.size, ttl: CACHE_TTL_MS };
}

// ========== JITTER DELAY ==========
export function jitterDelay(min = JITTER_MIN_MS, max = JITTER_MAX_MS) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== EXPONENTIAL BACKOFF RETRY ==========
export async function withRetry(operation, options = {}) {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const baseDelay = options.baseDelay ?? RETRY_BASE_DELAY_MS;
  const factor = options.factor ?? 2;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const tiktokCode = extractTikTokStatusCode(error);
      const isRetryable =
        error.message?.includes("fetch failed") ||
        error.message?.includes("timeout") ||
        error.message?.includes("blocked") ||
        tiktokCode === 100004 ||
        (error.status >= 500 && error.status < 600);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      if (!shouldRetry(error, attempt)) {
        throw error;
      }

      const delay = baseDelay * Math.pow(factor, attempt - 1);
      const jitteredDelay = delay + Math.floor(Math.random() * 1000);

      console.log(
        `[SHIELD] Retry ${attempt}/${maxRetries} after ${jitteredDelay}ms. ` +
          `Error: ${error.message?.slice(0, 100)}`
      );

      await new Promise((r) => setTimeout(r, jitteredDelay));
    }
  }

  throw lastError;
}

function extractTikTokStatusCode(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  const match = message.match(/\((\d+)\)/);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

// ========== USER-AGENT ROTATION ==========
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"
];

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ========== HEADER BUILDER (enhanced) ==========
export function buildShieldedHeaders(baseHeaders = {}) {
  const ua = getRandomUserAgent();
  const isChrome = ua.includes("Chrome");
  const isFirefox = ua.includes("Firefox");
  const isSafari = ua.includes("Safari") && !ua.includes("Chrome");

  let secChUa = '"Chromium";v="145", "Not.A/Brand";v="24"';
  if (isFirefox) secChUa = undefined;
  if (isSafari) secChUa = undefined;

  return {
    "user-agent": ua,
    accept:
      "text/html,application/json,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,pt-PT;q=0.8",
    "accept-encoding": "gzip, deflate, br",
    "cache-control": "no-cache",
    pragma: "no-cache",
    ...(secChUa ? { "sec-ch-ua": secChUa } : {}),
    "sec-ch-ua-mobile": "?0",
    ...(secChUa ? { "sec-ch-ua-platform": '"Windows"' } : {}),
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "upgrade-insecure-requests": "1",
    ...baseHeaders
  };
}

// ========== PROXY ROTATION (free proxies) ==========
let proxyPool = [];
let lastProxyFetch = 0;

const PROXY_SOURCES = [
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text"
];

export async function refreshProxyPool() {
  if (Date.now() - lastProxyFetch < 60000 && proxyPool.length > 5) {
    return proxyPool;
  }

  for (const source of PROXY_SOURCES) {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(8000) });
      const text = await res.text();
      const lines = text
        .split("\n")
        .filter((l) => l.includes(":") && l.startsWith("http"));
      proxyPool = lines.map((l) => l.trim()).filter(Boolean);
      lastProxyFetch = Date.now();

      if (proxyPool.length > 5) break;
    } catch (e) {
      console.log(`[SHIELD] Proxy source failed: ${source}`);
    }
  }

  return proxyPool;
}

export function getRandomProxy() {
  if (proxyPool.length === 0) return null;
  return proxyPool[Math.floor(Math.random() * proxyPool.length)];
}

export function getProxyStats() {
  return { count: proxyPool.length, lastFetch: lastProxyFetch };
}

// ========== SHIELDED FETCH (wraps native fetch) ==========
export async function shieldedFetch(url, options = {}) {
  const cacheKey = getCacheKey(url, options.cacheExtra || "");

  // Check cache first
  if (!options.skipCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`[SHIELD] Cache hit for ${url.slice(0, 80)}...`);
      return cached;
    }
  }

  // Jitter before request
  await jitterDelay();

  // Build shielded headers
  const headers = buildShieldedHeaders(options.headers || {});

  // Retry wrapper
  const doFetch = async () => {
    const fetchOptions = {
      ...options,
      headers,
      signal: AbortSignal.timeout(options.timeout || 15000)
    };

    // Remove shield-specific options before passing to fetch
    delete fetchOptions.skipCache;
    delete fetchOptions.cacheExtra;
    delete fetchOptions.timeout;

    const response = await fetch(url, fetchOptions);

    if (response.status === 403 || response.status === 429) {
      const error = new Error(`TikTok blocked request (${response.status})`);
      error.status = response.status;
      throw error;
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response;
  };

  const response = await withRetry(doFetch, {
    shouldRetry: (error) => {
      return (
        error.status === 403 ||
        error.status === 429 ||
        error.message?.includes("blocked") ||
        error.message?.includes("fetch failed")
      );
    }
  });

  // Parse and cache JSON
  const clone = response.clone();
  const data = await clone.json();

  if (!options.skipCache) {
    setCached(cacheKey, data);
  }

  return data;
}

// ========== STATS ==========
export function getShieldStats() {
  return {
    cache: getCacheStats(),
    proxies: getProxyStats(),
    userAgents: USER_AGENTS.length
  };
}
