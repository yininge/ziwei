import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createEngine, timeIndexOf, visibleStars, visibleFlowStars } from '../app/engine.js';

globalThis.self ??= globalThis;
const iztro = createRequire(import.meta.url)('../vendor/iztro.min.js');
const { chart, decadalOverlay, yearlyOverlay } = createEngine(iztro);
const golden = (n) => JSON.parse(readFileSync(new URL(`./golden/${n}.json`, import.meta.url)));
const label = (s) => s.name + (s.brightness || '') + (s.mutagen || '');
const gLabel = (s) => s.name + (s.brightness || '') + (s.mutagens || []).join('');
const mk = (g) => chart({ calendar: 'solar', date: g.date, time: g.time, gender: g.gender, fixLeap: true });

for (const n of ['A', 'B', 'C', 'D']) {
  test(`${n} 本命盤對照 golden`, () => {
    const g = golden(`${n}_natal`);
    const c = mk(g);
    assert.deepEqual(c.lunar, g.lunar);
    assert.deepEqual(c.pillars, g.pillars);
    for (const k of ['fiveElementsClass', 'soul', 'body', 'soulPalace', 'bodyPalace']) {
      assert.deepEqual(c[k], g[k], k);
    }
    for (const gp of g.palaces) {
      const p = c.palaces.find((x) => x.branch === gp.branch);
      assert.ok(p, `branch ${gp.branch}`);
      assert.deepEqual(p.name, gp.name);
      assert.deepEqual(p.stem, gp.stem);
      assert.deepEqual(p.range, gp.range);
      assert.deepEqual(p.isBody, gp.body);
      assert.deepEqual(visibleStars(p).map(label), gp.stars.map(gLabel), `${gp.branch} stars`);
    }
  });
}

test('A 四限 + 2026 流年疊盤', () => {
  const g = golden('A_decadal4_year2026');
  const c = mk(golden('A_natal'));
  const d = decadalOverlay(c, 4);
  const y = yearlyOverlay(c, 2026);
  assert.equal(d.stem, '庚');
  assert.equal(d.branch, '辰');
  assert.deepEqual(d.range, [33, 42]);
  assert.equal(y.stem + y.branch, '丙午');
  assert.equal(y.nominalAge, 42);
  assert.equal(y.realAge, 41);
  const MUT = ['祿', '權', '科', '忌'];
  for (const gp of g.palaces) {
    const p = c.palaces.find((x) => x.branch === gp.branch);
    const i = p.index;
    const ours = [
      d.shortNames[i], y.shortNames[i],
      ...visibleFlowStars(d.stars[i], 'decadal'),
      ...visibleFlowStars(y.stars[i], 'yearly'),
    ].sort();
    assert.deepEqual(ours, [...gp.overlays].sort(), `${gp.branch} overlays`);
    for (const gs of gp.stars) {
      const s = p.stars.find((x) => x.name === gs.name);
      const m = [];
      if (s.mutagen) m.push(s.mutagen);
      for (const ix of [d.mutagen.indexOf(s.name), y.mutagen.indexOf(s.name)]) {
        if (ix >= 0) m.push(MUT[ix]);
      }
      assert.deepEqual(m.sort(), [...(gs.mutagens || [])].sort(), `${gp.branch} ${gs.name} 四化`);
    }
  }
});

test('timeIndexOf', () => {
  for (const [h, i] of [[23, 12], [0, 0], [1, 1], [2, 1], [12, 6], [22, 11]]) assert.equal(timeIndexOf(h), i);
});

test('農曆輸入（閏月）等同國曆 C', () => {
  const c = mk(golden('C_natal'));
  const l = chart({ calendar: 'lunar', date: '1995-08-16', leap: true, time: '08:00', gender: 'F', fixLeap: true });
  assert.equal(l.solarDate, '1995-10-10');
  l.palaces.forEach((p, i) => {
    const q = c.palaces[i];
    assert.equal(p.name, q.name);
    assert.equal(p.stem, q.stem);
    assert.deepEqual(p.range, q.range);
    assert.deepEqual(visibleStars(p), visibleStars(q));
  });
});

test('fixLeap 開關', () => {
  const g = golden('C_natal');
  const c = chart({ calendar: 'solar', date: g.date, time: g.time, gender: g.gender, fixLeap: false });
  assert.equal(c.fiveElementsClass, '金四局');
});

test('showAll 顯示大馬', () => {
  const c = mk(golden('A_natal'));
  const d = decadalOverlay(c, 4);
  assert.ok(visibleFlowStars(d.stars.flat(), 'decadal', { showAll: true }).includes('大馬'));
  assert.ok(!visibleFlowStars(d.stars.flat(), 'decadal').includes('大馬'));
});

test('大限邊界', () => {
  const c = mk(golden('A_natal'));
  const d = decadalOverlay(c, 1);
  assert.equal(d.branch, '未');
  assert.deepEqual(d.range, [3, 12]);
  assert.throws(() => decadalOverlay(c, 13));
});
