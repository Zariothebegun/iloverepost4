const express = require('express');
const { searchTikTokProfile, closeBrowser: closeTikTokBrowser, extractItems, mapVideoItem, normalizeSearchText, normalizeUsername } = require('./tiktok-api');
const foldText = normalizeSearchText;
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function scrapeReposts(username, keyword, scrollsCount = 2) {
  return searchTikTokProfile({
    username,
    keyword: keyword || '',
    count: 20,
    pagesToFetch: Math.min(Math.max(Number(scrollsCount) || 2, 1), 8)
  });
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
  const shutdown = async signal => { console.log(`Received ${signal}, shutting down...`); try { await closeTikTokBrowser(); } catch (e) { console.error('Error closing browser:', e.message); } server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, extractItems, mapVideoItem, foldText, normalizeUsername };
