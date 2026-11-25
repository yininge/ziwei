// 匯入匯出格式轉換：純函式，不碰 DOM。所有函式回新物件，不 mutate 傳入的。
import { newPerson } from './model.js';

const TEACHER = 'ziwei-chart-app';

export function detect(json) {
  if (json?.format === 'ziwei-people') return 'own';
  if (json?.format === TEACHER) return 'teacher';
  return null;
}

export function toTeacher(doc) {
  const records = doc.people.map((p) => ({
    id: p.id,
    name: p.name,
    date: p.birth.date,
    time: p.birth.time,
    gender: p.gender === 'M' ? '男' : '女',
    calendar: p.birth.calendar,
    leap: !!p.birth.leap,
    fixLeap: p.birth.fixLeap !== false,
    category: p.tags[0] || '未分類',
    notes: '',
    updatedAt: p.updatedAt,
  }));
  return { format: TEACHER, version: 1, records, categories: [...new Set(doc.people.flatMap((p) => p.tags))] };
}

export function fromTeacher(json, doc) {
  const seen = new Set(doc.people.map((p) => p.id));
  const added = [];
  for (const r of json.records || []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const at = r.updatedAt || new Date().toISOString();
    const notes = (r.notes || '').trim();
    added.push(
      newPerson({
        id: r.id,
        name: r.name || '',
        gender: r.gender === '女' ? 'F' : 'M',
        birth: {
          calendar: r.calendar === 'lunar' ? 'lunar' : 'solar',
          date: r.date,
          time: r.time,
          leap: !!r.leap,
          fixLeap: r.fixLeap !== false,
        },
        tags: r.category && r.category !== '未分類' ? [r.category] : [],
        consultations: notes
          ? [{ id: globalThis.crypto.randomUUID(), date: at.slice(0, 10), question: '', analysis: r.notes, view: {}, with: [] }]
          : [],
        createdAt: at,
        updatedAt: at,
      }),
    );
  }
  return { ...doc, people: [...doc.people, ...added] };
}
