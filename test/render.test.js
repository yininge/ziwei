import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEngine } from '../app/engine.js';
import { render, listHtml } from '../app/render.js';
import { EMPTY_DOC, newPerson, upsertPerson } from '../app/model.js';

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
  for (const s of ['大夫', '流財', '大祿', '流鸞', '大限命宮', '流年命宮']) {
    assert.ok(out.includes(s), s);
  }
  for (const c of ['hua natal', 'hua dec', 'hua year', 'star major', 'star minor', 'star adj']) assert.ok(out.includes(`class="${c}"`) || out.includes(`class="${c} `), c);
  assert.ok(!out.includes('限忌') && !out.includes('年忌'));
  assert.ok(out.includes('四限 庚辰 33–42 · 2026 丙午 虛42'));
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
  assert.ok(out.includes('<svg class="lines"'));
  assert.equal((out.match(/<line /g) || []).length, 4);
  assert.ok(!html({ view: 'chart', boards: [board()] }).includes('<svg class="lines"'));
});

test('合盤畫兩張盤與同步流年開關', () => {
  const out = html({ view: 'compare', boards: [board({ year: 2026 }), board()] });
  assert.equal((out.match(/class="board"/g) || []).length, 2);
  assert.ok(out.includes('同步流年'));
});

test('隱藏生辰：中宮不出國曆；控制列有分享與隱藏生辰按鈕', () => {
  const shown = html({ view: 'chart', boards: [board()], hideBirth: false });
  assert.ok(shown.includes('1985-03-20 14:00') && !shown.includes('class="pillars"') && !shown.includes('el-'));
  const out = html({ view: 'chart', boards: [board()], hideBirth: true });
  assert.ok(!out.includes('<span class="lb">國曆') && !out.includes('class="pillars"') && !out.includes('<span class="lb">農曆'));
  assert.ok(out.includes('data-action="share"') && out.includes('data-action="hide-birth"'));
  assert.ok(out.includes('生辰已隱藏') && shown.includes('隱藏生辰') && !shown.includes('生辰已隱藏'));
});

test('listHtml：縮影主星＋五行局、篩選 chip、排序 select', () => {
  const p = newPerson({ name: '阿甲', tags: ['家人'] });
  const doc = upsertPerson(EMPTY_DOC(), p);
  const fake = { soulPalace: '子', fiveElementsClass: '木三局', palaces: Array.from({ length: 12 }, (_, i) => ({ branch: i === 0 ? '子' : 'x', name: '', stars: i === 0 ? [{ name: '太陽', type: 'major' }, { name: '太陰', type: 'major' }, { name: '左輔', type: 'minor' }] : [] })) };
  const out = listHtml({ doc, q: '', filterTag: null, sort: 'recent' }, () => fake);
  for (const s of ['太陽 太陰', '木三局', 'data-action="filter-tag"', 'data-role="sort"', '家人']) assert.ok(out.includes(s), s);
  assert.ok(!out.includes('左輔'));
  assert.ok(listHtml({ doc, q: '', filterTag: null }, () => null).includes('—'));
});

// 已儲存的人：selectedId 指到 doc 裡的人，formOpen=false 時表單收成摘要
const saved = () => {
  const p = newPerson({ name: '甲', gender: 'M', birth: { calendar: 'solar', date: '1985-03-20', time: '14:00', leap: false, fixLeap: true }, tags: ['朋友', '個案'] });
  return { doc: upsertPerson(EMPTY_DOC(), p), selectedId: p.id };
};

test('已儲存、表單收合：只有摘要列，沒有表單與排盤鈕', () => {
  const out = html({ view: 'chart', boards: [board({ draft: { ...draft, tagsText: '朋友, 個案' } })], ...saved(), formOpen: false });
  assert.ok(out.includes('form-summary') && out.includes('1985/03/20 14:00 · 男 · 朋友、個案'));
  assert.ok(!out.includes('<form class="inputs"') && out.includes('data-action="form-open"'));
  const open = html({ view: 'chart', boards: [board()], ...saved(), formOpen: true });
  assert.ok(open.includes('<form class="inputs"') && open.includes('data-action="form-close"') && !open.includes('value="chart"'));
  assert.ok(open.includes('已儲存') && html({ view: 'chart', boards: [board()], ...saved(), formOpen: true, dirty: true }).includes('value="save" class="btn">儲存'));
});

test('隱藏生辰 + 表單收合：摘要沒有生辰也沒有編輯鈕', () => {
  const out = html({ view: 'chart', boards: [board()], ...saved(), formOpen: false, hideBirth: true });
  assert.ok(out.includes('form-summary') && out.includes('生辰已隱藏'));
  assert.ok(!out.includes('1985/03/20') && !out.includes('1985-03-20') && !out.includes('data-action="form-open"'));
});

test('盤上工具列；新增模式有排盤鈕；刪除在命盤資訊 tab', () => {
  const out = html({ view: 'chart', boards: [board()] });
  assert.ok(out.includes('class="board-bar"') && out.includes('data-action="share"') && out.includes('data-action="hide-birth"'));
  assert.ok(out.includes('value="chart"') && !out.includes('data-action="delete"'));
  const s2 = html({ view: 'chart', boards: [board()], ...saved(), formOpen: false });
  assert.ok(s2.includes('刪除這張命盤') && s2.includes('data-action="delete"'));
  assert.ok(!html({ view: 'chart', boards: [board()], ...saved(), formOpen: false, panelTab: 'links' }).includes('刪除這張命盤'));
  assert.ok(out.includes('<span class="rlab">大限</span>') && out.includes('<span class="rlab">流年</span>'));
});
