import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTeacher, fromTeacher, detect } from '../app/format.js';
import { EMPTY_DOC } from '../app/model.js';

const rec = (o) => ({
  id: 'a1', name: '王小明', date: '1985-03-20', time: '14:00', gender: '男', calendar: 'solar',
  leap: false, fixLeap: true, category: '未分類', notes: '', updatedAt: '2026-05-01T08:00:00.000Z', ...o,
});
const teacher = (records) => ({ format: 'ziwei-chart-app', version: 1, records, categories: [] });
const KEYS = ['id', 'name', 'date', 'time', 'gender', 'calendar', 'leap', 'fixLeap'];
const pick = (r) => Object.fromEntries(KEYS.map((k) => [k, r[k]]));

test('老師格式 → fromTeacher → toTeacher 欄位一致', () => {
  const src = [
    rec({}),
    rec({ id: 'b2', name: '李小華', gender: '女', calendar: 'lunar', leap: true, fixLeap: false, date: '1995-08-16', time: '08:00', category: '家人' }),
  ];
  const out = toTeacher(fromTeacher(teacher(src), EMPTY_DOC()));
  assert.deepEqual(out.records.map(pick), src.map(pick));
  assert.equal(out.records[1].category, '家人');
  assert.equal(out.records[0].category, '未分類');
  assert.deepEqual(out.categories, ['家人']);
});

test('notes 非空變一筆 consultation', () => {
  const doc = fromTeacher(teacher([rec({ notes: '事業運不錯' })]), EMPTY_DOC());
  const [c] = doc.people[0].consultations;
  assert.equal(doc.people[0].consultations.length, 1);
  assert.equal(c.analysis, '事業運不錯');
  assert.equal(c.date, '2026-05-01');
  assert.deepEqual(c.with, []);
  assert.equal(fromTeacher(teacher([rec({})]), EMPTY_DOC()).people[0].consultations.length, 0);
});

test('同 id 再匯入不重複，也不 mutate 原 doc', () => {
  const base = EMPTY_DOC();
  const once = fromTeacher(teacher([rec({})]), base);
  const twice = fromTeacher(teacher([rec({ name: '改名' }), rec({ id: 'c3' })]), once);
  assert.equal(base.people.length, 0);
  assert.equal(once.people.length, 1);
  assert.deepEqual(twice.people.map((p) => p.id), ['a1', 'c3']);
  assert.equal(twice.people[0].name, '王小明');
});

test('detect', () => {
  assert.equal(detect(EMPTY_DOC()), 'own');
  assert.equal(detect(teacher([])), 'teacher');
  assert.equal(detect({ format: 'x' }), null);
  assert.equal(detect(null), null);
});
