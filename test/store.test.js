import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

const rootDir = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-store-'));
const dataFile = path.join(tmp, 'sub', 'people.json'); // 目錄一開始不存在
let server, base;

before(async () => {
  server = http.createServer(createApp({ rootDir, dataFile }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const get = (p = '/api/people') => fetch(base + p);
const put = (body, ifMatch) =>
  fetch(base + '/api/people', {
    method: 'PUT',
    headers: ifMatch ? { 'If-Match': ifMatch } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const doc1 = { format: 'ziwei-people', version: 1, people: [{ id: 'a', name: '甲' }] };

test('GET 無檔 → 空 doc，不建檔', async () => {
  const res = await get();
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(j.doc, { format: 'ziwei-people', version: 1, people: [] });
  assert.match(j.version, /^[0-9a-f]{64}$/);
  assert.equal(fs.existsSync(path.join(tmp, 'sub')), false);
});

let v1;
test('PUT 正確 If-Match → 寫入，GET 一致，無 .tmp', async () => {
  const { version } = await (await get()).json();
  const res = await put(doc1, version);
  assert.equal(res.status, 200);
  v1 = (await res.json()).version;
  assert.notEqual(v1, version);
  const j = await (await get()).json();
  assert.deepEqual(j.doc, doc1);
  assert.equal(j.version, v1);
  assert.deepEqual(fs.readdirSync(path.dirname(dataFile)), ['people.json']);
});

test('PUT 錯 If-Match / 缺 If-Match → 412，檔案不變', async () => {
  const before = fs.readFileSync(dataFile, 'utf8');
  for (const im of ['wrong', undefined]) {
    const res = await put({ ...doc1, people: [] }, im);
    assert.equal(res.status, 412);
    const j = await res.json();
    assert.equal(j.version, v1);
    assert.deepEqual(j.doc, doc1);
  }
  assert.equal(fs.readFileSync(dataFile, 'utf8'), before);
});

test('PUT 壞 JSON、format 錯、people 非陣列 → 400，檔案不變', async () => {
  const before = fs.readFileSync(dataFile, 'utf8');
  assert.equal((await put('{nope', v1)).status, 400);
  assert.equal((await put({ format: 'x', people: [] }, v1)).status, 400);
  assert.equal((await put({ format: 'ziwei-people', people: {} }, v1)).status, 400);
  assert.equal(fs.readFileSync(dataFile, 'utf8'), before);
});

test('不能讀到 server.js、data/、.git', async () => {
  // fetch 會幫忙 normalize 路徑，所以用 raw http 送 /../server.js
  const raw = (p) =>
    new Promise((resolve, reject) => {
      const u = new URL(base);
      http.get({ host: u.hostname, port: u.port, path: p }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      }).on('error', reject);
    });
  for (const p of ['/../server.js', '/server.js', '/data/people.json', '/%2e%2e/server.js', '/.git/HEAD']) {
    const r = await raw(p);
    assert.ok([403, 404].includes(r.status), `${p} → ${r.status}`);
    assert.ok(!r.body.includes('createApp'));
  }
});

test('GET /chart.html → 200 text/html；/ 也是', async () => {
  for (const p of ['/chart.html', '/']) {
    const res = await get(p);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/html/);
  }
});
