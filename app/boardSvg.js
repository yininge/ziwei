// 命盤 → SVG 字串（純函式、不碰 DOM，Node 與瀏覽器都能跑）。
// 版面照 render.js 的 HTML 版（文墨天機排版），以盤邊長 B=1520 為基準，字級係數同 style.css。
// 直排一律拆成單字 <text> 定位，不用 writing-mode（SVG 轉 canvas 時不可靠）。
import { visibleStars, visibleFlowStars } from './engine.js';
import { GRID } from './layout.js';

// 值對應 style.css :root（B 冷白 token）
export const DEFAULT_COLORS = {
  cMajor: '#c62828', cMinor: '#7b2fa0', cAdj: '#4a6f9c', cNatal: '#c62828', cDec: '#1b7d46', cYear: '#1f5fbf',
  cell: '#ffffff', center: '#f7f8fa', grid: '#c9ced6', frame: '#5b6470',
  ink: '#1d2025', ink2: '#4f5661', ink3: '#6b727d',
  sel: '#fdf0d5', selEdge: '#c99a45', rel: '#f6f8fb',
  onColor: '#ffffff',
};

const FONT = 'PingFang TC, Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif';
const MUT = ['祿', '權', '科', '忌'];
const YANG_STEMS = '甲丙戊庚壬';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const n1 = (v) => Math.round(v * 10) / 10;
const relatedOf = (i) => [(i + 8) % 12, (i + 4) % 12, (i + 6) % 12];

const B = 1520; // 盤邊長
const M = 40; // 外邊
const CELL = B / 4;

function text(x, y, str, { size, fill, weight = 400, anchor = 'start' }) {
  return `<text x="${n1(x)}" y="${n1(y)}" font-size="${n1(size)}" fill="${fill}"${weight !== 400 ? ` font-weight="${weight}"` : ''}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(str)}</text>`;
}

// 直排：每字一個 <text>，置中於 cx；回傳 { svg, h }。data-name 留完整名稱（可讀、也方便檢查）
function vcol(str, cx, top, fs, fill, weight = 400) {
  const chars = [...str];
  const svg = chars.map((ch, j) => text(cx, top + fs * (0.88 + 1.06 * j), ch, { size: fs, fill, weight, anchor: 'middle' })).join('');
  return { svg: `<g data-name="${esc(str)}">${svg}</g>`, h: fs * 1.06 * chars.length };
}

function starColumn(s, o, cx, top, fs, c) {
  const kind = s.type === 'major' ? 'major' : s.type === 'adjective' ? 'adj' : 'minor';
  const fill = kind === 'major' ? c.cMajor : kind === 'adj' ? c.cAdj : c.cMinor;
  const { svg: nameSvg, h } = vcol(s.name, cx, top, fs, fill, kind === 'major' ? 700 : 400);
  let out = nameSvg;
  let y = top + h;
  const fs2 = fs * 0.72;
  if (s.brightness) {
    out += text(cx, y + fs * 0.14 + fs2 * 0.85, s.brightness, { size: fs2, fill: c.ink2, anchor: 'middle' });
    y += fs * 0.14 + fs2 * 1.1;
  }
  const di = o.d ? o.d.mutagen.indexOf(s.name) : -1;
  const yi = o.y ? o.y.mutagen.indexOf(s.name) : -1;
  const badges = [];
  if (s.mutagen) badges.push([s.mutagen, c.cNatal]);
  if (di >= 0) badges.push([MUT[di], c.cDec]);
  if (yi >= 0) badges.push([MUT[yi], c.cYear]);
  const bs = fs * 0.94;
  for (const [ch, bg] of badges) {
    y += fs2 * 0.15;
    out += `<rect x="${n1(cx - bs / 2)}" y="${n1(y)}" width="${n1(bs)}" height="${n1(bs)}" rx="3" fill="${bg}"/>`;
    out += text(cx, y + bs / 2 + fs2 * 0.35, ch, { size: fs2, fill: c.onColor, anchor: 'middle' });
    y += bs;
  }
  return out;
}

