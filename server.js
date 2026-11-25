// 本機伺服器：靜態檔 + /api/people 讀寫 data/people.json。只綁 127.0.0.1，單人用。
import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 5 * 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};
const BLOCKED_TOP = new Set(['data', 'server.js', 'worker', 'wrangler.jsonc', '.assetsignore']);
const validShape = (d) =>
  !!d && ((d.format === 'ziwei-people' && Array.isArray(d.people)) ||
    (d.format === 'ziwei-people-enc' && d.data && d.iv && d.kdf));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const emptyDoc = () => ({ format: 'ziwei-people', version: 1, people: [] });

// 簡化：module 級全域鎖，把所有 PUT 串成一條。單人、單機夠用；
// 多人／多進程時要改成檔案鎖或 DB（天花板）。
let chain = Promise.resolve();
const locked = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createApp({ rootDir = HERE, dataFile } = {}) {
  rootDir = path.resolve(rootDir);
  dataFile = dataFile || path.join(rootDir, 'data', 'people.json');

  async function current() {
    try {
      const text = await readFile(dataFile, 'utf8');
      return { version: sha(text), doc: JSON.parse(text) };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      const doc = emptyDoc();
      return { version: sha(JSON.stringify(doc)), doc };
    }
  }

  async function api(req, res) {
    if (req.method === 'GET') return send(res, 200, await current());
    if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' });
    let text;
    try { text = await readBody(req); } catch (err) { return send(res, err.status || 400, { error: err.message }); }
    let doc;
    try { doc = JSON.parse(text); } catch { return send(res, 400, { error: '不是合法 JSON' }); }
    if (!validShape(doc)) {
      return send(res, 400, { error: '格式不符（需要 ziwei-people 加 people 陣列，或 ziwei-people-enc 加 kdf/iv/data）' });
    }
    const ifMatch = req.headers['if-match'];
    return locked(async () => {
      const cur = await current();
      if (!ifMatch || ifMatch !== cur.version) {
        return send(res, 412, { error: '版本不符', version: cur.version, doc: cur.doc });
      }
      const out = JSON.stringify(doc, null, 1);
      await mkdir(path.dirname(dataFile), { recursive: true });
      const tmp = dataFile + '.tmp';
      await writeFile(tmp, out);
      await rename(tmp, dataFile);
      return send(res, 200, { version: sha(out) });
    });
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'bad request', 'text/plain'); }
    if (rel.includes('\0')) return send(res, 400, 'bad request', 'text/plain');
    if (rel === '/') rel = '/chart.html';
    const abs = path.resolve(rootDir, '.' + path.posix.normalize(rel));
    const sub = path.relative(rootDir, abs);
    const parts = sub.split(path.sep);
    if (!sub || sub.startsWith('..') || path.isAbsolute(sub)) return send(res, 404, 'not found', 'text/plain');
    if (BLOCKED_TOP.has(parts[0]) || parts.some((p) => p.startsWith('.'))) return send(res, 404, 'not found', 'text/plain');
    try {
      const buf = await readFile(abs);
      return send(res, 200, req.method === 'HEAD' ? '' : buf, TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream');
    } catch {
      return send(res, 404, 'not found', 'text/plain');
    }
  }

  return async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://127.0.0.1');
      if (pathname === '/api/people') return await api(req, res);
      return await serveStatic(req, res, pathname);
    } catch (err) {
      if (!res.headersSent) send(res, 500, { error: err.message });
      else res.end();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 8765;
  http.createServer(createApp({})).listen(port, '127.0.0.1', () => {
    console.log(`紫微排盤：http://127.0.0.1:${port}/`);
  });
}
