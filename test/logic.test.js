const test = require('node:test');
const assert = require('node:assert');
const { extractItems, mapVideoItem, foldText, normalizeUsername } = require('../server');

test('normalizeUsername remove @ e espacos', () => {
  assert.strictEqual(normalizeUsername(' @el_ty2'), 'el_ty2');
  assert.strictEqual(normalizeUsername('  @@el_ty2  '), 'el_ty2');
  assert.strictEqual(normalizeUsername('el_ty2'), 'el_ty2');
});
test('normalizeUsername aceita URL completa', () => {
  assert.strictEqual(normalizeUsername('https://www.tiktok.com/@el_ty2'), 'el_ty2');
  assert.strictEqual(normalizeUsername('https://tiktok.com/@el_ty2?lang=pt'), 'el_ty2');
  assert.strictEqual(normalizeUsername(undefined), '');
});
test('foldText ignora acentos e maiusculas', () => {
  assert.strictEqual(foldText('TECCA'), 'tecca');
  assert.strictEqual(foldText('Republicações'), 'republicacoes');
  assert.strictEqual(foldText(null), '');
});
test('extractItems suporta os formatos TikTok', () => {
  assert.strictEqual(extractItems({ itemList: [{ id: '1' }] }).length, 1);
  assert.strictEqual(extractItems({ items: [{ id: '1' }, { id: '2' }] }).length, 2);
  assert.strictEqual(extractItems({ aweme_list: [{ id: '9' }] }).length, 1);
  assert.strictEqual(extractItems({ itemInfo: { itemStruct: { id: '7' } } }).length, 1);
});
test('extractItems lida com payload vazio', () => {
  assert.deepStrictEqual(extractItems(null), []);
  assert.deepStrictEqual(extractItems({}), []);
});
test('mapVideoItem monta URL e campos', () => {
  const m = mapVideoItem({ id: '741', desc: 'Lil Tecca', author: { uniqueId: 'liltecca', nickname: 'Lil Tecca', avatarThumb: 'a.jpg' }, video: { cover: 'c.jpg', playAddr: 'p.mp4', duration: 30 }, stats: { diggCount: 10, playCount: 500 } });
  assert.strictEqual(m.videoUrl, 'https://www.tiktok.com/@liltecca/video/741');
  assert.strictEqual(m.caption, 'Lil Tecca'); assert.strictEqual(m.likes, 10); assert.strictEqual(m.plays, 500);
});
test('mapVideoItem aguenta objetos vazios', () => {
  const m = mapVideoItem({}); assert.strictEqual(m.caption, ''); assert.ok(m.videoUrl.startsWith('https://www.tiktok.com/'));
});
test('filtro por palavra-chave procura descricao autor e nickname', () => {
  const items = ['ransom', 'Lil Tecca ao vivo', 'nada'].map((desc, i) => mapVideoItem({ id: String(i), desc, author: { uniqueId: i === 0 ? 'liltecca' : 'other', nickname: i === 2 ? 'TECCA fan' : '' } }));
  const result = items.filter(x => ['caption', 'author', 'authorNickname'].some(k => foldText(x[k]).includes('tecca')));
  assert.deepStrictEqual(result.map(x => x.id), ['0', '1', '2']);
});
test('deduplicacao por id', () => {
  const seen = new Set(); const out = [];
  for (const item of [{ id: 'a' }, { id: 'a' }, { id: 'b' }]) if (!seen.has(item.id)) { seen.add(item.id); out.push(item); }
  assert.strictEqual(out.length, 2);
});
