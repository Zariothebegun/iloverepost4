const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let browserInstance = null;
async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('Launching Playwright Chromium browser...');
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu']
    });
  }
  return browserInstance;
}

function normalizeUsername(username) {
  return String(username || '').trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
    .replace(/^@+/, '').split(/[/?#]/)[0].trim();
}

function mapVideoItem(item) {
  const author = item?.author ?? {};
  const video = item?.video ?? {};
  const stats = item?.stats ?? {};
  const id = item?.id || item?.video_id || item?.aweme_id || '';
  const uniqueId = author.uniqueId || author.unique_id || author.nickname || '';
  return {
    id, videoId: id, caption: item?.desc || '', author: uniqueId,
    authorNickname: author.nickname || '', authorSecUid: author.secUid || author.sec_uid || '',
    authorAvatar: author.avatarThumb || author.avatarMedium || author.avatarLarger || '',
    thumbnail: video.cover || video.originCover || video.dynamicCover || '',
    playUrl: video.playAddr || video.downloadAddr || '',
    videoUrl: uniqueId ? `https://www.tiktok.com/@${uniqueId}/video/${id}` : `https://www.tiktok.com/video/${id}`,
    duration: video.duration || 0, width: video.width || 0, height: video.height || 0,
    likes: stats.diggCount || 0, comments: stats.commentCount || 0,
    shares: stats.shareCount || 0, plays: stats.playCount || 0,
    createTime: item?.createTime || 0, raw: item
  };
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
];
function pickUserAgent() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function foldText(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

function extractItems(json) {
  if (!json || typeof json !== 'object') return [];
  const out = [];
  for (const bucket of [json.itemList, json.items, json.aweme_list, json.item_list, json.videoList]) {
    if (Array.isArray(bucket)) out.push(...bucket);
  }
  if (json.itemInfo?.itemStruct) out.push(json.itemInfo.itemStruct);
  return out.filter(Boolean);
}

async function waitForItems(getCount, timeoutMs = 12000, stepMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let last = getCount();
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, stepMs));
    const now = getCount();
    if (now > last) return true;
    last = now;
  }
  return getCount() > 0;
}

