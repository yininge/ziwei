import { visibleStars, visibleFlowStars, decadalOrderForYear } from './engine.js';
import { GRID } from './layout.js';
import { search, linksOf, consultationsOf, findPerson, relationSuggestions } from './model.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const MUTAGEN_CLASS = { 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' };
const MUT = ['祿', '權', '科', '忌']; // 對應 overlay.mutagen 的索引 0..3
const CERTAINTY = { exact: '確定', approx: '大約', unknown: '不確定' };
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const thisYear = () => new Date().getFullYear();
// 三方四正：對宮、兩個三合（palace index 相差 6、4、8）；順序讓命宮顯示成「財帛、官祿、遷移」
const relatedOf = (i) => [(i + 8) % 12, (i + 4) % 12, (i + 6) % 12];

// 疊盤資料；某年排不出來（例如早於出生）就當沒疊，不讓整頁畫不出來
function overlaysOf(board, state) {
  const o = { d: null, y: null, showAll: !!state.showAllFlow };
  const c = board.chart;
  if (!c) return o;
  try {
    if (board.decadalOrder) o.d = state.engine.decadalOverlay(c, board.decadalOrder);
  } catch { /* 略過 */ }
  try {
    if (board.year) o.y = state.engine.yearlyOverlay(c, board.year);
  } catch { /* 略過 */ }
  return o;
}

function starHtml(s, o) {
  const bright = s.brightness ? `<span class="bright">${esc(s.brightness)}</span>` : '';
  const badge = s.mutagen
    ? `<span class="hua hua-${MUTAGEN_CLASS[s.mutagen] || 'other'}">${esc(s.mutagen)}</span>`
    : '';
  const di = o.d ? o.d.mutagen.indexOf(s.name) : -1;
  const yi = o.y ? o.y.mutagen.indexOf(s.name) : -1;
  const dBadge = di >= 0 ? `<span class="hua ov od ov-${MUTAGEN_CLASS[MUT[di]]}">限${MUT[di]}</span>` : '';
  const yBadge = yi >= 0 ? `<span class="hua ov oy ov-${MUTAGEN_CLASS[MUT[yi]]}">年${MUT[yi]}</span>` : '';
  return `<span class="star ${s.type === 'major' ? 'major' : 'minor'}"><span class="sname">${esc(s.name)}</span>${bright}${badge}${dBadge}${yBadge}</span>`;
}

function palaceHtml(p, o, bi, selected) {
  const pos = GRID[p.branch];
  const i = p.index;
  const stars = visibleStars(p).map((s) => starHtml(s, o)).join('');
  const body = p.isBody ? '<span class="body-tag">身</span>' : '';
  const df = o.d ? visibleFlowStars(o.d.stars[i], 'decadal', { showAll: o.showAll }) : [];
  const yf = o.y ? visibleFlowStars(o.y.stars[i], 'yearly', { showAll: o.showAll }) : [];
  const flows =
    df.length || yf.length
      ? `<div class="flows">${df.map((n) => `<span class="f-d">${esc(n)}</span>`).join('')}${yf.map((n) => `<span class="f-y">${esc(n)}</span>`).join('')}</div>`
      : '';
  const dn = o.d?.shortNames[i];
  const yn = o.y?.shortNames[i];
  const shorts =
    dn || yn
      ? `<span class="ovn">${dn ? `<span class="f-d">${esc(dn)}</span>` : ''}${yn ? `<span class="f-y">${esc(yn)}</span>` : ''}</span>`
      : '';
  const tags = `${dn === '大命' ? '<span class="ptag f-d">大限命宮</span>' : ''}${yn === '流命' ? '<span class="ptag f-y">流年命宮</span>' : ''}`;
  const cls = [
    'palace',
    p.name === '命宮' ? 'is-life' : '',
    selected === i ? 'sel' : selected != null && relatedOf(selected).includes(i) ? 'rel' : '',
  ].filter(Boolean).join(' ');
  return `<div class="${cls}" style="grid-row:${pos.row};grid-column:${pos.col}" data-action="palace" data-board="${bi}" data-index="${i}">
  <div class="stars">${stars}</div>
  ${flows}
  ${tags ? `<div class="ptags">${tags}</div>` : ''}
  <div class="pname"><span class="pn">${esc(p.name)}</span>${body}${shorts}<span class="range">${esc(p.range[0])}–${esc(p.range[1])}</span></div>
  <div class="gz">${esc(p.stem)}${esc(p.branch)}</div>
</div>`;
}

