import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomSalt, deriveKey, encryptDoc, decryptDoc, isEncrypted, ENC_FORMAT } from '../app/crypto.js';

const doc = { format: 'ziwei-people', version: 1, people: [{ id: 'a', name: '甲，含中文與 emoji 🌙' }] };
const ITER = 1000; // 測試用，正式是 600000
const salt = randomSalt();
const kdf = { salt, iterations: ITER };

test('加密→解密還原；envelope 欄位與 JSON round-trip', async () => {
  const key = await deriveKey('correct horse', salt, ITER);
  const env = await encryptDoc(doc, key, kdf);
  assert.equal(env.format, ENC_FORMAT);
  assert.equal(env.kdf.iterations, ITER);
  assert.ok(isEncrypted(env) && !isEncrypted(doc));
  assert.deepEqual(await decryptDoc(JSON.parse(JSON.stringify(env)), key), doc);
});

test('錯 passphrase → throw', async () => {
  const env = await encryptDoc(doc, await deriveKey('right', salt, ITER), kdf);
  await assert.rejects(decryptDoc(env, await deriveKey('wrong', salt, ITER)), /passphrase 錯誤或資料損毀/);
});

test('同 doc 兩次加密 iv 與 data 都不同', async () => {
  const key = await deriveKey('x', salt, ITER);
  const a = await encryptDoc(doc, key, kdf);
  const b = await encryptDoc(doc, key, kdf);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});
