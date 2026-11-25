import { createEngine } from './engine.js';
import { toTeacher, fromTeacher, detect } from './format.js';
import { render, listHtml } from './render.js';
import { boardSvg, DEFAULT_COLORS } from './boardSvg.js';
import { svgToPngBlob, sharePng } from './share.js';
import * as store from './store.js';
import { randomSalt, deriveKey, encryptDoc, decryptDoc, isEncrypted } from './crypto.js';
import * as keystore from './keystore.js';
import { EMPTY_DOC, newPerson, findPerson, upsertPerson, removePerson } from './model.js';

const engine = createEngine(window.iztro);
const { chart } = engine;
const root = document.getElementById('app');

const state = {
  view: 'unlock', // 'unlock' | 'setup' | 'library' | 'chart' | 'compare'
  key: null, // CryptoKey；只在記憶體（記住這台裝置時另存 IndexedDB）
  kdf: null, // { salt, iterations }
  raw: null, // 伺服器上最新的密文 envelope（解鎖用）
  plain: null, // setup 時待加密的既有明文 doc
  engine, // render 疊盤用
  doc: EMPTY_DOC(),
  version: '',
  q: '',
  filterTag: null, // null = 全部
  sort: 'recent', // 'recent' | 'name' | 'birth'
  selectedId: null, // null = 新增中、尚未儲存
  boards: [], // chart view 只用 [0]；compare 用 [0]、[1]
  showAllFlow: false,
  hideBirth: false, // 只影響盤面與輸出圖，表單照常顯示
  sharing: false,
  compare: { side: 0, syncYear: true },
  error: '',
  notice: '',
  panelTab: 'info',
  editingConsult: null,
  forms: { consult: {}, link: {} }, // 面板底部新增表單的草稿，重畫時不掉字
};

// 列表縮影用的 chart 快取：key = id + updatedAt，列表重畫不重算；排盤失敗存 null
const chartCache = new Map();
state.chartOf = (p) => {
  const k = p.id + p.updatedAt;
  if (!chartCache.has(k)) {
    try { chartCache.set(k, chart({ name: p.name, gender: p.gender, ...p.birth, leap: !!p.birth.leap, fixLeap: true, timeCertainty: p.timeCertainty || 'exact' })); } catch { chartCache.set(k, null); }
  }
  return chartCache.get(k);
};

const draw = () => render(state, root);

const blankDraft = () => ({
  name: '', gender: 'M', calendar: 'solar', date: '1985-03-20', time: '14:00',
  leap: false, fixLeap: true, timeCertainty: 'exact', tagsText: '',
});

const draftOf = (p) => ({
  name: p.name, gender: p.gender, ...p.birth, leap: !!p.birth.leap, fixLeap: true, // fixLeap 固定開（跟老師的站一致）
  timeCertainty: p.timeCertainty || 'exact', tagsText: p.tags.join(', '),
});

const blankBoard = (personId, draft) => ({
  personId, draft, chart: null, decadalOrder: null, year: null, selectedPalace: null,
});
const A = () => state.boards[0];

function recompute(board = A()) {
  try {
    board.chart = chart(board.draft);
    return true;
  } catch (err) {
    state.error = `排盤失敗：${err.message}`; // 表單留著、上一張盤留著
    return false;
  }
}

function readPerson(f) {
  const d = new FormData(f);
  return {
    name: (d.get('name') || '').trim(),
    gender: d.get('gender'),
    calendar: d.get('calendar'),
    date: d.get('date') || A().draft.date,
    time: d.get('time') || A().draft.time,
    leap: d.get('calendar') === 'lunar' && d.has('leap'),
    fixLeap: true,
    timeCertainty: d.get('timeCertainty') || 'exact',
    // 勾選的 chips + 自訂欄，逗號／頓號分隔、trim、去重
    tagsText: [...new Set([...d.getAll('tags'), ...(d.get('tagsExtra') || '').split(/[,，、]/)].map((t) => t.trim()).filter(Boolean))].join(', '),
  };
}

