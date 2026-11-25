import { visibleStars } from './engine.js';
import { GRID } from './layout.js';
import { search, linksOf, consultationsOf, findPerson, relationSuggestions } from './model.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const MUTAGEN_CLASS = { 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' };
const CERTAINTY = { exact: '確定', approx: '大約', unknown: '不確定' };

function starHtml(s) {
  const bright = s.brightness ? `<span class="bright">${esc(s.brightness)}</span>` : '';
  const badge = s.mutagen
    ? `<span class="hua hua-${MUTAGEN_CLASS[s.mutagen] || 'other'}">${esc(s.mutagen)}</span>`
    : '';
  return `<span class="star ${s.type === 'major' ? 'major' : 'minor'}"><span class="sname">${esc(s.name)}</span>${bright}${badge}</span>`;
}

function palaceHtml(p) {
  const pos = GRID[p.branch];
  const stars = visibleStars(p).map(starHtml).join('');
  const body = p.isBody ? '<span class="body-tag">身</span>' : '';
  return `<div class="palace${p.name === '命宮' ? ' is-life' : ''}" style="grid-row:${pos.row};grid-column:${pos.col}">
  <div class="stars">${stars}</div>
  <div class="pname"><span class="pn">${esc(p.name)}</span>${body}<span class="range">${esc(p.range[0])}–${esc(p.range[1])}</span></div>
  <div class="gz">${esc(p.stem)}${esc(p.branch)}</div>
</div>`;
}

function row(label, value) {
  return `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
}

function centerHtml(c, input) {
  const name = (input.name || '').trim() || '未命名';
  const sex = input.gender === 'M' ? '男命' : '女命';
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
<header class="topbar"><h1 class="title">紫微排盤</h1><button type="button" class="btn" data-action="new">＋ 新增</button></header>
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

function consultTab(state) {
  const id = state.selectedId;
  if (!id) return '<p class="hint">請先儲存這個人，才能記問題與分析。</p>';
  const items = consultationsOf(state.doc, id)
    .map((c) => {
      const own = c.ownerId === id;
      if (own && state.editingConsult === c.id) {
        return `<article class="cons">${consultForm(state, c, 'consult-edit', c.id)}</article>`;
      }
      const names = c.with.filter((w) => w !== id).map((w) => findPerson(state.doc, w)?.name || '?');
      const owner = own ? '' : `<span class="owner">（記在 ${esc(c.ownerName || '未命名')} 的盤）</span>`;
      return `<article class="cons">
  <div class="c-head"><time>${esc(c.date)}</time> <b>${esc(c.question || '（未填問題）')}</b> ${owner}</div>
  ${c.analysis ? `<p class="analysis">${esc(c.analysis)}</p>` : ''}
  ${names.length ? `<small class="with">合盤：${names.map(esc).join('、')}</small>` : ''}
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
      return `<li class="chip link"><span>${label}<button type="button" class="linkname" data-action="open" data-id="${esc(l.id)}">${esc(l.name || '未命名')}</button>${rel}</span>${
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
  const { chart: c, draft: d } = state;
  const saved = state.selectedId ? findPerson(state.doc, state.selectedId) : null;
  return `<main class="chart-view">
<header class="topbar"><button type="button" class="btn ghost" data-action="library">‹ 列表</button><h1 class="title">${esc(saved ? saved.name : '新增命盤')}</h1></header>
${formHtml(d, !!saved)}
${msgHtml(state)}
<div class="chart-layout">
<div class="board-col">${c ? `<div class="board">
${c.palaces.map(palaceHtml).join('\n')}
${centerHtml(c, d)}
</div>` : ''}</div>
${panelHtml(state)}
</div>
</main>`;
}

export function render(state, root) {
  root.innerHTML = state.view === 'library' ? libraryHtml(state) : chartViewHtml(state);
}