function row(label, value) {
  return `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
}

function centerHtml(c, input, selected) {
  const name = (input.name || '').trim() || '未命名';
  const sex = input.gender === 'M' ? '男命' : '女命';
  const tri =
    selected != null
      ? `<p class="tri">${esc(c.palaces[selected].name)} ‧ 三方四正：${relatedOf(selected).map((j) => esc(c.palaces[j].name)).join('、')}</p>`
      : '';
  return `<div class="center">
  <h1 class="who">${esc(name)}</h1>
  <p class="meta">${sex} · ${esc(c.fiveElementsClass)}</p>
  <dl>
    ${row('國曆', `${c.solarDate} ${input.time}`)}
    ${row('農曆', c.lunar)}
    ${row('四柱', c.pillars.join(' '))}
    ${row('命主', c.soul)}
    ${row('身主', c.body)}
    ${row('命宮', c.soulPalace)}
    ${row('身宮', c.bodyPalace)}
  </dl>
  ${tri}
</div>`;
}

// ---------- 盤 + 控制列（chart / compare 共用） ----------

function boardHtml(board, state, bi) {
  const c = board.chart;
  if (!c) return '';
  const o = overlaysOf(board, state);
  return `<div class="board" data-board="${bi}">
${c.palaces.map((p) => palaceHtml(p, o, bi, board.selectedPalace)).join('\n')}
${centerHtml(c, board.draft, board.selectedPalace)}
</div>`;
}

function summaryText(o) {
  const parts = [];
  if (o.d) parts.push(`大限 ${o.d.stem}${o.d.branch} ${o.d.range[0]}–${o.d.range[1]}`);
  if (o.y) parts.push(`流年 ${o.y.year} ${o.y.stem}${o.y.branch} 虛${o.y.nominalAge}`);
  return parts.length ? parts.join(' · ') : '本命';
}

function controlsHtml(board, state, bi) {
  const c = board.chart;
  if (!c) return '';
  const o = overlaysOf(board, state);
  const nowOrder = decadalOrderForYear(c, thisYear());
  const dRow = c.decadals
    .map(
      (d) => `<button type="button" class="cbtn${board.decadalOrder === d.order ? ' on' : ''}${nowOrder === d.order ? ' now' : ''}" data-action="decadal" data-board="${bi}" data-order="${d.order}" aria-pressed="${board.decadalOrder === d.order}">
<span>${NUM[d.order - 1]}限</span><span>${esc(d.stem)}${esc(d.branch)}</span><span>${d.range[0]}–${d.range[1]}</span></button>`,
    )
    .join('');
  const ord = board.decadalOrder ?? nowOrder ?? 1;
  const dec = c.decadals.find((d) => d.order === ord);
  const yRow = Array.from({ length: 10 }, (_, k) => {
    // 跟老師一樣把 range 當實歲排年份（四限 33–42 → 2018–2027）；
    // 嚴格講 iztro 的 range 是虛歲、會晚一年，Yi 2026-11-24 指示結果跟老師。
    const yr = c.birthYear + dec.range[0] + k;
    let gz = '';
    let age = '';
    try {
      const y = state.engine.yearlyOverlay(c, yr);
      gz = y.stem + y.branch;
      age = `虛${y.nominalAge}`;
    } catch { /* 略過 */ }
    return `<button type="button" class="cbtn${board.year === yr ? ' on' : ''}${yr === thisYear() ? ' now' : ''}" data-action="year" data-board="${bi}" data-year="${yr}" aria-pressed="${board.year === yr}">
<span>${yr}</span><span>${esc(gz)}</span><span>${esc(age)}</span></button>`;
  }).join('');
  return `<div class="ctrl">
  <div class="crow d12">${dRow}</div>
  <div class="crow y10">${yRow}</div>
  <div class="cfoot"><label class="chk"><input type="checkbox" data-action="showflow"${state.showAllFlow ? ' checked' : ''}> 顯示全部流曜</label><span class="sum">${esc(summaryText(o))}</span></div>
</div>`;
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('zh-TW', { hour12: false }) : '');
const today = () => new Date().toLocaleDateString('sv-SE');

function birthLine(b) {
  const cal = b.calendar === 'lunar' ? '農曆' : '國曆';
  return `${cal} ${b.date} ${b.time}${b.calendar === 'lunar' && b.leap ? ' 閏' : ''}`;
}

// ---------- library ----------

function rowHtml(p) {
  const n = p.consultations.length;
  const cert = p.timeCertainty && p.timeCertainty !== 'exact' ? `（時辰${CERTAINTY[p.timeCertainty]}）` : '';
  return `<button type="button" class="lib-row" data-action="open" data-id="${esc(p.id)}">
  <span class="lr-top"><b class="lr-name">${esc(p.name || '未命名')}</b><span class="lr-sex">${p.gender === 'M' ? '男' : '女'}</span>${n ? `<span class="lr-n">問事 ${n} 筆</span>` : ''}</span>
  <span class="lr-birth">${esc(birthLine(p.birth))}${esc(cert)}</span>
  ${p.tags.length ? `<span class="lr-tags">${p.tags.map(esc).join('、')}</span>` : ''}
</button>`;
}

// 搜尋時只重畫這一塊（不重畫整頁，搜尋框才不會掉焦點）
export function listHtml(state) {
  if (!state.doc.people.length) return '<p class="hint">還沒有命盤，按右上角新增</p>';
  const list = search(state.doc, state.q);
  if (!list.length) return '<p class="hint">找不到符合的命盤</p>';
  return list.map(rowHtml).join('\n');
}

function libraryHtml(state) {
  return `<main class="lib">
<header class="topbar"><h1 class="title">紫微排盤</h1>
<button type="button" class="btn ghost" data-action="export-own">匯出</button>
<button type="button" class="btn ghost" data-action="export-teacher" title="老師網站的格式">匯出（老師格式）</button>
<button type="button" class="btn ghost" data-action="import">匯入</button>
<input type="file" accept=".json,application/json" data-role="import" hidden>
<button type="button" class="btn ghost" data-action="lock">鎖定</button>
<button type="button" class="btn" data-action="new">＋ 新增</button></header>
<input class="search" data-role="search" type="search" placeholder="搜尋姓名、標籤、問題與分析" value="${esc(state.q)}" autocomplete="off">
${msgHtml(state)}
<div id="list" class="list">${listHtml(state)}</div>
</main>`;
}

function msgHtml(state) {
  return `${state.notice ? `<p class="notice">${esc(state.notice)}</p>` : ''}${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}`;
}

// ---------- chart view ----------

function formHtml(d, saved) {
  const lunar = d.calendar === 'lunar';
  const chk = (b) => (b ? ' checked' : '');
  const sel = (v) => (d.timeCertainty === v ? ' selected' : '');
  return `<form class="inputs" data-form="person" autocomplete="off">
  <label>姓名 <input name="name" type="text" value="${esc(d.name)}" placeholder="必填"></label>
  <span class="grp">
    <label><input type="radio" name="calendar" value="solar"${chk(!lunar)}> 國曆</label>
    <label><input type="radio" name="calendar" value="lunar"${chk(lunar)}> 農曆</label>
  </span>
  <label>日期 <input name="date" type="date" value="${esc(d.date)}" required></label>
  <label>時間 <input name="time" type="time" value="${esc(d.time)}" required></label>
  <span class="grp">
    <label><input type="radio" name="gender" value="M"${chk(d.gender === 'M')}> 男</label>
    <label><input type="radio" name="gender" value="F"${chk(d.gender === 'F')}> 女</label>
  </span>
  ${lunar ? `<label><input type="checkbox" name="leap"${chk(d.leap)}> 閏月</label>` : ''}
  <label><input type="checkbox" name="fixLeap"${chk(d.fixLeap !== false)}> 閏月後半算下月</label>
  <label>時辰
    <select name="timeCertainty">
      <option value="exact"${sel('exact')}>${CERTAINTY.exact}</option>
      <option value="approx"${sel('approx')}>${CERTAINTY.approx}</option>
      <option value="unknown"${sel('unknown')}>${CERTAINTY.unknown}</option>
    </select>
  </label>
  <label>標籤 <input name="tags" type="text" class="wide" value="${esc(d.tagsText)}" placeholder="用逗號分隔"></label>
  <span class="grp">
    <button type="submit" name="op" value="chart" class="btn ghost">排盤</button>
    <button type="submit" name="op" value="save" class="btn">儲存</button>
    ${saved ? '<button type="button" class="btn danger" data-action="delete">刪除</button>' : ''}
  </span>
</form>`;
}

function infoTab(p) {
  if (!p) return '<p class="hint">尚未儲存。</p>';
  return `<dl class="kv">
  <dt>標籤</dt><dd>${p.tags.length ? p.tags.map((t) => `<span class="chip tag">${esc(t)}</span>`).join(' ') : '—'}</dd>
  <dt>時辰確定度</dt><dd>${esc(CERTAINTY[p.timeCertainty] || '')}</dd>
  <dt>建立</dt><dd>${esc(fmtTime(p.createdAt))}</dd>
  <dt>更新</dt><dd>${esc(fmtTime(p.updatedAt))}</dd>
</dl>`;
}

function consultForm(state, v, formName, cid) {
  const others = state.doc.people.filter((p) => p.id !== state.selectedId);
  const withs = new Set(v.with || []);
  const checks = others.length
    ? others
        .map(
          (p) =>
            `<label class="chk"><input type="checkbox" name="with" value="${esc(p.id)}"${withs.has(p.id) ? ' checked' : ''}> ${esc(p.name || '未命名')}</label>`,
        )
        .join('')
    : '<span class="hint">還沒有其他人</span>';
  return `<form class="cform" data-form="${formName}" data-draft="${formName === 'consult-new' ? 'consult' : ''}" autocomplete="off">
  ${cid ? `<input type="hidden" name="cid" value="${esc(cid)}">` : ''}
  <label>日期 <input name="date" type="date" value="${esc(v.date || today())}" required></label>
  <label class="block">問題 <textarea name="question" rows="2">${esc(v.question)}</textarea></label>
  <label class="block">分析 <textarea name="analysis" rows="5">${esc(v.analysis)}</textarea></label>
  <fieldset><legend>一起看的人</legend>${checks}</fieldset>
  <div class="acts"><button type="submit" class="btn">${cid ? '儲存修改' : '＋ 新增分析'}</button>${cid ? '<button type="button" class="btn ghost" data-action="cons-cancel">取消</button>' : ''}</div>
</form>`;
}

// 紀錄上的盤面摘要，例如「四限 庚辰 · 2026 · 官祿」；沒有任何盤面資訊就回空字串
function viewSummary(v, chart) {
  const parts = [];
  if (v?.decadalOrder) {
    const d = chart?.decadals.find((x) => x.order === v.decadalOrder);
    parts.push(`${NUM[v.decadalOrder - 1]}限${d ? ` ${d.stem}${d.branch}` : ''}`);
  }
  if (v?.year) parts.push(String(v.year));
  if (v?.palace != null && chart?.palaces[v.palace]) parts.push(chart.palaces[v.palace].name);
  return parts.join(' · ');
}

function consultTab(state) {
  const id = state.selectedId;
  if (!id) return '<p class="hint">請先儲存這個人，才能記問題與分析。</p>';
  const chart = state.boards[0]?.chart;
  const items = consultationsOf(state.doc, id)
    .map((c) => {
      const own = c.ownerId === id;
      if (own && state.editingConsult === c.id) {
        return `<article class="cons">${consultForm(state, c, 'consult-edit', c.id)}</article>`;
      }
      const withs = c.with.filter((w) => w !== id);
      const owner = own ? '' : `<span class="owner">（記在 ${esc(c.ownerName || '未命名')} 的盤）</span>`;
      const sum = own ? viewSummary(c.view, chart) : '';
      const withHtml = withs
        .map((w) => {
          const o = findPerson(state.doc, w);
          return `<span class="withp">${esc(o?.name || '?')}${o ? ` <button type="button" class="btn ghost sm" data-action="compare" data-id="${esc(w)}">並列</button>` : ''}</span>`;
        })
        .join('、');
      return `<article class="cons">
  <div class="c-head"><time>${esc(c.date)}</time> <b>${esc(c.question || '（未填問題）')}</b> ${owner}</div>
  ${sum ? `<div class="vsum"><small>${esc(sum)}</small> <button type="button" class="btn ghost sm" data-action="cons-view" data-cid="${esc(c.id)}">回到盤面</button></div>` : ''}
  ${c.analysis ? `<p class="analysis">${esc(c.analysis)}</p>` : ''}
  ${withs.length ? `<small class="with">合盤：${withHtml}</small>` : ''}
  ${own ? `<div class="acts"><button type="button" class="btn ghost sm" data-action="cons-edit" data-cid="${esc(c.id)}">編輯</button><button type="button" class="btn ghost sm" data-action="cons-del" data-cid="${esc(c.id)}">刪除</button></div>` : ''}
</article>`;
    })
    .join('');
  return `${items || '<p class="hint">還沒有紀錄。</p>'}${consultForm(state, state.forms.consult || {}, 'consult-new')}`;
}

function linksTab(state) {
  const id = state.selectedId;
  if (!id) return '<p class="hint">請先儲存這個人，才能關聯其他命盤。</p>';
  const links = linksOf(state.doc, id);
  const chips = links
    .map((l) => {
      const label = `${l.direction === 'in' ? '← ' : ''}`;
      const rel = l.relation ? ` · ${esc(l.relation)}` : '';
      return `<li class="chip link"><span>${label}<button type="button" class="linkname" data-action="open" data-id="${esc(l.id)}">${esc(l.name || '未命名')}</button>${rel}</span><button type="button" class="btn ghost sm" data-action="compare" data-id="${esc(l.id)}">並列</button>${
        l.direction === 'out' ? `<button type="button" class="x" data-action="link-del" data-id="${esc(l.id)}" aria-label="移除關聯">×</button>` : ''
      }${l.note ? `<small class="note">${esc(l.note)}</small>` : ''}</li>`;
    })
    .join('');
  const linked = new Set(findPerson(state.doc, id).links.map((l) => l.id));
  const options = state.doc.people.filter((p) => p.id !== id && !linked.has(p.id));
  const v = state.forms.link || {};
  const dl = relationSuggestions(state.doc).map((r) => `<option value="${esc(r)}">`).join('');
  const form = options.length
    ? `<form class="cform" data-form="link-new" data-draft="link" autocomplete="off">
  <label>選人 <select name="to">${options
    .map((p) => `<option value="${esc(p.id)}"${v.to === p.id ? ' selected' : ''}>${esc(p.name || '未命名')}</option>`)
    .join('')}</select></label>
  <label>關係 <input name="relation" type="text" list="relations" value="${esc(v.relation)}" placeholder="例：配偶、父親、主管"></label>
  <datalist id="relations">${dl}</datalist>
  <label>備註 <input name="note" type="text" value="${esc(v.note)}" placeholder="可空"></label>
  <div class="acts"><button type="submit" class="btn">＋ 新增關聯</button></div>
</form>`
    : '<p class="hint">沒有其他可關聯的人。</p>';
  return `${links.length ? `<ul class="chips">${chips}</ul>` : '<p class="hint">還沒有關聯。</p>'}${form}`;
}

function panelHtml(state) {
  const p = state.selectedId ? findPerson(state.doc, state.selectedId) : null;
  const tabs = [['info', '命盤資訊'], ['consult', '問題與分析'], ['links', '關聯命盤']];
  const body = state.panelTab === 'consult' ? consultTab(state) : state.panelTab === 'links' ? linksTab(state) : infoTab(p);
  return `<aside class="panel">
  <div class="tabs" role="tablist">${tabs
    .map(([k, t]) => `<button type="button" role="tab" class="tab${state.panelTab === k ? ' on' : ''}" aria-selected="${state.panelTab === k}" data-action="tab" data-tab="${k}">${t}</button>`)
    .join('')}</div>
  <div class="tabbody">${body}</div>
</aside>`;
}

function chartViewHtml(state) {
  const board = state.boards[0];
  const saved = state.selectedId ? findPerson(state.doc, state.selectedId) : null;
  return `<main class="chart-view">
<header class="topbar"><button type="button" class="btn ghost" data-action="library">‹ 列表</button><h1 class="title">${esc(saved ? saved.name : '新增命盤')}</h1></header>
${formHtml(board.draft, !!saved)}
${msgHtml(state)}
<div class="chart-layout">
<div class="board-col">${boardHtml(board, state, 0)}${controlsHtml(board, state, 0)}</div>
${panelHtml(state)}
</div>
</main>`;
}

// ---------- compare view ----------

function compareViewHtml(state) {
  const [a, b] = state.boards;
  const { side, syncYear } = state.compare;
  const nm = (bd) => (bd.draft.name || '').trim() || '未命名';
  const col = (bd, i) =>
    `<section class="cmp-col${i === side ? '' : ' off'}">${boardHtml(bd, state, i)}${controlsHtml(bd, state, i)}</section>`;
  const seg = [a, b]
    .map((bd, i) => `<button type="button" class="${i === side ? 'on' : ''}" data-action="side" data-side="${i}">${i === 0 ? '甲' : '乙'} ${esc(nm(bd))}</button>`)
    .join('');
  return `<main class="compare-view">
<header class="topbar"><button type="button" class="btn ghost" data-action="compare-back">‹ 返回</button><h1 class="title">${esc(nm(a))} × ${esc(nm(b))}</h1><label class="chk"><input type="checkbox" data-action="sync"${syncYear ? ' checked' : ''}> 同步流年</label></header>
${msgHtml(state)}
<div class="seg" role="group" aria-label="切換命盤">${seg}</div>
<div class="cmp-cols">${col(a, 0)}${col(b, 1)}</div>
</main>`;
}

// ---------- unlock / setup ----------

const gateHtml = (state, formName, lead, fields, submit) => `<main class="gate">
<h1 class="title">紫微排盤</h1>
${lead ? `<p class="hint">${lead}</p>` : ''}
<form class="gate-form" data-form="${formName}" autocomplete="off">
${fields}
<label class="remember"><input type="checkbox" name="remember"> 記住這台裝置</label>
${msgHtml(state)}
<button type="submit" class="btn">${submit}</button>
</form>
</main>`;

const passField = (name, label, auto) =>
  `<label>${label}<input type="password" name="${name}" autocomplete="${auto}" required autofocus></label>`;

export function unlockHtml(state) {
  return gateHtml(state, 'unlock', '', passField('pass', 'passphrase', 'current-password'), '解鎖');
}

export function setupHtml(state) {
  return gateHtml(
    state, 'setup',
    '第一次使用，請設定 passphrase。忘了就沒人能解開，請存進密碼管理器。',
    passField('pass', 'passphrase', 'new-password') + passField('pass2', '再輸入一次', 'new-password').replace(' autofocus', ''),
    '設定並開始',
  );
}

export function render(state, root) {
  root.innerHTML =
    state.view === 'unlock' ? unlockHtml(state)
    : state.view === 'setup' ? setupHtml(state)
    : state.view === 'library' ? libraryHtml(state)
    : state.view === 'compare' ? compareViewHtml(state)
    : chartViewHtml(state);
}