// 單宮內容，座標為宮內 0..CELL；外層用巢狀 <svg> 裁切溢出
function palaceInner(p, o, selected, c) {
  const i = p.index;
  let out = '';
  // ---- 上區：星柱 ----
  const list = visibleStars(p, { showAll: false });
  const n = Math.max(list.length, 1);
  const g = list.length >= 7 ? 0.004 : 0.012;
  const fs = Math.max(14, Math.min(B * 0.03, (B * (0.234 - (n - 1) * g)) / n));
  list.forEach((s, k) => {
    const cx = B * 0.008 + fs / 2 + k * (fs + B * g);
    out += starColumn(s, o, cx, B * 0.012, fs, c);
  });
  // ---- 下區右：干支、宮名、大限區間 ----
  const gzFs = B * 0.026;
  const right = CELL - B * 0.008;
  const bottom = CELL - B * 0.006;
  const gzTop = bottom - gzFs * 1.06 * 2;
  out += vcol(p.stem, right - gzFs / 2, gzTop, gzFs, c.ink).svg;
  out += vcol(p.branch, right - gzFs / 2, gzTop + gzFs * 1.06, gzFs, c.ink).svg;
  const pnFs = B * 0.021;
  const nameStr = `${p.name}${p.isBody ? '|身' : ''}`;
  const nameX = right - gzFs - B * 0.004;
  const nameY = bottom - pnFs * 0.2;
  out += text(nameX, nameY, nameStr, { size: pnFs, fill: c.cNatal, weight: p.name === '命宮' ? 800 : 600, anchor: 'end' });
  out += text(nameX, nameY - pnFs * 1.2, `${p.range[0]}–${p.range[1]}`, { size: B * 0.015, fill: c.ink3, anchor: 'end' });
  // ---- 下區中：流曜、小標、流X／大X ----
  const fmRight = nameX - [...nameStr].length * pnFs - 14;
  let y = nameY;
  const dn = o.d?.shortNames[i];
  const yn = o.y?.shortNames[i];
  if (dn || yn) {
    let x = fmRight;
    for (const [str, fill] of [[dn, c.cDec], [yn, c.cYear]]) {
      if (!str) continue;
      out += text(x, nameY, str, { size: pnFs, fill, weight: 600, anchor: 'end' });
      x -= [...str].length * pnFs + 10;
    }
    y = nameY - pnFs * 1.05;
  }
  const tags = [yn === '流命' ? ['流年命宮', c.cYear] : null, dn === '大命' ? ['大限命宮', c.cDec] : null].filter(Boolean);
  const tFs = B * 0.013;
  for (const [str, fill] of tags) {
    const w = [...str].length * tFs + 10;
    const h = tFs * 1.5;
    out += `<rect x="${n1(fmRight - w)}" y="${n1(y - h)}" width="${n1(w)}" height="${n1(h)}" rx="2" fill="none" stroke="${fill}" stroke-width="1.5"/>`;
    out += text(fmRight - w / 2, y - h + tFs * 1.12, str, { size: tFs, fill, anchor: 'middle' });
    y -= h + 3;
  }
  const df = o.d ? visibleFlowStars(o.d.stars[i], 'decadal', { showAll: o.showAll }) : [];
  const yf = o.y ? visibleFlowStars(o.y.stars[i], 'yearly', { showAll: o.showAll }) : [];
  const cols = [...yf.map((s) => [s, c.cYear]), ...df.map((s) => [s, c.cDec])];
  if (cols.length) {
    const avail = fmRight - 8;
    const fFs = Math.min(B * 0.02, avail / (cols.length * 1.1));
    let x = fmRight - fFs / 2;
    for (let k = cols.length - 1; k >= 0; k--) {
      const [s, fill] = cols[k];
      const h = fFs * 1.06 * [...s].length;
      out += vcol(s, x, y - 6 - h, fFs, fill).svg;
      x -= fFs * 1.1;
    }
  }
  return out;
}

// 三方四正連線（端點 clamp 在中宮內，同 render.js linesHtml）
function lines(c, sel, col) {
  const clamp = (v) => Math.min(3, Math.max(1, v));
  const ctr = (i) => {
    const g = GRID[c.palaces[i].branch];
    return [M + clamp(g.col - 0.5) * CELL, M + clamp(g.row - 0.5) * CELL];
  };
  const [opp, t1, t2] = [(sel + 6) % 12, (sel + 4) % 12, (sel + 8) % 12];
  const line = (a, b) => {
    const [x1, y1] = ctr(a);
    const [x2, y2] = ctr(b);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col.selEdge}" stroke-opacity="0.7" stroke-width="3" stroke-dasharray="12 9"/>`;
  };
  return line(sel, opp) + line(sel, t1) + line(sel, t2) + line(t1, t2);
}

