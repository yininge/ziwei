// 驗 Cloudflare Access JWT（RS256），純 Web Crypto。任何內部錯誤都回 false，不 throw。
const JWKS_TTL_MS = 3600 * 1000;
let cache = { url: '', at: 0, keys: [] }; // 簡化：module 級快取，isolate 重啟就重抓

const b64uBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const b64uJson = (s) => JSON.parse(new TextDecoder().decode(b64uBytes(s)));

const defaultFetchJwks = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  return res.json();
};

async function findKey(url, kid, fetchJwks, now) {
  const stale = cache.url !== url || now - cache.at > JWKS_TTL_MS;
  const hit = () => cache.keys.find((k) => k.kid === kid);
  if (!stale && hit()) return hit();
  // 找不到 kid 但 1 分鐘內才抓過 → 不重抓，免得亂送 kid 的請求每次都打 certs endpoint
  if (!stale && now - cache.at < 60 * 1000) return undefined;
  // 過期、或找不到 kid（金鑰輪替）→ 重抓一次
  cache = { url, at: now, keys: (await fetchJwks(url)).keys || [] };
  return hit();
}

export async function verifyAccess(request, env, { fetchJwks = defaultFetchJwks } = {}) {
  try {
    const jwt = request.headers.get('cf-access-jwt-assertion');
    if (!jwt) return false;
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const header = b64uJson(parts[0]);
    if (header.alg !== 'RS256') return false;
    const nowMs = Date.now();
    const jwk = await findKey(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`, header.kid, fetchJwks, nowMs);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64uBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return false;
    const p = b64uJson(parts[1]);
    const now = Math.floor(nowMs / 1000);
    const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (!aud.includes(env.POLICY_AUD)) return false;
    if (p.iss !== env.TEAM_DOMAIN) return false;
    if (!(p.exp > now)) return false;
    if (p.nbf !== undefined && !(p.nbf <= now)) return false;
    return true;
  } catch {
    return false;
  }
}

// 測試用：清掉 JWKS 快取
export const _resetJwksCache = () => { cache = { url: '', at: 0, keys: [] }; };
