const test = require('node:test');
const assert = require('node:assert');
const { app } = require('../server');
let server;
let base;

test.before(async () => {
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server?.close());
async function post(body) {
  const response = await fetch(`${base}/api/fetch-reposts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() };
}

test('health responde ok', async () => { const response = await fetch(`${base}/health`); assert.strictEqual((await response.json()).status, 'ok'); });
test('health tem content type JSON', async () => { const response = await fetch(`${base}/health`); assert.match(response.headers.get('content-type'), /json/); });
test('sem username devolve 400', async () => { assert.strictEqual((await post({})).status, 400); });
test('username nulo devolve 400', async () => { assert.strictEqual((await post({ username: null })).status, 400); });
test('mensagem de username obrigatorio e legivel', async () => { const result = await post({}); assert.strictEqual(result.json.error, 'Username is required.'); });
test('download sem URL devolve 400', async () => { const response = await fetch(`${base}/api/download`); assert.strictEqual(response.status, 400); assert.match((await response.json()).error, /URL/i); });
test('download com URL vazia devolve 400', async () => { const response = await fetch(`${base}/api/download?url=`); assert.strictEqual(response.status, 400); });
test('frontend principal responde HTML', async () => { const response = await fetch(`${base}/`); assert.strictEqual(response.status, 200); assert.match(response.headers.get('content-type'), /html/); });
test('endpoint aceita JSON e rejeita username vazio', async () => { const result = await post({ username: '' }); assert.strictEqual(result.status, 400); });