const readConsult = (f) => {
  const d = new FormData(f);
  return { date: d.get('date') || '', question: d.get('question') || '', analysis: d.get('analysis') || '', with: d.getAll('with') };
};
const readLink = (f) => {
  const d = new FormData(f);
  return { to: d.get('to') || '', relation: (d.get('relation') || '').trim(), note: (d.get('note') || '').trim() };
};

// 所有改資料的動作：算好新 doc → 存 → 成功才換 state。
async function commit(newDoc, onOk) {
  state.notice = '';
  state.error = '';
  try {
    const envelope = await encryptDoc(newDoc, state.key, state.kdf);
    state.version = await store.save(envelope, state.version);
    state.raw = envelope;
    state.doc = newDoc;
    onOk?.();
  } catch (err) {
    if (err.code === 'conflict') {
      state.version = err.version;
      if (isEncrypted(err.doc)) {
        state.raw = err.doc;
        try {
          state.doc = await decryptDoc(err.doc, state.key);
          state.kdf = { salt: err.doc.kdf.salt, iterations: err.doc.kdf.iterations };
        } catch {
          return lock('資料在別處被重新加密（passphrase 可能已更換），請重新解鎖');
        }
      } else {
        state.doc = err.doc;
      }
      state.notice = '資料已被另一個視窗更新，已重新載入，請再操作一次';
      const p = state.selectedId && findPerson(state.doc, state.selectedId);
      if (state.selectedId && !p) {
        state.view = 'library';
        state.selectedId = null;
      } else if (p) {
        // 表單草稿換成重載後的資料，否則再按一次儲存會把別人的改動蓋掉
        A().draft = draftOf(p);
        recompute();
      }
    } else {
      state.error = err.message || '儲存失敗';
    }
  }
  draw();
}

async function lock(msg = '') {
  await keystore.forget();
  Object.assign(state, { key: null, doc: EMPTY_DOC(), view: 'unlock', selectedId: null, boards: [], q: '', filterTag: null, notice: '', error: msg });
  draw();
}

function enterLibrary() {
  state.view = 'library';
  state.error = '';
  state.notice = '';
  draw();
}

const me = () => findPerson(state.doc, state.selectedId);
const withPerson = (fn) => upsertPerson(state.doc, fn(me()));

function openChart(id) {
  state.view = 'chart';
  state.selectedId = id;
  state.error = '';
  state.notice = '';
  state.editingConsult = null;
  state.forms = { consult: {}, link: {} };
  if (id) {
    state.boards = [blankBoard(id, draftOf(findPerson(state.doc, id)))];
  } else {
    state.boards = [blankBoard(null, blankDraft())];
    state.panelTab = 'info';
  }
  recompute();
  draw();
}

// 合盤用：依已存的人建一張從本命開始的盤
function boardOf(id) {
  const b = blankBoard(id, draftOf(findPerson(state.doc, id)));
  recompute(b);
  return b;
}

function overlaysOf(b) {
  const o = { d: null, y: null };
  try { if (b.decadalOrder) o.d = engine.decadalOverlay(b.chart, b.decadalOrder); } catch { /* 略過 */ }
  try { if (b.year) o.y = engine.yearlyOverlay(b.chart, b.year); } catch { /* 略過 */ }
  return o;
}

const boardEl = (el) => state.boards[Number(el.dataset.board)];

function download(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const stamp = () => new Date().toLocaleDateString('sv-SE');

async function importFile(file) {
  state.error = '';
  state.notice = '';
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    state.error = '匯入失敗：不是有效的 JSON 檔';
    return draw();
  }
  const kind = detect(json);
  if (kind === 'own') {
    if (!Array.isArray(json.people)) {
      state.error = '匯入失敗：缺少 people 欄位';
      return draw();
    }
    if (!confirm('會以匯入的內容取代目前全部資料，確定？')) return draw();
    return commit(json, () => {
      state.notice = `已匯入 ${json.people.length} 人（取代原有資料）`;
    });
  }
  if (kind === 'teacher') {
    const next = fromTeacher(json, state.doc);
    const n = next.people.length - state.doc.people.length;
    return commit(next, () => {
      state.notice = `已匯入 ${n} 人（略過 ${(json.records || []).length - n} 筆重複）`;
    });
  }
  state.error = '匯入失敗：不認得的格式';
  draw();
}