async function scrapeReposts(username, keyword, scrollsCount = 2) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) throw new Error('A TikTok username is required.');
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: pickUserAgent(), viewport: { width: 1280, height: 900 }, locale: 'en-US',
    timezoneId: 'Europe/Lisbon', deviceScaleFactor: 1,
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8' }
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'pt'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {} };
    const originalQuery = navigator.permissions?.query;
    if (originalQuery) navigator.permissions.query = params => params.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission }) : originalQuery.call(navigator.permissions, params);
  });
  const page = await context.newPage();
  const profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
  const rawReposts = [], seenIds = new Set();
  const responseTasks = new Set();
  let profileInfo = null, secUid = '';
  let latestCursor = null;
  let latestHasMore = true;
  const debug = { intercepted: 0, requests: 0, strategies: [] };
  function pushItems(items, source) {
    let added = 0;
    for (const item of items || []) {
      const id = item?.id || item?.video_id || item?.aweme_id;
      if (id && !seenIds.has(String(id))) { seenIds.add(String(id)); rawReposts.push(item); added++; }
    }
    if (added) { debug.strategies.push(`${source}:+${added}`); console.log(`[${source}] +${added} itens (total ${rawReposts.length})`); }
    return added;
  }
  // O navegador faz a request completa sozinho. Nós apenas observamos a
  // request/response real, incluindo todos os tokens e parâmetros dinâmicos.
  page.on('request', request => {
    if (request.url().includes('/api/repost/item_list/')) {
      debug.requests++;
      console.log('[repost request]', request.url().split('?')[0]);
    }
  });
  page.on('response', response => {
    if (!response.url().includes('/api/repost/item_list/')) return;
    const task = (async () => {
      try {
        const json = await response.json();
        debug.intercepted++;
        latestCursor = json?.cursor ?? latestCursor;
        latestHasMore = json?.hasMore === true;
        // A lista vem da resposta criada pelo TikTok; não reconstruímos a URL.
        pushItems(Array.isArray(json?.itemList) ? json.itemList : extractItems(json), 'browser-response');
      } catch (_) { /* resposta não JSON ou já consumida */ }
    })().finally(() => responseTasks.delete(task));
    responseTasks.add(task);
  });

  try {
    console.log(`A abrir ${profileUrl} ...`);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    profileInfo = await page.evaluate(() => {
      const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (!el) return null;
      try {
        const scope = JSON.parse(el.textContent)?.__DEFAULT_SCOPE__ || {};
        const detail = scope['webapp.user-detail'] || {};
        return { user: detail.userInfo?.user || null, stats: detail.userInfo?.stats || null };
      } catch (_) { return null; }
    });
    if (!profileInfo?.user) profileInfo = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      const nick = q('h1[data-e2e="user-subtitle"], h2[class*="ShareSubTitle"]');
      const uid = q('h2[data-e2e="user-title"], h1[class*="ShareTitle"]');
      const av = q('img[class*="Avatar"], div[class*="Avatar"] img');
      return { user: { uniqueId: uid?.textContent.trim() || '', nickname: nick?.textContent.trim() || '', avatarMedium: av?.getAttribute('src') || '', verified: !!q('svg[data-e2e="verified-icon"]') }, stats: {} };
    });
    secUid = profileInfo?.user?.secUid || '';
    const pageState = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return { notFound: /Couldn't find this account|Nao foi possivel encontrar esta conta|nao existe/i.test(t), private: /This account is private|Esta conta e privada|conta privada/i.test(t), captcha: !!document.querySelector('.captcha_verify_container, #captcha-verify-image') };
    });
    if (pageState.notFound) throw new Error(`O perfil @${cleanUsername} nao existe ou foi removido.`);
    if (pageState.captcha) throw new Error('O TikTok mostrou um CAPTCHA. Tenta novamente daqui a pouco.');
    if (pageState.private) throw new Error(`A conta @${cleanUsername} e privada, nao da para ler os reposts.`);

    // Fecha popups comuns sem depender de coordenadas do rato.
    await page.evaluate(() => {
      const labels = ['Accept all', 'Accept', 'Allow all', 'Fechar', 'Close', 'Agora não', 'Not now'];
      for (const el of Array.from(document.querySelectorAll('button, [role="button"]'))) {
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (labels.some(label => text === label.toLowerCase())) el.click();
      }
    });

    // Clica na aba visível como um utilizador; não usa coordenadas nem API.
    const tabClicked = await page.evaluate(() => {
      const words = ['reposts', 'repost', 'republicações', 'republicacoes', 'republicaciones', 'reposteos', 'partilhas', 'reenvios'];
      for (const el of Array.from(document.querySelectorAll('[role="tab"], a, button, p, span, div'))) {
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (text && text.length < 24 && words.includes(text)) {
          const target = el.closest('[role="tab"], a, button') || el;
          target.click();
          return text;
        }
      }
      return null;
    });
    if (tabClicked) {
      debug.strategies.push(`visual-tab:${tabClicked}`);
      await waitForItems(() => rawReposts.length, 3000, 300);
    } else {
      debug.strategies.push('visual-tab:none');
      // Continua a ser navegação normal do browser, não uma chamada de API.
      try {
        await page.goto(`${profileUrl}/repost`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(1800);
      } catch (_) {}
    }

    // Paginação natural: scroll/mouse wheel faz o próprio TikTok pedir a
    // página seguinte. O cursor e hasMore são lidos apenas da resposta real.
    const maxScrolls = Math.min(Math.max(Number(scrollsCount) || 2, 1), 8);
    let unchanged = 0;
    for (let i = 0; i < maxScrolls && (i === 0 || latestHasMore); i++) {
      const before = rawReposts.length;
      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(1500);
      await waitForItems(() => rawReposts.length, 2500, 300);
      await Promise.allSettled([...responseTasks]);
      if (rawReposts.length === before) unchanged++; else unchanged = 0;
      if (unchanged >= 2 || (!latestHasMore && rawReposts.length === before)) break;
    }
    await Promise.allSettled([...responseTasks]);

    // Último recurso: ler os cartões renderizados no DOM, sem endpoint.
    if (rawReposts.length === 0) {
      const domItems = await page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/video/"]')).map(a => {
        const match = (a.getAttribute('href') || '').match(/@([\w.-]+)\/video\/(\d+)/); if (!match) return null;
        const container = a.closest('div[class*="DivItemContainer"], div[data-e2e*="item"], article') || a.parentElement;
        const img = container?.querySelector('img'); const cap = container?.querySelector('[data-e2e*="desc"], [class*="Desc"], [class*="desc"]');
        return { id: match[2], desc: cap?.textContent.trim() || img?.getAttribute('alt') || '', author: { uniqueId: match[1] }, video: { cover: img?.getAttribute('src') || '' }, stats: {} };
      }).filter(Boolean));
      pushItems(domItems, 'dom-visible');
    }
  } catch (error) { console.error('Erro de scraping:', error.message); if (!rawReposts.length) throw error; }
  finally { await context.close().catch(() => {}); }
  let items = rawReposts.map(mapVideoItem);
  const totalFound = items.length;
  if (keyword && keyword.trim()) { const kw = foldText(keyword); items = items.filter(item => foldText(item.caption).includes(kw) || foldText(item.author).includes(kw) || foldText(item.authorNickname).includes(kw)); }
  return { user: { username: profileInfo?.user?.uniqueId || cleanUsername, nickname: profileInfo?.user?.nickname || cleanUsername, avatar: profileInfo?.user?.avatarMedium || profileInfo?.user?.avatarLarger || profileInfo?.user?.avatarThumb || '', verified: !!profileInfo?.user?.verified, followerCount: profileInfo?.stats?.followerCount || 0, followingCount: profileInfo?.stats?.followingCount || 0, heartCount: profileInfo?.stats?.heart || profileInfo?.stats?.heartCount || 0, videoCount: profileInfo?.stats?.videoCount || 0, secUid }, totalFound, debug, items };
}

