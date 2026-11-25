import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../worker/index.js';
import { _resetJwksCache } from '../worker/access.js';

const TEAM = 'https://test.cloudflareaccess.com';
const AUD = 'aud1';
const enc = new TextEncoder();
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const b64uJson = (o) => b64u(enc.encode(JSON.stringify(o)));

let privateKey, jwks;
before(async () => {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  );
  privateKey = kp.privateKey;
  jwks = { keys: [{ ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
});
beforeEach(() => _resetJwksCache());

async function makeJwt(over = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64uJson({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64uJson({ aud: [AUD], iss: TEAM, exp: now + 600, nbf: now - 10, ...over });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

function makeEnv(over = {}) {
  const kv = new Map();
  return {
    PEOPLE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
    ASSETS: { fetch: async () => new Response('asset', { headers: { 'x-from': 'assets' } }) },
    TEAM_DOMAIN: TEAM,
    POLICY_AUD: AUD,
    ...over,
  };
}

const handler = createHandler({ fetchJwks: async () => jwks });
const call = async (env, { method = 'GET', body, ifMatch, jwt, path = '/api/people' } = {}) => {
  const headers = {};
  if (jwt !== null) headers['cf-access-jwt-assertion'] = jwt ?? (await makeJwt());
  if (ifMatch) headers['if-match'] = ifMatch;
  return handler(new Request('https://ziwei.example' + path, { method, headers, body }), env);
};

test('沒 JWT header → 401', async () => {
  assert.equal((await call(makeEnv(), { jwt: null })).status, 401);
});
test('aud 錯 → 401', async () => {
  assert.equal((await call(makeEnv(), { jwt: await makeJwt({ aud: ['other'] }) })).status, 401);
});
test('exp 過期 → 401', async () => {
  assert.equal((await call(makeEnv(), { jwt: await makeJwt({ exp: Math.floor(Date.now() / 1000) - 5 }) })).status, 401);
});
test('簽章被改一個字元 → 401', async () => {
  const jwt = await makeJwt();
  const i = jwt.length - 5;
  const bad = jwt.slice(0, i) + (jwt[i] === 'A' ? 'B' : 'A') + jwt.slice(i + 1);
  assert.equal((await call(makeEnv(), { jwt: bad })).status, 401);
});

test('合法：GET 空 doc → PUT 正確 If-Match → GET 一致；錯 If-Match 412；壞 JSON 400', async () => {
  const env = makeEnv();
  const g1 = await call(env);
  assert.equal(g1.status, 200);
  assert.equal(g1.headers.get('cache-control'), 'no-store');
  const j1 = await g1.json();
  assert.match(j1.version, /^[0-9a-f]{64}$/);
  assert.deepEqual(j1.doc, { format: 'ziwei-people', version: 1, people: [] });

  const envelope = { format: 'ziwei-people-enc', version: 1, kdf: { salt: 's' }, iv: 'i', data: 'd' };
  const p = await call(env, { method: 'PUT', body: JSON.stringify(envelope), ifMatch: j1.version });
  assert.equal(p.status, 200);
  const { version } = await p.json();
  assert.notEqual(version, j1.version);
  const j2 = await (await call(env)).json();
  assert.equal(j2.version, version);
  assert.deepEqual(j2.doc, envelope);

  const stale = await call(env, { method: 'PUT', body: JSON.stringify(envelope), ifMatch: j1.version });
  assert.equal(stale.status, 412);
  const sj = await stale.json();
  assert.equal(sj.version, version);
  assert.deepEqual(sj.doc, envelope);

  assert.equal((await call(env, { method: 'PUT', body: '{nope', ifMatch: version })).status, 400);
  assert.equal((await call(env, { method: 'PUT', body: JSON.stringify({ format: 'x' }), ifMatch: version })).status, 400);
});

test('非 /api 路徑 → 走 ASSETS（不驗 JWT）', async () => {
  const res = await call(makeEnv(), { path: '/chart.html', jwt: null });
  assert.equal(res.headers.get('x-from'), 'assets');
});

test('env 沒 POLICY_AUD / TEAM_DOMAIN → 500（fail-closed）', async () => {
  assert.equal((await call(makeEnv({ POLICY_AUD: undefined }))).status, 500);
  assert.equal((await call(makeEnv({ TEAM_DOMAIN: '' }))).status, 500);
});
