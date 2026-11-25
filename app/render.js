import { visibleStars } from './engine.js';
import { GRID } from './layout.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const MUTAGEN_CLASS = { 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' };

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

function formHtml(input) {
  const lunar = input.calendar === 'lunar';
  const chk = (b) => (b ? ' checked' : '');
  return `<form class="inputs" autocomplete="off">
  <label>姓名 <input name="name" type="text" value="${esc(input.name)}" placeholder="可不填"></label>
  <span class="grp">
    <label><input type="radio" name="calendar" value="solar"${chk(!lunar)}> 國曆</label>
    <label><input type="radio" name="calendar" value="lunar"${chk(lunar)}> 農曆</label>
  </span>
  <label>日期 <input name="date" type="date" value="${esc(input.date)}" required></label>
  <label>時間 <input name="time" type="time" value="${esc(input.time)}" required></label>
  <span class="grp">
    <label><input type="radio" name="gender" value="M"${chk(input.gender === 'M')}> 男</label>
    <label><input type="radio" name="gender" value="F"${chk(input.gender === 'F')}> 女</label>
  </span>
  ${lunar ? `<label><input type="checkbox" name="leap"${chk(input.leap)}> 閏月</label>` : ''}
  <label><input type="checkbox" name="fixLeap"${chk(input.fixLeap !== false)}> 閏月後半算下月</label>
  <button type="submit">排盤</button>
</form>`;
}

export function render(state, root) {
  const { chart: c, input, error } = state;
  root.innerHTML = `<main>
${formHtml(input)}
${error ? `<p class="error">排盤失敗：${esc(error)}</p>` : ''}
${c ? `<div class="board">
${c.palaces.map(palaceHtml).join('\n')}
${centerHtml(c, input)}
</div>` : ''}
</main>`;
}
