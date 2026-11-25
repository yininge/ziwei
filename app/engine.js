// 排盤 engine：純函式、不碰 DOM、iztro 由外部注入。
export const FLOW_WHITELIST = {
  decadal: ['運祿', '運羊', '運陀'],
  yearly: ['流祿', '流羊', '流陀', '流鸞', '流喜'],
};
export const VISIBLE_ADJECTIVE_STARS = ['紅鸞', '天喜'];
export const SHORT_PALACE = {
  命宮: '命', 兄弟: '兄', 夫妻: '夫', 子女: '子', 財帛: '財', 疾厄: '疾',
  遷移: '遷', 僕役: '友', 官祿: '官', 田宅: '田', 福德: '福', 父母: '父',
};

export function timeIndexOf(hour) {
  return hour === 23 ? 12 : Math.floor((hour + 1) / 2);
}

const fixRun = (s) => String(s).replaceAll('闰', '閏');

export function visibleStars(palace, { showAll = false } = {}) {
  return palace.stars.filter(
    (s) => showAll || s.type !== 'adjective' || VISIBLE_ADJECTIVE_STARS.includes(s.name),
  );
}

export function visibleFlowStars(names, scope, { showAll = false } = {}) {
  const list = showAll ? names : names.filter((n) => FLOW_WHITELIST[scope].includes(n));
  return scope === 'decadal' ? list.map((n) => (n.startsWith('運') ? '大' + n.slice(1) : n)) : list;
}

// 該年虛歲落在哪個大限（1..12）；太小或太老、或排不出該年 → null
export function decadalOrderForYear(c, year) {
  let age;
  try {
    age = c._raw.horoscope(`${year}-07-01`).age.nominalAge;
  } catch {
    return null;
  }
  const d = c.decadals.find((x) => age >= x.range[0] && age <= x.range[1]);
  return d ? d.order : null;
}

export function createEngine(iztro) {
  // 老師流派：庚干 陽武同相，其餘預設
  iztro.astro.config({ mutagens: { 庚: ['太陽', '武曲', '天同', '天相'] } });

  const mapStars = (p) => {
    const out = [];
    for (const [list, type] of [[p.majorStars, 'major'], [p.minorStars, 'minor'], [p.adjectiveStars, 'adjective']]) {
      for (const s of list || []) {
        const o = { name: s.name };
        if (s.brightness) o.brightness = s.brightness;
        if (s.mutagen) o.mutagen = s.mutagen;
        o.type = type;
        out.push(o);
      }
    }
    return out;
  };

  const genderOf = (input) => (input.gender === 'M' ? '男' : '女');

  const raw = (input) => {
    const [y, m, d] = input.date.split('-').map(Number);
    const ti = timeIndexOf(Number(input.time.split(':')[0]));
    const fixLeap = input.fixLeap !== false;
    if (input.calendar === 'lunar') {
      return iztro.astro.byLunar(`${y}-${m}-${d}`, ti, genderOf(input), !!input.leap, fixLeap, 'zh-TW');
    }
    return iztro.astro.bySolar(input.date, ti, genderOf(input), fixLeap, 'zh-TW');
  };

  function chart(input) {
    const a = raw(input);
    const hour = Number(input.time.split(':')[0]);
    // iztro 晚子時 lunarDate 會進位到隔天；老師顯示未調整的日期
    const a0 = hour === 23
      ? iztro.astro.bySolar(a.solarDate, 0, genderOf(input), input.fixLeap !== false, 'zh-TW')
      : a;
    const palaces = a.palaces.map((p, index) => ({
      index,
      name: p.name,
      stem: p.heavenlyStem,
      branch: p.earthlyBranch,
      isBody: p.isBodyPalace,
      range: [...p.decadal.range],
      stars: mapStars(p),
    }));
    const decadals = palaces
      .map((p) => ({ palaceIndex: p.index, stem: p.stem, branch: p.branch, range: p.range }))
      .sort((x, y) => x.range[0] - y.range[0])
      .map((d, i) => ({ order: i + 1, ...d }));
    const c = {
      input,
      birthYear: Number(a.solarDate.split('-')[0]),
      solarDate: a.solarDate,
      lunar: fixRun(a0.lunarDate),
      pillars: a.chineseDate.split(' '),
      fiveElementsClass: a.fiveElementsClass,
      soul: a.soul,
      body: a.body,
      soulPalace: a.earthlyBranchOfSoulPalace,
      bodyPalace: a.earthlyBranchOfBodyPalace,
      timeName: a.time,
      zodiac: a.zodiac,
      sign: a.sign,
      palaces,
      decadals,
    };
    // 保留 iztro astrolabe 供疊盤用；不可列舉，避免 deepEqual / JSON 帶出
    Object.defineProperty(c, '_raw', { value: a, enumerable: false });
    return c;
  }

  const overlayBase = (h, prefix) => ({
    palaceNames: h.palaceNames,
    shortNames: h.palaceNames.map((n) => prefix + SHORT_PALACE[n]),
    stars: h.stars.map((l) => l.map((s) => s.name)),
    mutagen: h.mutagen,
  });

  function decadalOverlay(c, order) {
    const d = c.decadals.find((x) => x.order === order);
    if (!d) throw new Error(`invalid decadal order: ${order}`);
    const year = c.birthYear + d.range[0] + 4;
    const h = c._raw.horoscope(`${year}-07-01`);
    if (h.decadal.earthlyBranch !== d.branch) {
      throw new Error(`decadal branch mismatch: iztro ${h.decadal.earthlyBranch} vs palace ${d.branch}`);
    }
    return {
      order, palaceIndex: d.palaceIndex, stem: d.stem, branch: d.branch, range: d.range,
      ...overlayBase(h.decadal, '大'),
    };
  }

  function yearlyOverlay(c, year) {
    const h = c._raw.horoscope(`${year}-07-01`);
    return {
      year, stem: h.yearly.heavenlyStem, branch: h.yearly.earthlyBranch,
      nominalAge: h.age.nominalAge, realAge: year - c.birthYear,
      ...overlayBase(h.yearly, '流'),
    };
  }

  return { chart, decadalOverlay, yearlyOverlay };
}
