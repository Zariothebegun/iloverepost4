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

// Global browser instance
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('Launching Playwright Chromium browser...');
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ]
    });
  }
  return browserInstance;
}

// Normalize username
function normalizeUsername(username) {
  return username.replace(/^@+/, "").trim();
}

// Map TikTok video item to unified structure
function mapVideoItem(item) {
  const author = item?.author ?? {};
  const video = item?.video ?? {};
  const stats = item?.stats ?? {};

  const id = item?.id || '';
  const uniqueId = author.uniqueId || author.nickname || '';

  return {
    id: id,
    videoId: id,
    caption: item?.desc || '',
    author: uniqueId,
    authorNickname: author.nickname || '',
    authorSecUid: author.secUid || '',
    authorAvatar: author.avatarThumb || author.avatarMedium || author.avatarLarger || '',
    thumbnail: video.cover || video.originCover || video.dynamicCover || '',
    playUrl: video.playAddr || video.downloadAddr || '',
    videoUrl: uniqueId 
      ? `https://www.tiktok.com/@${uniqueId}/video/${id}`
      : `https://www.tiktok.com/video/${id}`,
    duration: video.duration || 0,
    width: video.width || 0,
    height: video.height || 0,
    likes: stats.diggCount || 0,
    comments: stats.commentCount || 0,
    shares: stats.shareCount || 0,
    plays: stats.playCount || 0,
    createTime: item?.createTime || 0,
    raw: item
  };
}

// Scrape Reposts from TikTok using Playwright
async function scrapeReposts(username, keyword, scrollsCount = 2) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) {
    throw new Error('A TikTok username is required.');
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });

  const page = await context.newPage();
  const profileUrl = `https://www.tiktok.com/@${cleanUsername}`;

  const rawReposts = [];
  let profileInfo = null;

  // Intercept repost list responses
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/repost/item_list/')) {
      try {
        const json = await response.json();
        const items = json.itemList || [];
        console.log(`Intercepted /api/repost/item_list/ response containing ${items.length} items.`);
        rawReposts.push(...items);
      } catch (e) {
        console.error('Error parsing intercepted JSON:', e.message);
      }
    }
  });

  try {
    console.log(`Navigating to ${profileUrl}...`);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);

    // Extract profile info
    profileInfo = await page.evaluate(() => {
      const scriptEl = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (scriptEl) {
        try {
          const data = JSON.parse(scriptEl.textContent);
          const scope = data?.__DEFAULT_SCOPE__ ?? {};
          const userDetail = scope['webapp.user-detail'] ?? {};
          return {
            user: userDetail.userInfo?.user || null,
            stats: userDetail.userInfo?.stats || null
          };
        } catch (e) {
          return null;
        }
      }
      return null;
    });

    if (!profileInfo || !profileInfo.user) {
      profileInfo = await page.evaluate(() => {
        const nicknameEl = document.querySelector('h1[class*="ShareSubTitle"], h2[class*="ShareSubTitle"], h1[data-e2e="user-subtitle"]');
        const uniqueIdEl = document.querySelector('h2[class*="ShareTitle"], h1[class*="ShareTitle"], h2[data-e2e="user-title"]');
        const avatarEl = document.querySelector('img[class*="Avatar"], div[class*="Avatar"] img');

        return {
          user: {
            uniqueId: uniqueIdEl ? (uniqueIdEl.textContent || '').trim() : '',
            nickname: nicknameEl ? (nicknameEl.textContent || '').trim() : '',
            avatarMedium: avatarEl ? avatarEl.getAttribute('src') : '',
            verified: !!document.querySelector('svg[class*="VerifyBadg"], svg[data-e2e="verified-icon"]')
          },
          stats: {
            followerCount: 0,
            followingCount: 0,
            heart: 0,
            videoCount: 0
          }
        };
      });
    }

    // Click the "Reposts" tab
    console.log('Attempting to click the Reposts tab...');
    const clicked = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('p[role="tab"], div[role="tab"], span'));
      const repostTabKeywords = ['reposts', 'recomendações', 'repost', 'republicações', 'republicaciones', 'retweets'];
      const repostTab = tabs.find(el => {
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        return repostTabKeywords.includes(text);
      });
      if (repostTab) {
        repostTab.click();
        return true;
      }
      return false;
    });

    if (clicked) {
      console.log('Successfully clicked Reposts tab!');
      await page.waitForTimeout(3000);
    } else {
      const tabElement = page.locator('p[role="tab"]:has-text("Reposts"), p[role="tab"]:has-text("Recomendações")').first();
      if (await tabElement.count() > 0) {
        await tabElement.click();
        await page.waitForTimeout(3000);
      }
    }

    // Scroll to load more
    for (let i = 0; i < scrollsCount; i++) {
      console.log(`Scrolling down page (scroll ${i + 1}/${scrollsCount})...`);
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2500);
    }

  } catch (error) {
    console.error('Scraping error:', error.message);
    throw error;
  } finally {
    await context.close();
  }

  // Deduplicate and map
  const uniqueItemsMap = new Map();
  for (const item of rawReposts) {
    const id = item?.id || item?.videoId;
    if (id && !uniqueItemsMap.has(id)) {
      uniqueItemsMap.set(id, mapVideoItem(item));
    }
  }

  let items = Array.from(uniqueItemsMap.values());
  console.log(`Successfully collected ${items.length} unique reposts.`);

  // FILTER BY KEYWORD
  if (keyword && keyword.trim()) {
    const kw = keyword.toLowerCase().trim();
    items = items.filter(item => {
      const caption = (item.caption || '').toLowerCase();
      const author = (item.author || '').toLowerCase();
      const nickname = (item.authorNickname || '').toLowerCase();
      return caption.includes(kw) || author.includes(kw) || nickname.includes(kw);
    });
    console.log(`After keyword filter "${kw}": ${items.length} reposts remain.`);
  }

  return {
    user: {
      username: profileInfo?.user?.uniqueId || cleanUsername,
      nickname: profileInfo?.user?.nickname || cleanUsername,
      avatar: profileInfo?.user?.avatarMedium || profileInfo?.user?.avatarLarger || profileInfo?.user?.avatarThumb || '',
      verified: !!profileInfo?.user?.verified,
      followerCount: profileInfo?.stats?.followerCount || 0,
      followingCount: profileInfo?.stats?.followingCount || 0,
      heartCount: profileInfo?.stats?.heart || profileInfo?.stats?.heartCount || 0,
      videoCount: profileInfo?.stats?.videoCount || 0,
      secUid: profileInfo?.user?.secUid || ''
    },
    items: items
  };
}