const actions = {
  new: () => openChart(null),
  open: (el) => openChart(el.dataset.id),
  lock: () => lock(),
  library: () => {
    state.view = 'library';
    state.error = '';
    state.notice = '';
    draw();
  },
  'filter-tag': (el) => {
    state.filterTag = state.filterTag === el.dataset.tag || !el.dataset.tag ? null : el.dataset.tag;
    draw();
  },
  tab: (el) => {
    state.panelTab = el.dataset.tab;
    state.editingConsult = null;
    draw();
  },
  delete: () => {
    const p = me();
    if (!p || !confirm(`刪除「${p.name}」？此人的問題與分析、關聯也會一併刪除，無法復原。`)) return;
    commit(removePerson(state.doc, p.id), () => {
      state.view = 'library';
      state.selectedId = null;
    });
  },
  palace: (el) => {
    const b = boardEl(el);
    const i = Number(el.dataset.index);
    b.selectedPalace = b.selectedPalace === i ? null : i;
    draw();
  },
  decadal: (el) => {
    const b = boardEl(el);
    const o = Number(el.dataset.order);
    b.decadalOrder = b.decadalOrder === o ? null : o;
    draw();
  },
  year: (el) => {
    const b = boardEl(el);
    const y = Number(el.dataset.year);
    const next = b.year === y ? null : y;
    if (state.view === 'compare' && state.compare.syncYear) state.boards.forEach((x) => (x.year = next));
    else b.year = next;
    draw();
  },
  showflow: (el) => {
    state.showAllFlow = el.checked;
    draw();
  },
  'hide-birth': () => {
    state.hideBirth = !state.hideBirth;
    draw();
  },
  async share(el) {
    const b = boardEl(el);
    if (!b?.chart || state.sharing) return;
    state.sharing = true;
    state.error = '';
    draw();
    try {
      const css = getComputedStyle(document.documentElement);
      const colors = {};
      for (const k of Object.keys(DEFAULT_COLORS)) {
        const v = css.getPropertyValue('--' + k.replace(/[A-Z0-9]/g, (m) => '-' + m.toLowerCase())).trim();
        if (v) colors[k] = v;
      }
      const o = overlaysOf(b);
      const today = stamp();
      const svg = boardSvg({
        chart: b.chart, input: b.draft, decadal: o.d, yearly: o.y, selectedPalace: b.selectedPalace,
        showAllFlow: state.showAllFlow, hideBirth: state.hideBirth, colors, size: 1600, today,
      });
      const blob = await svgToPngBlob(svg, 1600);
      await sharePng(blob, `${(b.draft.name || '').trim() || '命盤'}-${today.replaceAll('-', '')}.png`);
    } catch (err) {
      state.error = `分享圖片失敗：${err.message}`;
    }
    state.sharing = false;
    draw();
  },
  sync: (el) => {
    state.compare.syncYear = el.checked;
    draw();
  },
  side: (el) => {
    state.compare.side = Number(el.dataset.side);
    draw();
  },
  compare: (el) => {
    if (!state.selectedId || !findPerson(state.doc, el.dataset.id)) return;
    Object.assign(A(), { decadalOrder: null, year: null, selectedPalace: null });
    state.boards = [A(), boardOf(el.dataset.id)];
    state.compare.side = 0;
    state.view = 'compare';
    draw();
  },
  'compare-back': () => {
    state.view = 'chart';
    state.boards = [A()];
    draw();
  },
  'cons-view': (el) => {
    const c = me()?.consultations.find((x) => x.id === el.dataset.cid);
    if (!c) return;
    Object.assign(A(), {
      decadalOrder: c.view?.decadalOrder ?? null,
      year: c.view?.year ?? null,
      selectedPalace: c.view?.palace ?? null,
    });
    draw();
  },
  // 生辰快速輸入：8 位 YYYYMMDD 或 12 位 YYYYMMDDHHmm；日曆模式不動（農曆模式就當農曆日期填入）
  quick: () => {
    const f = root.querySelector('form[data-form="person"]');
    const input = f?.querySelector('[data-role="quick"]');
    if (!f || !input) return;
    A().draft = readPerson(f); // 先收住表單上已改的欄位
    state.error = '';
    state.notice = '';
    const v = input.value.replace(/\D/g, '');
    if (v.length !== 8 && v.length !== 12) {
      state.error = '要 8 或 12 位數字';
      return draw();
    }
    const [y, m, d, hh, mm] = [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8), v.slice(8, 10), v.slice(10, 12)];
    const solarOk = A().draft.calendar === 'lunar' || new Date(+y, +m - 1, +d).getDate() === +d;
    if (+m < 1 || +m > 12 || +d < 1 || +d > 31 || !solarOk || (v.length === 12 && (+hh > 23 || +mm > 59))) {
      state.error = '日期或時間不合理';
      return draw();
    }
    A().draft.date = `${y}-${m}-${d}`;
    if (v.length === 12) A().draft.time = `${hh}:${mm}`;
    recompute();
    draw();
  },
  'export-own': () => download(`ziwei-people-${stamp()}.json`, state.doc),
  'export-teacher': () => download(`ziwei-chart-app-${stamp()}.json`, toTeacher(state.doc)),
  import: () => root.querySelector('[data-role="import"]')?.click(),
  'cons-edit': (el) => {
    state.editingConsult = el.dataset.cid;
    draw();
  },
  'cons-cancel': () => {
    state.editingConsult = null;
    draw();
  },
  'cons-del': (el) => {
    if (!confirm('刪除這筆問題與分析？')) return;
    commit(withPerson((p) => ({ ...p, consultations: p.consultations.filter((c) => c.id !== el.dataset.cid) })));
  },
  'link-del': (el) => {
    commit(withPerson((p) => ({ ...p, links: p.links.filter((l) => l.id !== el.dataset.id) })));
  },
};

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && root.contains(el)) actions[el.dataset.action]?.(el);
});

