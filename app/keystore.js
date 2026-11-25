// 「記住這台裝置」：把 non-extractable CryptoKey 存進 IndexedDB。任何失敗都當作沒有。
const open = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open('ziwei', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', mode);
      const req = fn(tx.objectStore('keys'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getRemembered() {
  try { return (await run('readonly', (s) => s.get('main'))) || null; } catch { return null; }
}
export async function remember(key, kdf) {
  try { await run('readwrite', (s) => s.put({ key, kdf }, 'main')); return true; } catch { return false; }
}
export async function forget() {
  try { await run('readwrite', (s) => s.delete('main')); } catch { /* 沒有就算了 */ }
}