// Endpoint: Fetch Reposts
app.post('/api/fetch-reposts', async (req, res) => {
  const { username, keyword, scrolls = 2 } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  try {
    const result = await scrapeReposts(username, keyword, Math.min(parseInt(scrolls) || 2, 8));
    res.json(result);
  } catch (error) {
    console.error('Error fetching reposts:', error);
    res.status(500).json({ error: error.message || 'An error occurred while fetching reposts.' });
  }
});

// Endpoint: Proxy Download (Watermark-Free)
app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Video URL is required.' });
  }

  try {
    console.log(`Fetching watermark-free download link for: ${url}`);
    const tikwmApiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const response = await fetch(tikwmApiUrl);
    const json = await response.json();

    if (json.code !== 0 || !json.data || !json.data.play) {
      throw new Error(json.msg || 'Failed to parse video from TikWM.');
    }

    const downloadUrl = json.data.play;
    console.log(`Watermark-free URL successfully resolved: ${downloadUrl}`);

    const videoResponse = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video stream from TikTok CDN. HTTP Status: ${videoResponse.status}`);
    }

    const videoId = url.split('/video/')[1]?.split('?')[0] || 'video';
    const { Readable } = require('stream');
    res.setHeader('Content-Disposition', `attachment; filename="tiktok-${videoId}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');

    Readable.fromWeb(videoResponse.body).pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message || 'An error occurred while downloading the video.' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`iLoveRepost running on http://localhost:${PORT}`);
});