// 中宮：整組文字置中（x 取中宮中心），整組垂直置中；行高以 B 比例
function centerSvg(c, input, selected, hideBirth, col) {
  const cx = M + 2 * CELL;
  const name = (input.name || '').trim() || '未命名';
  const yy = YANG_STEMS.includes(c.pillars[0][0]) ? '陽' : '陰';
  const nameFs = B * 0.04, metaFs = B * 0.022, lnFs = B * 0.02;
  const pair = (l, v) => `<tspan fill="${col.ink3}">${esc(l)}：</tspan><tspan>${esc(v)}</tspan>`;
  const rows = [
    { fs: nameFs, lh: nameFs * 1.2, w: 700, fill: col.ink, body: esc(name) },
    { fs: metaFs, lh: metaFs * 1.25, gapAfter: B * 0.01, fill: col.ink3, body: esc(`${yy}${input.gender === 'M' ? '男' : '女'} · ${c.fiveElementsClass}`) },
  ];
  const ln = (...pairs) => rows.push({ fs: lnFs, lh: lnFs * 1.45, fill: col.ink, body: pairs.map(([l, v]) => pair(l, v)).join('<tspan>　</tspan>') });
  if (!hideBirth) {
    ln(['國曆', `${c.solarDate} ${input.time}`]);
    ln(['農曆', `${c.lunar} ${c.timeName}`]);
  }
  ln(['命主', c.soul], ['身主', c.body]);
  ln(['命宮', c.soulPalace], ['身宮', c.bodyPalace]);
  if (selected != null) {
    rows.push({ fs: lnFs, lh: lnFs * 1.45, gapBefore: B * 0.012, fill: col.ink, body: esc(`${c.palaces[selected].name} ‧ 三方四正：${relatedOf(selected).map((j) => c.palaces[j].name).join('、')}`) });
  }
  const total = rows.reduce((t, r) => t + (r.gapBefore || 0) + r.lh + (r.gapAfter || 0), 0);
  let y = M + 2 * CELL - total / 2; // 中宮垂直中心 = M + 2*CELL
  let out = '';
  for (const r of rows) {
    y += r.gapBefore || 0;
    out += `<text x="${n1(cx)}" y="${n1(y + r.lh / 2 + r.fs * 0.35)}" font-size="${n1(r.fs)}" fill="${r.fill}"${r.w ? ` font-weight="${r.w}"` : ''} text-anchor="middle">${r.body}</text>`;
    y += r.lh + (r.gapAfter || 0);
  }
  return out;
}

export function boardSvg({
  chart, input, decadal = null, yearly = null, selectedPalace = null, showAllFlow = false,
  hideBirth = false, colors = DEFAULT_COLORS, size = 1600, today = '',
}) {
  const col = { ...DEFAULT_COLORS, ...colors };
  const o = { d: decadal, y: yearly, showAll: !!showAllFlow };
  const sel = selectedPalace;
  let cells = '';
  for (const p of chart.palaces) {
    const pos = GRID[p.branch];
    const x = M + (pos.col - 1) * CELL;
    const y = M + (pos.row - 1) * CELL;
    const fill = sel === p.index ? col.sel : sel != null && relatedOf(sel).includes(p.index) ? col.rel : col.cell;
    cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${col.grid}" stroke-width="2"/>`;
    if (sel === p.index) {
      cells += `<rect x="${x + 2}" y="${y + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="none" stroke="${col.selEdge}" stroke-width="4"/>`;
    }
    cells += `<svg x="${x}" y="${y}" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}" overflow="hidden">${palaceInner(p, o, sel, col)}</svg>`;
  }
  const centerRect = `<rect x="${M + CELL}" y="${M + CELL}" width="${CELL * 2}" height="${CELL * 2}" fill="${col.center}" stroke="${col.grid}" stroke-width="2"/>`;
  const footer = today ? text(M + B, 1600 - 12, `紫微排盤 · ${today}`, { size: 22, fill: col.ink3, anchor: 'end' }) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1600 1600" font-family="${FONT}">
<rect width="1600" height="1600" fill="${col.cell}"/>
${cells}
${centerRect}
${centerSvg(chart, input, sel, hideBirth, col)}
${sel != null ? lines(chart, sel, col) : ''}
<rect x="${M}" y="${M}" width="${B}" height="${B}" fill="none" stroke="${col.frame}" stroke-width="4"/>
${footer}
</svg>`;
}
