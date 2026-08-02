const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const scenario = { items: [], tabFound: true, bodyText: '', secUid: 'SEC123', apiItems: [], domItems: [] };
const makeItem = (id, desc, uniqueId) => ({ id, desc, author: { uniqueId, nickname: uniqueId, secUid: 'SEC123' }, video: { cover: `${id}.jpg` }, stats: {} });
const fakePage = { handlers: {}, on(e, fn) { this.handlers[e] = fn; }, async goto() {}, async waitForTimeout() {}, async evaluate(fn) {
  const src = fn.toString();
  if (src.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) return { user: { uniqueId: 'el_ty2', nickname: 'Ty', secUid: scenario.secUid, avatarMedium: 'av.jpg' }, stats: { followerCount: 406, followingCount: 599 } };
  if (src.includes('notFound')) return { notFound: /nao existe/.test(scenario.bodyText), private: /privada/.test(scenario.bodyText), captcha: false };
  if (src.includes('const words')) return scenario.tabFound ? 'reposts' : null;
  if (src.includes('scrollTo')) return null;
  if (src.includes('api/repost/item_list')) return scenario.apiItems;
  if (src.includes('a[href*=')) return scenario.domItems;
  return null;
} };
const fakeContext = { async addInitScript() {}, async newPage() { return fakePage; }, async close() {} };
const fakeBrowser = { isConnected: () => true, async newContext() { return fakeContext; } };
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...rest) { if (request === 'playwright') return 'playwright-stub'; return originalResolve.call(this, request, ...rest); };
require.cache['playwright-stub'] = { id: 'playwright-stub', filename: 'playwright-stub', loaded: true, exports: { chromium: { launch: async () => fakeBrowser } } };
const { app } = require('../server');
let server, base;
test.before(async () => { await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); }); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server?.close());
async function post(body) { const r = await fetch(`${base}/api/fetch-reposts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; }
test('health responde ok', async () => { const r = await fetch(`${base}/health`); assert.strictEqual((await r.json()).status, 'ok'); });
test('sem username devolve 400', async () => { assert.strictEqual((await post({})).status, 400); });
test('interceptacao devolve reposts e perfil', async () => { scenario.tabFound = true; setTimeout(() => fakePage.handlers.response?.({ url: () => 'https://www.tiktok.com/api/repost/item_list/?x=1', json: async () => ({ itemList: [makeItem('1', 'Lil Tecca', 'liltecca'), makeItem('2', 'gato', 'cat'), makeItem('3', 'TECCA', 'show')] }) }), 250); const r = await post({ username: ' @el_ty2', scrolls: 1 }); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.items.length, 3); assert.strictEqual(r.json.user.followerCount, 406); });
test('filtro e totalFound funcionam', async () => {
  setTimeout(() => fakePage.handlers.response?.({
    url: () => 'https://www.tiktok.com/api/repost/item_list/',
    json: async () => ({ itemList: [makeItem('10', 'Lil Tecca', 'liltecca'), makeItem('11', 'gato', 'cat'), makeItem('12', 'TECCA', 'show')] })
  }), 250);
  const r = await post({ username: 'el_ty2', keyword: 'tecca', scrolls: 1 });
  assert.strictEqual(r.json.items.length, 2); assert.strictEqual(r.json.totalFound, 3);
});
test('fallback usa API direta', async () => { scenario.tabFound = false; scenario.apiItems = [makeItem('20', 'Tecca', 'liltecca')]; scenario.domItems = []; const r = await post({ username: 'el_ty2', scrolls: 1 }); assert.strictEqual(r.json.items.length, 1); assert.ok(r.json.debug.strategies.some(s => s.startsWith('api-direct'))); });
test('fallback final le DOM', async () => { scenario.apiItems = []; scenario.domItems = [makeItem('30', 'Tecca', 'liltecca')]; const r = await post({ username: 'el_ty2', scrolls: 1 }); assert.strictEqual(r.json.items.length, 1); assert.ok(r.json.debug.strategies.some(s => s.startsWith('dom-fallback'))); });
test('perfil inexistente devolve erro claro', async () => { scenario.bodyText = 'nao existe'; scenario.domItems = []; const r = await post({ username: 'missing' }); scenario.bodyText = ''; assert.strictEqual(r.status, 500); assert.match(r.json.error, /nao existe/i); });
test('conta privada devolve mensagem propria', async () => { scenario.bodyText = 'privada'; const r = await post({ username: 'private' }); scenario.bodyText = ''; assert.strictEqual(r.status, 500); assert.match(r.json.error, /privada/i); });
test('duplicados sao removidos', async () => { scenario.tabFound = true; scenario.apiItems = []; scenario.domItems = []; const response = { url: () => 'https://www.tiktok.com/api/repost/item_list/', json: async () => ({ itemList: [makeItem('40', 'Tecca', 'liltecca')] }) }; setTimeout(() => fakePage.handlers.response?.(response), 200); setTimeout(() => fakePage.handlers.response?.(response), 350); const r = await post({ username: 'el_ty2', scrolls: 1 }); assert.strictEqual(r.json.items.length, 1); });
