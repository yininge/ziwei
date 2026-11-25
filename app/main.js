import { createEngine } from './engine.js';
import { render } from './render.js';

const { chart } = createEngine(window.iztro);
const root = document.getElementById('app');

const state = {
  input: { name: '', calendar: 'solar', date: '1985-03-20', time: '14:00', gender: 'M', leap: false, fixLeap: true },
  chart: null,
};

function update() {
  try {
    state.chart = chart(state.input);
    state.error = '';
  } catch (err) {
    state.error = err.message; // 表單留著、上一張盤留著，只多一行錯誤
  }
  render(state, root);
}

// 農曆／國曆切換時立刻重畫，閏月 checkbox 才會跟著出現或消失
root.addEventListener('change', (e) => {
  if (e.target.name !== 'calendar') return;
  const f = e.target.form;
  state.input = readForm(f);
  update();
});

function readForm(f) {
  const d = new FormData(f);
  return {
    name: d.get('name') || '',
    calendar: d.get('calendar'),
    date: d.get('date') || state.input.date,
    time: d.get('time') || state.input.time,
    gender: d.get('gender'),
    leap: d.get('calendar') === 'lunar' && d.has('leap'),
    fixLeap: d.has('fixLeap'),
  };
}

root.addEventListener('submit', (e) => {
  e.preventDefault();
  state.input = readForm(e.target);
  update();
});

update();
