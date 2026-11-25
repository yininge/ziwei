// 前端資料存取：只打 /api/people。
async function fail(res) {
  const body = await res.json().catch(() => ({}));
  if (res.status === 412) {
    throw Object.assign(new Error('conflict'), { code: 'conflict', version: body.version, doc: body.doc });
  }
  throw new Error(body.error || `伺服器回應 ${res.status}`);
}

export async function load() {
  const res = await fetch('/api/people');
  if (!res.ok) await fail(res);
  const j = await res.json();
  return { version: j.version, raw: j.doc }; // raw：明文 doc、密文 envelope 或空 doc；加解密在 main
}

export async function save(docOrEnvelope, ifVersion) {
  const res = await fetch('/api/people', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': ifVersion },
    body: JSON.stringify(docOrEnvelope),
  });
  if (!res.ok) await fail(res);
  return (await res.json()).version;
}
