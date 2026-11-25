import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEngine } from '../app/engine.js';
import { boardSvg } from '../app/boardSvg.js';

globalThis.self ??= globalThis;
const iztro = createRequire(import.meta.url)('../vendor/iztro.min.js');
const engine = createEngine(iztro);

const input = { name: '甲', gender: 'M', calendar: 'solar', date: '1985-03-20', time: '14:00', leap: false, fixLeap: true, timeCertainty: 'exact' };
const chart = engine.chart(input);
const base = () => ({ chart, input });

test('基本輸出：svg、viewBox、十二宮名、五行局，不畫四柱', () => {
  const s = boardSvg(base());
  assert.ok(s.startsWith('<svg'));
  assert.ok(s.includes('viewBox="0 0 1600 1600"'));
  for (const p of chart.palaces) assert.ok(s.includes(p.name), p.name);
  for (const z of ['乙丑', '戊寅', '戊午', '己未']) assert.ok(!s.includes(z), z);
  assert.ok(s.includes('木三局'));
});

test('hideBirth 省略國曆、農曆、四柱', () => {
  const s = boardSvg({ ...base(), hideBirth: true });
  assert.ok(!s.includes('1985-03-20') && !s.includes('農曆') && !s.includes('乙丑'));
  assert.ok(s.includes('木三局'));
});

test('疊盤：大命、流命、大祿、流鸞', () => {
  const s = boardSvg({ ...base(), decadal: engine.decadalOverlay(chart, 4), yearly: engine.yearlyOverlay(chart, 2026) });
  for (const k of ['大命', '流命', '大祿', '流鸞', '大限命宮', '流年命宮']) assert.ok(s.includes(k), k);
});

test('選中宮：4 條線都在中宮範圍內', () => {
  const s = boardSvg({ ...base(), selectedPalace: 0 });
  const ls = [...s.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)];
  assert.equal(ls.length, 4);
  for (const m of ls) for (const v of m.slice(1)) assert.ok(+v >= 420 && +v <= 1180, v);
});

test('特殊字元會 escape', () => {
  const s = boardSvg({ chart, input: { ...input, name: '<A&B>' } });
  assert.ok(s.includes('&lt;A&amp;B&gt;'));
  assert.ok(!s.includes('<A&B>'));
});