const forms = {
  async unlock(f) {
    const d = new FormData(f);
    state.error = '';
    if (!state.raw) {
      state.error = '尚未讀到資料，請重新整理頁面';
      return draw();
    }
    try {
      const kdf = state.raw.kdf;
      const key = await deriveKey(d.get('pass') || '', kdf.salt, kdf.iterations);
      state.doc = await decryptDoc(state.raw, key);
      state.key = key;
      state.kdf = { salt: kdf.salt, iterations: kdf.iterations };
      if (d.has('remember')) await keystore.remember(key, state.kdf);
      return enterLibrary();
    } catch {
      state.error = 'passphrase 錯誤';
      draw();
    }
  },
  async setup(f) {
    const d = new FormData(f);
    const pass = d.get('pass') || '';
    state.error = '';
    if (pass.length < 8) state.error = 'passphrase 至少 8 個字';
    else if (pass !== d.get('pass2')) state.error = '兩次輸入不一樣';
    if (state.error) return draw();
    const kdf = { salt: randomSalt(), iterations: 600000 };
    state.key = await deriveKey(pass, kdf.salt, kdf.iterations);
    state.kdf = kdf;
    await commit(state.plain || EMPTY_DOC(), () => {
      state.plain = null;
      state.view = 'library';
    });
    if (state.view === 'setup') {
      state.key = null; // 沒存成功就不算設定完成
      return;
    }
    if (d.has('remember')) await keystore.remember(state.key, state.kdf);
  },
  person(f, e) {
    A().draft = readPerson(f);
    state.error = '';
    state.notice = '';
    const ok = recompute();
    if (e.submitter?.value !== 'save') return draw();
    if (!A().draft.name) {
      state.error = '請填姓名';
      return draw();
    }
    if (!ok) return draw();
    const d = A().draft;
    const fields = {
      name: d.name,
      gender: d.gender,
      birth: { calendar: d.calendar, date: d.date, time: d.time, leap: d.leap, fixLeap: d.fixLeap },
      timeCertainty: d.timeCertainty,
      tags: d.tagsText.split(/[,，、]/).map((t) => t.trim()).filter(Boolean),
    };
    const person = state.selectedId ? { ...me(), ...fields } : newPerson(fields);
    commit(upsertPerson(state.doc, person), () => {
      state.selectedId = person.id;
    });
  },
  'consult-new'(f) {
    const v = readConsult(f);
    state.forms.consult = v;
    if (!v.question.trim() && !v.analysis.trim()) {
      state.error = '問題或分析至少填一項';
      return draw();
    }
    const c = { id: crypto.randomUUID(), date: v.date, question: v.question.trim(), analysis: v.analysis.trim(), view: { decadalOrder: A().decadalOrder, year: A().year, palace: A().selectedPalace }, with: v.with };
    commit(withPerson((p) => ({ ...p, consultations: [...p.consultations, c] })), () => {
      state.forms.consult = {};
    });
  },
  'consult-edit'(f) {
    const v = readConsult(f);
    const cid = new FormData(f).get('cid');
    commit(
      withPerson((p) => ({
        ...p,
        consultations: p.consultations.map((c) =>
          c.id === cid ? { ...c, date: v.date, question: v.question.trim(), analysis: v.analysis.trim(), with: v.with } : c,
        ),
      })),
      () => {
        state.editingConsult = null;
      },
    );
  },
  'link-new'(f) {
    const v = readLink(f);
    state.forms.link = v;
    if (!v.to) return;
    commit(withPerson((p) => ({ ...p, links: [...p.links, { id: v.to, relation: v.relation, note: v.note }] })), () => {
      state.forms.link = {};
    });
  },
};

