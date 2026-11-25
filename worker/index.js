// Cloudflare Worker：靜態資產走 ASSETS，/api/people 讀寫 KV（存的是客戶端加密後的密文）。
import { verifyAccess } from './access.js';

const MAX_BODY = 5 * 1024 * 1024;
const emptyDoc = () => ({ format: 'ziwei-people', version: 1, people: [] });
const validShape = (d) =>
  !!d && ((d.format === 'ziwei-people' && Array.isArray(d.people)) ||
    (d.format === 'ziwei-people-enc' && d.data && d.iv && d.kdf));

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function current(env) {
  const text = (await env.PEOPLE.get('doc')) ?? JSON.stringify(emptyDoc());
  return { version: await sha256hex(text), doc: JSON.parse(text) };
}

// 簡化：KV 沒有 compare-and-swap，If-Match 檢查與 put 之間有極小競態窗口；
// 單人使用可接受。多人要改 Durable Object（天花板）。
async function api(request, env) {
  if (request.method === 'GET') return json(200, await current(env));
  if (request.method !== 'PUT') return json(405, { error: 'method not allowed' });
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json(413, { error: 'body too large' });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return json(413, { error: 'body too large' });
  let doc;
  try { doc = JSON.parse(text); } catch { return json(400, { error: '不是合法 JSON' }); }
  if (!validShape(doc)) return json(400, { error: '格式不符' });
  const cur = await current(env);
  const ifMatch = request.headers.get('if-match');
  if (!ifMatch || ifMatch !== cur.version) return json(412, { error: '版本不符', version: cur.version, doc: cur.doc });
  await env.PEOPLE.put('doc', text);
  return json(200, { version: await sha256hex(text) });
}

export function createHandler({ fetchJwks } = {}) {
  return async function fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname !== '/api/people') return env.ASSETS.fetch(request);
    if (!env.TEAM_DOMAIN || !env.POLICY_AUD) return json(500, { error: 'Access 未設定' }); // fail-closed
    if (!(await verifyAccess(request, env, { fetchJwks }))) return json(401, { error: 'unauthorized' });
    try {
      return await api(request, env);
    } catch (err) {
      return json(500, { error: err.message });
    }
  };
}

export default { fetch: createHandler() };
