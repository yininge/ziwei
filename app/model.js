// 資料模型：純函式，不碰 DOM／fetch。所有更新都回新 doc，不 mutate 傳入的。
export const EMPTY_DOC = () => ({ format: 'ziwei-people', version: 1, people: [] });

const uid = () => globalThis.crypto.randomUUID();
const nowIso = () => new Date().toISOString();

export function newPerson(fields = {}) {
  const t = nowIso();
  return {
    id: uid(),
    name: '',
    gender: 'M',
    birth: { calendar: 'solar', date: '1985-03-20', time: '14:00', leap: false, fixLeap: true },
    timeCertainty: 'exact',
    tags: [],
    consultations: [],
    links: [],
    createdAt: t,
    updatedAt: t,
    ...fields,
  };
}

export const findPerson = (doc, id) => doc.people.find((p) => p.id === id);

export function upsertPerson(doc, person) {
  const next = { ...person, updatedAt: nowIso() };
  const exists = doc.people.some((p) => p.id === person.id);
  return {
    ...doc,
    people: exists ? doc.people.map((p) => (p.id === person.id ? next : p)) : [...doc.people, next],
  };
}

export function removePerson(doc, id) {
  return {
    ...doc,
    people: doc.people
      .filter((p) => p.id !== id)
      .map((p) => ({
        ...p,
        links: p.links.filter((l) => l.id !== id),
        consultations: p.consultations.map((c) => ({ ...c, with: c.with.filter((w) => w !== id) })),
      })),
  };
}

export function linksOf(doc, id) {
  const me = findPerson(doc, id);
  if (!me) return [];
  const out = [];
  for (const l of me.links) {
    const o = findPerson(doc, l.id);
    if (o) out.push({ id: o.id, name: o.name, relation: l.relation, note: l.note, direction: 'out' });
  }
  for (const o of doc.people) {
    if (o.id === id) continue;
    for (const l of o.links) {
      if (l.id === id) out.push({ id: o.id, name: o.name, relation: l.relation, note: l.note, direction: 'in' });
    }
  }
  return out;
}

export function consultationsOf(doc, id) {
  const out = [];
  for (const p of doc.people) {
    for (const c of p.consultations) {
      if (p.id === id || c.with.includes(id)) out.push({ ...c, ownerId: p.id, ownerName: p.name });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function search(doc, q, sort = 'recent') {
  const needle = (q || '').trim().toLowerCase();
  const hit = (s) => String(s ?? '').toLowerCase().includes(needle);
  const list = needle
    ? doc.people.filter(
        (p) => hit(p.name) || p.tags.some(hit) || p.consultations.some((c) => hit(c.question) || hit(c.analysis)),
      )
    : doc.people;
  if (sort === 'name') return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));
  if (sort === 'birth') return [...list].sort((a, b) => (a.birth.date < b.birth.date ? -1 : a.birth.date > b.birth.date ? 1 : 0));
  // 「最近有動靜」= max(updatedAt, 最新問事日期)；問事日期（YYYY-MM-DD）與 ISO 字串可直接字典序比較
  const key = (p) => {
    const d = consultationsOf(doc, p.id)[0]?.date || '';
    return d > p.updatedAt ? d : p.updatedAt;
  };
  const k = new Map(list.map((p) => [p.id, key(p)]));
  return [...list].sort((a, b) => (k.get(a.id) < k.get(b.id) ? 1 : k.get(a.id) > k.get(b.id) ? -1 : 0));
}

export const filterByTag = (list, tag) => (tag ? list.filter((p) => p.tags.includes(tag)) : list);

export function relationSuggestions(doc) {
  const set = new Set();
  for (const p of doc.people) for (const l of p.links) if (l.relation) set.add(l.relation);
  return [...set];
}

export const PRESET_TAGS = ['家人', '朋友', '個案', '學員', '合作'];

// 預設在前，其餘依 doc 裡出現順序，去重
export const allTags = (doc) => [...new Set([...PRESET_TAGS, ...doc.people.flatMap((p) => p.tags)])];