function friendlyError(error) {
  const msg = error?.message || '';
  if (/Executable doesn't exist|Please update docker image/i.test(msg)) return 'O browser (Chromium) nao esta instalado no servidor. Faz redeploy: o build tem de correr "npx playwright install --with-deps chromium".';
  if (/net::ERR|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|getaddrinfo/i.test(msg)) return 'Nao consegui chegar ao TikTok a partir do servidor. Verifica a ligacao e tenta outra vez.';
  if (/Timeout|timed out/i.test(msg)) return 'O TikTok demorou demasiado a responder. Tenta de novo, ou usa menos scrolls.';
  if (/Target closed|Browser has been closed|crashed/i.test(msg)) return 'O browser fechou a meio (o plano gratuito tem pouca memoria). Tenta com menos scrolls.';
  return msg || 'Ocorreu um erro ao procurar os reposts.';
}

app.post('/api/fetch-reposts', async (req, res) => {
  const { username, keyword, scrolls = 2 } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username is required.' });
  try { res.json(await scrapeReposts(username, keyword, Math.min(parseInt(scrolls, 10) || 2, 8))); }
  catch (error) { console.error('Error fetching reposts:', error); res.status(500).json({ error: friendlyError(error) }); }
});

app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Video URL is required.' });
  try {
    const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`); const json = await response.json();
    if (json.code !== 0 || !json.data?.play) throw new Error(json.msg || 'Failed to parse video from TikWM.');
    const videoResponse = await fetch(json.data.play, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!videoResponse.ok) throw new Error(`Failed to fetch video stream from TikTok CDN. HTTP Status: ${videoResponse.status}`);
    const { Readable } = require('stream'); res.setHeader('Content-Disposition', `attachment; filename="tiktok-${url.split('/video/')[1]?.split('?')[0] || 'video'}.mp4"`); res.setHeader('Content-Type', 'video/mp4'); Readable.fromWeb(videoResponse.body).pipe(res);
  } catch (error) { console.error('Download error:', error); if (!res.headersSent) res.status(500).json({ error: error.message || 'An error occurred while downloading the video.' }); }
});
app.get('/health', (req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', () => console.log(`iLoveRepost running on http://localhost:${PORT}`));
  const shutdown = async signal => { console.log(`Received ${signal}, shutting down...`); try { if (browserInstance?.isConnected()) await browserInstance.close(); } catch (e) { console.error('Error closing browser:', e.message); } server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, extractItems, mapVideoItem, foldText, normalizeUsername };