// 快速輸入欄按 Enter = 套用，不送出整張表單
root.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing && e.target.dataset?.role === 'quick') {
    e.preventDefault();
    actions.quick();
  }
});

root.addEventListener('submit', (e) => {
  e.preventDefault();
  forms[e.target.dataset.form]?.(e.target, e);
});

// 農曆／國曆切換時立刻重畫，閏月 checkbox 才會跟著出現或消失
root.addEventListener('change', (e) => {
  if (e.target.dataset.role === 'import') {
    const file = e.target.files[0];
    e.target.value = ''; // 同一個檔可以再選一次
    if (file) importFile(file);
    return;
  }
  if (e.target.dataset.role === 'sort') {
    state.sort = e.target.value;
    root.querySelector('#list').innerHTML = listHtml(state);
    return;
  }
  if (e.target.name !== 'calendar') return;
  A().draft = readPerson(e.target.form);
  recompute();
  draw();
});

root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.role === 'search') {
    state.q = t.value;
    root.querySelector('#list').innerHTML = listHtml(state);
    return;
  }
  const f = t.closest('form[data-draft]');
  if (f?.dataset.draft === 'consult') state.forms.consult = readConsult(f);
  else if (f?.dataset.draft === 'link') state.forms.link = readLink(f);
});

(async () => {
  try {
    const { version, raw } = await store.load();
    state.version = version;
    if (isEncrypted(raw)) {
      state.raw = raw;
      const mem = await keystore.getRemembered();
      if (mem) {
        try {
          state.doc = await decryptDoc(raw, mem.key);
          state.key = mem.key;
          state.kdf = { salt: raw.kdf.salt, iterations: raw.kdf.iterations };
          state.view = 'library';
        } catch { /* 記住的金鑰失效（換過 passphrase）→ 解鎖畫面 */ }
      }
    } else {
      state.plain = raw?.format === 'ziwei-people' && Array.isArray(raw.people) ? raw : EMPTY_DOC();
      state.view = 'setup';
    }
  } catch (err) {
    state.error = `讀取資料失敗：${err.message}`;
  }
  draw();
})();
