import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_DOC, newPerson, findPerson, upsertPerson, removePerson,
  linksOf, consultationsOf, search, relationSuggestions,
} from '../app/model.js';

function setup() {
  let doc = EMPTY_DOC();
  const a = newPerson({ name: '阿甲', tags: ['客戶'] });
  const b = newPerson({ name: '阿乙' });
  const c = newPerson({ name: '阿丙' });
  doc = upsertPerson(upsertPerson(upsertPerson(doc, a), b), c);
  return { doc, a, b, c };
}

test('linksOf 反向推導；來源移除後消失', () => {
  let { doc, a, b } = setup();
  doc = upsertPerson(doc, { ...findPerson(doc, a.id), links: [{ id: b.id, relation: '配偶', note: '' }] });
  assert.deepEqual(linksOf(doc, a.id).map((l) => [l.id, l.direction, l.relation]), [[b.id, 'out', '配偶']]);
  assert.deepEqual(linksOf(doc, b.id).map((l) => [l.id, l.direction, l.relation, l.name]), [[a.id, 'in', '配偶', '阿甲']]);
  doc = upsertPerson(doc, { ...findPerson(doc, a.id), links: [] });
  assert.equal(linksOf(doc, b.id).length, 0);
  assert.deepEqual(relationSuggestions(doc), []);
});

test('consultationsOf：合盤記錄只一份、標 ownerId、新到舊', () => {
  let { doc, a, b } = setup();
  const mk = (id, date, w) => ({ id, date, question: 'q' + id, analysis: '', view: { scope: 'natal' }, with: w });
  doc = upsertPerson(doc, { ...findPerson(doc, a.id), consultations: [mk('1', '2026-01-01', [b.id]), mk('2', '2026-03-01', [])] });
  const forB = consultationsOf(doc, b.id);
  assert.equal(forB.length, 1);
  assert.equal(forB[0].ownerId, a.id);
  assert.equal(forB[0].ownerName, '阿甲');
  assert.deepEqual(consultationsOf(doc, a.id).map((x) => x.id), ['2', '1']);
});

test('removePerson 清掉指向它的 link 與 with', () => {
  let { doc, a, b, c } = setup();
  doc = upsertPerson(doc, {
    ...findPerson(doc, a.id),
    links: [{ id: b.id, relation: '友', note: '' }, { id: c.id, relation: '友', note: '' }],
    consultations: [{ id: '1', date: '2026-01-01', question: '', analysis: '', view: { scope: 'natal' }, with: [b.id, c.id] }],
  });
  const next = removePerson(doc, b.id);
  const na = findPerson(next, a.id);
  assert.equal(findPerson(next, b.id), undefined);
  assert.deepEqual(na.links.map((l) => l.id), [c.id]);
  assert.deepEqual(na.consultations[0].with, [c.id]);
  assert.equal(doc.people.length, 3); // 原 doc 不變
});

test('search 比對 name / tags / question / analysis 全文，不分大小寫', () => {
  let { doc, a, b } = setup();
  doc = upsertPerson(doc, {
    ...findPerson(doc, b.id),
    consultations: [{ id: '1', date: '2026-01-01', question: '轉職', analysis: '官祿宮有 Alpha 化忌', view: { scope: 'natal' }, with: [] }],
  });
  assert.equal(search(doc, '').length, 3);
  assert.deepEqual(search(doc, '轉職').map((p) => p.id), [b.id]);
  assert.deepEqual(search(doc, 'alpha').map((p) => p.id), [b.id]);
  assert.deepEqual(search(doc, '客戶').map((p) => p.id), [a.id]);
  assert.deepEqual(search(doc, '阿丙').length, 1);
  assert.equal(search(doc, '不存在').length, 0);
});

test('upsertPerson 不 mutate 原 doc，並更新 updatedAt', async () => {
  const doc = EMPTY_DOC();
  const p = newPerson({ name: 'x', updatedAt: '2000-01-01T00:00:00.000Z' });
  const d1 = upsertPerson(doc, p);
  assert.equal(doc.people.length, 0);
  assert.notEqual(d1.people[0].updatedAt, '2000-01-01T00:00:00.000Z');
  const d2 = upsertPerson(d1, { ...d1.people[0], name: 'y' });
  assert.equal(d1.people[0].name, 'x');
  assert.equal(d2.people.length, 1);
  assert.equal(d2.people[0].name, 'y');
});
