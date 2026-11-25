import { createEngine } from './engine.js';
import { render, listHtml } from './render.js';
import * as store from './store.js';
import { EMPTY_DOC, newPerson, findPerson, upsertPerson, removePerson } from './model.js';

const { chart } = createEngine(window.iztro);
const root = document.getElementById('app');

const state = {
  view: 'library', // 'library' | 'chart'
  doc: EMPTY_DOC(),
  version: '',
  q: '',
  selectedId: null, // null = 新增中、尚未儲存
  draft: null,
  chart: null,
  error: '',
  notice: '',
  panelTab: 'info',
  editingConsult: null,
  forms: { consult: {}, link: {} }, // 面板底部新增表單的草稿，重畫時不掉字
};

const draw = () => render(state, root);

const blankDraft = () => ({
  name: '', gender: 'M', calendar: 'solar', date: '1985-03-20', time: '14:00',
  leap: false, fixLeap: true, timeCertainty: 'exact', tagsText: '',
});

const draftOf = (p) => ({
  name: p.name, gender: p.gender, ...p.birth, leap: !!p.birth.leap, fixLeap: p.birth.fixLeap !== false,
  timeCertainty: p.timeCertainty || 'exact', tagsText: p.tags.join(', '),
});

function recompute() {
  try {
    state.chart = chart(state.draft);
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
    date: d.get('date') || state.draft.date,
    time: d.get('time') || state.draft.time,
    leap: d.get('calendar') === 'lunar' && d.has('leap'),
    fixLeap: d.has('fixLeap'),
    timeCertainty: d.get('timeCertainty') || 'exact',
    tagsText: d.get('tags') || '',
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
    state.version = await store.save(newDoc, state.version);
    state.doc = newDoc;
    onOk?.();
  } catch (err) {
    if (err.code === 'conflict') {
      state.doc = err.doc;
      state.version = err.version;
      state.notice = '資料已被另一個視窗更新，已重新載入，請再操作一次';
      const p = state.selectedId && findPerson(state.doc, state.selectedId);
      if (state.selectedId && !p) {
        state.view = 'library';
        state.selectedId = null;
      } else if (p) {
        // 表單草稿換成重載後的資料，否則再按一次儲存會把別人的改動蓋掉
        state.draft = draftOf(p);
        recompute();
      }
    } else {
      state.error = err.message || '儲存失敗';
    }
  }
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
    state.draft = draftOf(findPerson(state.doc, id));
  } else {
    state.draft = blankDraft();
    state.panelTab = 'info';
  }
  state.chart = null;
  recompute();
  draw();
}

const actions = {
  new: () => openChart(null),
  open: (el) => openChart(el.dataset.id),
  library: () => {
    state.view = 'library';
    state.error = '';
    state.notice = '';
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
  person(f, e) {
    state.draft = readPerson(f);
    state.error = '';
    state.notice = '';
    const ok = recompute();
    if (e.submitter?.value !== 'save') return draw();
    if (!state.draft.name) {
      state.error = '請填姓名';
      return draw();
    }
    if (!ok) return draw();
    const d = state.draft;
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
    const c = { id: crypto.randomUUID(), date: v.date, question: v.question.trim(), analysis: v.analysis.trim(), view: { scope: 'natal' }, with: v.with };
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

root.addEventListener('submit', (e) => {
  e.preventDefault();
  forms[e.target.dataset.form]?.(e.target, e);
});

// 農曆／國曆切換時立刻重畫，閏月 checkbox 才會跟著出現或消失
root.addEventListener('change', (e) => {
  if (e.target.name !== 'calendar') return;
  state.draft = readPerson(e.target.form);
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
    const { version, doc } = await store.load();
    state.doc = doc;
    state.version = version;
  } catch (err) {
    state.error = `讀取資料失敗：${err.message}`;
  }
  draw();
})();
