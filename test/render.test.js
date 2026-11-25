import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEngine } from '../app/engine.js';
import { render } from '../app/render.js';
import { EMPTY_DOC } from '../app/model.js';

globalThis.self ??= globalThis;
const iztro = createRequire(import.meta.url)('../vendor/iztro.min.js');
const engine = createEngine(iztro);

const draft = { name: '甲', gender: 'M', calendar: 'solar', date: '1985-03-20', time: '14:00', leap: false, fixLeap: true, timeCertainty: 'exact', tagsText: '' };
const board = (over = {}) => {
  const b = { personId: null, draft, chart: null, decadalOrder: null, year: null, selectedPalace: null, ...over };
  b.chart = engine.chart(draft);
  return b;
};
const html = (state) => {
  const root = { innerHTML: '' };
  render({ engine, doc: EMPTY_DOC(), q: '', selectedId: null, panelTab: 'info', forms: { consult: {}, link: {} }, showAllFlow: false, error: '', notice: '', compare: { side: 0, syncYear: true }, ...state }, root);
  return root.innerHTML;
};

test('大限四 + 流年 2026 疊盤出現在 HTML', () => {
  const out = html({ view: 'chart', boards: [board({ decadalOrder: 4, year: 2026 })] });
  for (const s of ['大夫', '流財', '大祿', '流鸞', '限忌', '年忌', '大限命宮', '流年命宮']) {
    assert.ok(out.includes(s), s);
  }
  assert.ok(out.includes('大限 庚辰 33–42 · 流年 2026 丙午 虛42'));
});

test('本命：沒有疊盤字樣', () => {
  const out = html({ view: 'chart', boards: [board()] });
  assert.ok(out.includes('本命'));
  assert.ok(!out.includes('大限命宮'));
});

test('三方四正', () => {
  const b = board({ selectedPalace: 0 });
  const out = html({ view: 'chart', boards: [b] });
  const names = [8, 4, 6].map((j) => b.chart.palaces[j].name).join('、');
  assert.ok(out.includes(`${b.chart.palaces[0].name} ‧ 三方四正：${names}`));
  assert.equal((out.match(/class="palace[^"]* sel"/g) || []).length, 1);
  assert.equal((out.match(/class="palace[^"]* rel"/g) || []).length, 3);
});

test('合盤畫兩張盤與同步流年開關', () => {
  const out = html({ view: 'compare', boards: [board({ year: 2026 }), board()] });
  assert.equal((out.match(/class="board"/g) || []).length, 2);
  assert.ok(out.includes('同步流年'));
});
