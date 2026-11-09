/* Gym Tracker v2 — локальный PWA-трекер тренировок. Все данные в localStorage этого браузера. */
(() => {
'use strict';
const KEY = 'gymtracker.v2';
const GROUPS = ['Грудь', 'Спина', 'Плечи', 'Бицепс', 'Трицепс', 'Ноги', 'Пресс', 'Другое'];
const RESTS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = iso => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
const fmtShort = iso => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '';
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const fmtNum = v => { v = Math.round(v * 10) / 10; return v.toLocaleString('ru-RU', { maximumFractionDigits: 1 }); };
const fmtKg = v => Math.round(v).toLocaleString('ru-RU');
const fw = w => num(w) ? fmtNum(num(w)) : 'СВ';
const setStr = s => `${fw(s.w)}×${num(s.r) || '—'}`;
const tonnage = sets => sets.reduce((a, s) => a + num(s.w) * num(s.r), 0);
const repsSum = sets => sets.reduce((a, s) => a + num(s.r), 0);
const fmtDur = s => { if (s == null) return '—'; s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`; };
const fmtDurW = s => { if (s == null) return '—'; if (s < 60) return `${Math.round(s)} с`; const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c); };
const firstNum = s => { const m = String(s || '').match(/\d+/); return m ? +m[0] : 0; };

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2200); }


/* ---------- SF-style icons ---------- */
const svg = (d, w = 20, sw = 2) => `<svg class="ic" width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>', 18),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', 18),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 18),
  bubble: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>', 18),
  more: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>', 18),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 18),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>', 18),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', 18),
  play: '<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 18, 2.6),
  chev: svg('<path d="M9 5l7 7-7 7"/>', 16, 2.4),
  back: svg('<path d="M15 5l-7 7 7 7"/>', 20, 2.4),
  done: '<svg width="72" height="72" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="var(--good)"/><path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ---------- state ---------- */
function emptyState() {
  return { v: 2, week: { id: uid(), start: todayISO(), end: null, days: [{ id: 'd1', name: 'День 1', exercises: [] }] },
    weeks: [], workouts: [], bank: [], active: null, settings: { rest: 90, sound: true, vibro: true, wake: true } };
}
function migrate(o) {
  const e = emptyState();
  o = Object.assign(e, o);
  o.settings = Object.assign(emptyState().settings, o.settings || {});
  o.weeks = o.weeks || []; o.workouts = o.workouts || []; o.bank = o.bank || [];
  return o;
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { console.warn(e); }
  return window.SEED ? migrate(clone(window.SEED)) : emptyState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert('Не удалось сохранить данные: ' + e.message); } }

let S = load();
let ui = { tab: 'week', view: null, p: {} };
let statsUI = { mode: 'week', weekId: null, metric: 'top', ex: null };
let bankQuery = '';
const openNotes = new Set();
const chartTips = {};

/* ---------- queries ---------- */
const allWeeks = () => [...S.weeks, S.week].sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
const weekById = id => allWeeks().find(w => w.id === id);
const weekWorkouts = wid => S.workouts.filter(t => t.weekId === wid).sort((a, b) => a.ts - b.ts);
const dayWorkout = dayId => weekWorkouts(S.week.id).filter(t => t.dayId === dayId).pop();
const workoutById = id => S.workouts.find(t => t.id === id);
const byTsDesc = () => [...S.workouts].sort((a, b) => b.ts - a.ts);
function lastOcc(name, beforeTs = Infinity, n = 1) {
  const out = [];
  for (const t of byTsDesc()) {
    if (t.ts >= beforeTs) continue;
    const e = t.exercises.find(x => x.name === name);
    if (e) { out.push({ t, e }); if (out.length >= n) break; }
  }
  return out;
}
function prevSameDay(t) {
  return byTsDesc().find(x => x.id !== t.id && x.ts < t.ts && (x.dayId === t.dayId || x.dayName === t.dayName));
}
const wDate = t => t.dateUnknown ? 'дата не указана' : fmtDate(t.date);

/* ---------- audio / vibro / wake lock ---------- */
let actx = null, wl = null;
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const b = actx.createBuffer(1, 1, 22050), src = actx.createBufferSource(); src.buffer = b; src.connect(actx.destination); src.start(0);
  } catch (e) { /* no audio */ }
}
function beep() {
  if (!actx) return;
  const t0 = actx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + i * 0.35 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.28);
    o.connect(g); g.connect(actx.destination); o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.3);
  }
}
function alarm() {
  if (S.settings.sound) beep();
  if (S.settings.vibro && navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
}
async function wake(on) {
  if (!('wakeLock' in navigator)) return;
  try {
    if (on && S.settings.wake && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    if (!on && wl) { await wl.release(); wl = null; }
  } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (S.active) wake(true); tick(); } });
document.addEventListener('click', () => { if (S.active) unlockAudio(); }, true);

/* ---------- sheet ---------- */
function openSheet(html) { $('#sheetBox').innerHTML = html; $('#sheet').classList.remove('hidden'); }
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheetBox').innerHTML = ''; }
$('#sheet .sheet-bg').addEventListener('click', closeSheet);
const sheetHead = t => `<div class="sheet-h"><h2>${esc(t)}</h2><button class="sm close" onclick="A.closeSheet()">Готово</button></div>`;
const restOptions = sel => RESTS.map(r => `<option value="${r}" ${r === +sel ? 'selected' : ''}>${r < 60 ? r + ' с' : (r % 60 ? `${Math.floor(r / 60)}:${pad(r % 60)}` : r / 60 + ' мин')}</option>`).join('');
const restLabel = r => r < 60 ? r + ' с' : (r % 60 ? `${Math.floor(r / 60)}:${pad(r % 60)}` : r / 60 + ' мин');

/* ---------- charts (SVG, одна серия) ---------- */
function niceRange(ys) {
  let mn = Math.min(...ys), mx = Math.max(...ys);
  if (mn === mx) { mn = mn > 0 ? mn * 0.8 : 0; mx = mx ? mx * 1.2 : 1; }
  else { const p = (mx - mn) * 0.2; mn = Math.max(0, mn - p); mx += p; }
  return [mn, mx];
}
const short = v => v >= 10000 ? Math.round(v / 1000) + 'k' : fmtNum(v);
function lineChart(id, pts, hl = -1) {
  if (!pts.length) return '<div class="dim small">нет данных</div>';
  chartTips[id] = pts.map(p => p.tip);
  const W = 320, H = 150, pl = 34, pr = 14, pt = 20, pb = 22;
  const [mn, mx] = niceRange(pts.map(p => p.y));
  const X = i => pts.length === 1 ? pl + (W - pl - pr) / 2 : pl + i * (W - pl - pr) / (pts.length - 1);
  const Y = v => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
  let g = '';
  [mn, (mn + mx) / 2, mx].forEach(v => { g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pl - 5}" y="${Y(v) + 3}" text-anchor="end">${short(v)}</text>`; });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = pts.length > 1 ? `<path class="ar" d="${d}L${X(pts.length - 1)},${H - pb}L${X(0)},${H - pb}Z"/>` : '';
  const step = Math.ceil(pts.length / 6);
  let xl = '', dots = '', hits = '';
  const lab = hl >= 0 ? hl : pts.length - 1;
  pts.forEach((p, i) => {
    if (i % step === 0 || i === pts.length - 1) xl += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(p.x)}</text>`;
    dots += `<circle class="pt ${i === hl ? 'hl' : ''}" cx="${X(i)}" cy="${Y(p.y)}" r="${i === hl ? 6 : 4.5}"/>`;
    const w = pts.length === 1 ? 60 : (W - pl - pr) / (pts.length - 1);
    hits += `<rect class="hit" x="${X(i) - w / 2}" y="0" width="${w}" height="${H}" onclick="A.tip('${id}',${i})"/>`;
  });
  const lv = `<text class="val" x="${Math.min(Math.max(X(lab), pl + 14), W - pr - 14)}" y="${Y(pts[lab].y) - 10}" text-anchor="middle">${short(pts[lab].y)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}${area}<path class="ln" d="${d}"/>${dots}${lv}${xl}${hits}</svg><div class="tip dim" id="tip-${id}">Нажми на точку, чтобы увидеть значение</div>`;
}
function barChart(id, pts, hl = -1) {
  if (!pts.length) return '';
  chartTips[id] = pts.map(p => p.tip);
  const W = 320, H = 150, pl = 34, pr = 8, pt = 20, pb = 22;
  const mx = Math.max(...pts.map(p => p.y), 1) * 1.15;
  const Y = v => pt + (H - pt - pb) * (1 - v / mx);
  const slot = (W - pl - pr) / pts.length, bw = Math.min(34, slot - 4);
  let g = '';
  [0, mx / 2, mx].forEach(v => { g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pl - 5}" y="${Y(v) + 3}" text-anchor="end">${short(v)}</text>`; });
  let b = '';
  const step = Math.ceil(pts.length / 7);
  pts.forEach((p, i) => {
    const x = pl + i * slot + (slot - bw) / 2, y = Y(p.y), h = Math.max(1, H - pb - y);
    b += `<rect class="bx ${i === hl ? 'hl' : ''}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="4"/>`;
    if (i === hl) b += `<text class="val" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle">${short(p.y)}</text>`;
    if (i % step === 0 || i === hl) b += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(p.x)}</text>`;
    b += `<rect class="hit" x="${pl + i * slot}" y="0" width="${slot}" height="${H}" onclick="A.tip('${id}',${i})"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}${b}</svg><div class="tip dim" id="tip-${id}">Нажми на столбик, чтобы увидеть значение</div>`;
}

/* ---------- aggregation ---------- */
function agg(exList) {
  const a = { top: 0, ton: 0, reps: 0, sets: 0, e1: 0 };
  for (const e of exList) for (const s of e.sets) {
    const w = num(s.w), r = num(s.r);
    a.top = Math.max(a.top, w); a.ton += w * r; a.reps += r; a.sets++;
    if (w && r) a.e1 = Math.max(a.e1, w * (1 + r / 30));
  }
  return a;
}
function weekAgg(wid) {
  const m = new Map();
  for (const t of weekWorkouts(wid)) for (const e of t.exercises) { if (!m.has(e.name)) m.set(e.name, []); m.get(e.name).push(e); }
  const out = new Map(); m.forEach((v, k) => out.set(k, agg(v))); return out;
}
function weekTotals(wid) {
  const ws = weekWorkouts(wid);
  const known = ws.filter(t => t.duration != null);
  return { n: ws.length, dur: known.length ? known.reduce((a, t) => a + t.duration, 0) : null,
    ton: ws.reduce((a, t) => a + t.exercises.reduce((b, e) => b + tonnage(e.sets), 0), 0),
    sets: ws.reduce((a, t) => a + t.exercises.reduce((b, e) => b + e.sets.length, 0), 0) };
}
const workoutTon = t => t.exercises.reduce((a, e) => a + tonnage(e.sets), 0);
const workoutSets = t => t.exercises.reduce((a, e) => a + e.sets.length, 0);
const workoutReps = t => t.exercises.reduce((a, e) => a + repsSum(e.sets), 0);
const METRICS = { top: ['Макс вес', 'кг'], ton: ['Тоннаж', 'кг'], reps: ['Повторы', ''], e1: ['1ПМ (расчёт)', 'кг'] };
function delta(cur, prev, unit = '', fmt = fmtNum) {
  if (prev == null || cur == null) return '<span class="dim">—</span>';
  const d = cur - prev;
  if (Math.abs(d) < 0.05) return '<span class="dim">= 0</span>';
  return `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(d))}${unit ? ' ' + unit : ''}</span>`;
}

/* ---------- views ---------- */
function vWeek() {
  const w = S.week, n = w.days.length, done = w.days.filter(d => dayWorkout(d.id)).length;
  let h = '';
  if (S.active) h += `<div class="banner" onclick="A.resume()"><div class="grow"><div class="small muted">Идёт тренировка</div><b>${esc(S.active.dayName)}</b></div><b id="bannerT">${fmtDur((Date.now() - S.active.start) / 1000)}</b><span class="chev">${I.chev}</span></div>`;
  h += `<div class="muted mb">Неделя от ${fmtDate(w.start)} · выполнено ${done} из ${n}</div>`;
  w.days.forEach((d, i) => {
    const t = dayWorkout(d.id);
    const sub = t ? `${wDate(t)}${t.duration != null ? ' · ' + fmtDurW(t.duration) : ''} · ${fmtKg(workoutTon(t))} кг` : 'не выполнено';
    h += `<div class="card tap" onclick="A.openDay(${i})"><div class="day"><div class="info"><div class="name">${esc(d.name)}</div>
      <div class="muted small">${d.exercises.length} ${plural(d.exercises.length, 'упражнение', 'упражнения', 'упражнений')} · ${sub}</div>
      ${t ? '<span class="badge good mt" style="display:inline-block">Выполнено</span>' : ''}</div>
      <button class="play" onclick="event.stopPropagation();A.start(${i})">${I.play}</button></div></div>`;
  });
  h += `<button class="ghost big mb" onclick="A.addDay()">+ Добавить день</button>
    <button class="pri big mb" onclick="A.weekStats()">${I.chart} Статистика недели</button>
    <button class="ok big" onclick="A.nextWeek()">Перейти к следующей неделе →</button>
    <div class="dim small mt">При переходе неделя сохранится в истории, а новая скопирует твои фактические веса, повторы и комментарии.</div>`;
  return ['Текущая неделя', h];
}

function vDay() {
  const d = S.week.days[ui.p.i];
  if (!d) { ui.view = null; return vWeek(); }
  const t = dayWorkout(d.id);
  let h = `<div class="row mb"><button onclick="A.back()">${I.back}Назад</button><div class="grow"></div><button class="sm" onclick="A.renameDay(${ui.p.i})">Переименовать</button><button class="sm icon" onclick="A.delDay(${ui.p.i})">${I.trash}</button></div>
    <button class="pri big mb" onclick="A.start(${ui.p.i})">${I.play} Начать тренировку</button>`;
  if (t) h += `<div class="card tap" onclick="A.openWorkout('${t.id}')"><div class="row"><span class="badge good">Выполнено</span><span class="grow muted small">${wDate(t)} · ${fmtDurW(t.duration)} · ${fmtKg(workoutTon(t))} кг</span><span class="chev">${I.chev}</span></div></div>`;
  h += `<div class="section-t">План на эту неделю</div>`;
  if (!d.exercises.length) h += `<div class="empty">Упражнений пока нет — добавь из банка</div>`;
  d.exercises.forEach((e, j) => {
    h += `<div class="card"><div class="ex-head"><h3>${esc(e.name)}</h3>
      <button class="sm icon" onclick="A.editEx(${j})">${I.edit}</button><button class="sm icon" onclick="A.moveEx(${j},-1)">${I.up}</button><button class="sm icon" onclick="A.moveEx(${j},1)">${I.down}</button><button class="sm icon" onclick="A.delEx(${j})">${I.trash}</button></div>
      <div><span class="chip">${e.sets.length} подх.</span><span class="chip">цель ${esc(e.target || '—')}</span><span class="chip">отдых ${restLabel(e.rest || S.settings.rest)}</span></div>
      <div class="mt" style="font-variant-numeric:tabular-nums">${e.sets.map(setStr).join(' · ') || '<span class="dim">нет подходов</span>'} ${e.sets.some(s => num(s.w)) ? 'кг' : ''}</div>
      ${e.sets.some(s => s.note) ? `<div class="small muted mt">${e.sets.map((s, k) => s.note ? `${k + 1}: ${esc(s.note)}` : '').filter(Boolean).join('; ')}</div>` : ''}
      ${e.note ? `<div class="small muted mt"><i>${esc(e.note)}</i></div>` : ''}</div>`;
  });
  h += `<div class="col2"><button onclick="A.pickBank('plan')">+ Из банка</button><button onclick="A.editEx(-1)">+ Новое</button></div>`;
  return [d.name, h];
}

function restBoxHTML() {
  const a = S.active, now = Date.now();
  if (a.rest && now < a.rest.end) {
    const left = (a.rest.end - now) / 1000;
    return `<div class="rest on" data-st="on"><div class="row"><div class="grow"><div class="small muted">Отдых</div><div class="t" id="restT">${fmtDur(Math.ceil(left))}</div></div>
      <button class="sm" onclick="A.restAdd(-15)">−15</button><button class="sm" onclick="A.restAdd(15)">+15</button><button class="sm" onclick="A.restStop()">Пропустить</button></div>
      <div class="bar"><i id="restBar" style="width:${Math.max(0, 100 * left / a.rest.total)}%"></i></div></div>`;
  }
  if (a.restEndedAt && now - a.restEndedAt < 15000) return `<div class="rest end" data-st="end"><b>Отдых окончен — следующий подход!</b></div>`;
  return `<div class="rest" data-st="idle"><div class="row wrap"><span class="small muted grow">Отдых запустится сам после ✓. Вручную:</span>
    ${[60, 90, 120, 180].map(r => `<button class="sm" onclick="A.restStart(${r})">${restLabel(r)}</button>`).join('')}</div></div>`;
}

function vSession() {
  const a = S.active;
  if (!a) { ui.view = null; return vWeek(); }
  let h = `<div class="timerbar"><div class="row"><div class="grow"><div class="small muted">${esc(a.dayName)}</div><div class="sw" id="sw">${fmtDur((Date.now() - a.start) / 1000)}</div></div>
      <button class="sm" onclick="A.prevWorkoutSheet()">${I.clock} Прошлая</button><button class="sm" onclick="A.minimize()">Свернуть</button></div>
    <div id="restbox">${restBoxHTML()}</div></div>`;
  a.exercises.forEach((e, ei) => {
    const prev = lastOcc(e.name)[0];
    h += `<div class="card"><div class="ex-head"><h3>${esc(e.name)}</h3><button class="sm" onclick="A.prevEx(${ei})">${I.clock}</button><button class="sm" onclick="A.exMenu(${ei})">${I.more}</button></div>
      <div class="row wrap"><span class="chip">цель ${esc(e.target || '—')}</span>
      <select class="chip" style="width:auto;padding:5px 8px;margin:4px 0 0" onchange="A.setRest(${ei},this.value)">${restOptions(e.rest)}</select><span class="dim small" style="margin-top:4px">отдых</span></div>
      ${prev ? `<div class="prevline">Прошлый раз (${prev.t.dateUnknown ? 'без даты' : fmtShort(prev.t.date)}): ${prev.e.sets.map(setStr).join(' · ')}</div>` : ''}
      <div class="sethdr"><span>#</span><span>кг</span><span>повт.</span><span></span><span></span></div>`;
    e.sets.forEach((s, si) => {
      const k = ei + '-' + si, showN = openNotes.has(k) || s.note;
      h += `<div class="setrow ${s.done ? 'done' : ''}"><span class="n">${si + 1}</span>
        <input inputmode="decimal" placeholder="СВ" value="${num(s.w) ? s.w : ''}" oninput="A.bind(${ei},${si},'w',this.value)">
        <input inputmode="numeric" placeholder="0" value="${num(s.r) ? s.r : ''}" oninput="A.bind(${ei},${si},'r',this.value)">
        <button class="cm ${s.note ? 'has' : ''}" onclick="A.toggleNote(${ei},${si})">${I.bubble}</button>
        <button class="chk" onclick="A.check(${ei},${si})">${I.check}</button></div>
        ${showN ? `<input class="setnote" placeholder="Комментарий к подходу" value="${esc(s.note)}" oninput="A.bind(${ei},${si},'note',this.value)">` : ''}`;
    });
    h += `<div class="row"><button class="sm" onclick="A.addSet(${ei})">+ Подход</button><button class="sm ghost" onclick="A.delSet(${ei})">− Подход</button></div>
      <input class="mt" placeholder="Комментарий к упражнению" value="${esc(e.note)}" oninput="A.bindEx(${ei},this.value)"></div>`;
  });
  h += `<button class="mb" style="width:100%" onclick="A.pickBank('session')">+ Добавить упражнение из банка</button>
    <label class="lbl">Заметка по тренировке</label><textarea placeholder="Как прошла тренировка…" oninput="A.bindNote(this.value)">${esc(a.note)}</textarea>
    <button class="ok big mt" onclick="A.finish()">Завершить тренировку</button>
    <button class="ghost big mt" onclick="A.cancel()">Отменить тренировку</button>`;
  return ['Тренировка', h];
}

function statBox(k, v, d = '') { return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`; }

function workoutBody(t) {
  const p = prevSameDay(t);
  const ton = workoutTon(t);
  let h = `<div class="col2 mb">
    ${statBox('Время', fmtDurW(t.duration), p && p.duration != null && t.duration != null ? delta(t.duration / 60, p.duration / 60, 'мин') : '')}
    ${statBox('Поднято', fmtKg(ton) + ' кг', p ? delta(ton, workoutTon(p), 'кг', fmtKg) : '')}
    ${statBox('Подходов', workoutSets(t), p ? delta(workoutSets(t), workoutSets(p)) : '')}
    ${statBox('Повторений', workoutReps(t), p ? delta(workoutReps(t), workoutReps(p)) : '')}</div>`;
  if (p) h += `<div class="dim small mb">Сравнение с прошлым «${esc(p.dayName)}» (${wDate(p)})</div>`;
  if (t.note) h += `<div class="card"><div class="muted small">Заметка</div>${esc(t.note)}</div>`;
  t.exercises.forEach(e => {
    h += `<div class="card"><div class="row"><h3 class="grow">${esc(e.name)}</h3><span class="muted small">${fmtKg(tonnage(e.sets))} кг</span></div>
      ${e.note ? `<div class="small muted mt"><i>${esc(e.note)}</i></div>` : ''}
      <table class="t mt"><tr><th>#</th><th>Вес</th><th>Повт.</th><th style="text-align:left;padding-left:10px">Комментарий</th></tr>
      ${e.sets.map((s, i) => `<tr><td>${i + 1}</td><td>${num(s.w) ? fmtNum(num(s.w)) + ' кг' : 'СВ'}</td><td>${num(s.r) || '—'}</td><td style="text-align:left;padding-left:10px" class="muted">${esc(s.note)}</td></tr>`).join('')}</table></div>`;
  });
  return h;
}

function vSummary() {
  const t = workoutById(ui.p.id);
  if (!t) { ui.view = null; return vWeek(); }
  const h = `<div class="hero"><div class="big">${I.done}</div><h2>Тренировка завершена</h2><div class="muted mb">${esc(t.dayName)} · ${wDate(t)}</div></div>
    ${workoutBody(t)}<button class="pri big" onclick="A.back()">Готово</button>`;
  return ['Итоги', h];
}

function vWorkout() {
  const t = workoutById(ui.p.id);
  if (!t) { ui.view = null; return render(); }
  const h = `<div class="row mb"><button onclick="A.back()">${I.back}Назад</button></div>
    <div class="muted mb">${wDate(t)}${t.start ? ' · начало ' + new Date(t.start).toTimeString().slice(0, 5) : ''}</div>
    ${workoutBody(t)}<button class="ghost big" onclick="A.delWorkout('${t.id}')">Удалить тренировку</button>`;
  return [t.dayName, h];
}

function vHistory() {
  const wks = allWeeks().reverse();
  let h = '';
  wks.forEach(w => {
    const ws = weekWorkouts(w.id).reverse();
    if (!ws.length && w.id !== S.week.id) return;
    const tot = weekTotals(w.id);
    h += `<div class="row" style="margin:20px 4px 8px"><div class="grow"><b>Неделя от ${fmtDate(w.start)}</b>${w.id === S.week.id ? ' <span class="badge">текущая</span>' : ''}
      <div class="dim small">${tot.n} ${plural(tot.n, 'тренировка', 'тренировки', 'тренировок')} · ${fmtKg(tot.ton)} кг${tot.dur != null ? ' · ' + fmtDurW(tot.dur) : ''}</div></div>
      ${ws.length ? `<button class="sm" onclick="A.weekStats('${w.id}')">${I.chart}</button>` : ''}</div>`;
    if (!ws.length) h += `<div class="dim small" style="margin:0 4px">пока нет тренировок</div>`;
    ws.forEach(t => {
      h += `<div class="card tap" onclick="A.openWorkout('${t.id}')"><div class="row"><div class="grow"><b>${esc(t.dayName)}</b>
        <div class="muted small">${wDate(t)}${t.duration != null ? ' · ' + fmtDurW(t.duration) : ''} · ${fmtKg(workoutTon(t))} кг · ${workoutSets(t)} подх.</div></div><span class="chev">${I.chev}</span></div></div>`;
    });
  });
  return ['История', h || '<div class="empty">Тренировок пока нет</div>'];
}

function metricSeg() {
  return `<div class="seg">${Object.entries(METRICS).map(([k, v]) => `<button class="${statsUI.metric === k ? 'on' : ''}" onclick="A.metric('${k}')">${v[0].replace(' (расчёт)', '')}</button>`).join('')}</div>`;
}

function vStats() {
  let h = `<div class="seg"><button class="${statsUI.mode === 'week' ? 'on' : ''}" onclick="A.statsMode('week')">Статистика недели</button><button class="${statsUI.mode === 'ex' ? 'on' : ''}" onclick="A.statsMode('ex')">По упражнению</button></div>`;
  const wks = allWeeks().filter(w => weekWorkouts(w.id).length);
  if (!wks.length) return ['Прогресс', h + '<div class="empty">Пока нет выполненных тренировок</div>'];
  const m = statsUI.metric, [mName, mUnit] = METRICS[m];

  if (statsUI.mode === 'week') {
    let idx = wks.findIndex(w => w.id === statsUI.weekId);
    if (idx < 0) idx = wks.length - 1;
    const sel = wks[idx], prev = wks[idx - 1];
    const T = weekTotals(sel.id), P = prev ? weekTotals(prev.id) : null;
    h += `<select class="mb" onchange="A.statsWeek(this.value)">${wks.map(w => `<option value="${w.id}" ${w.id === sel.id ? 'selected' : ''}>Неделя от ${fmtDate(w.start)}${w.id === S.week.id ? ' (текущая)' : ''}</option>`).join('')}</select>
      <div class="card"><h3 class="mb">Итоги недели</h3><div class="col2">
      ${statBox('Тренировок', T.n, P ? delta(T.n, P.n) : '')}
      ${statBox('Время', fmtDurW(T.dur), P && P.dur != null && T.dur != null ? delta(T.dur / 60, P.dur / 60, 'мин') : '')}
      ${statBox('Тоннаж', fmtKg(T.ton) + ' кг', P ? delta(T.ton, P.ton, 'кг', fmtKg) : '')}
      ${statBox('Подходов', T.sets, P ? delta(T.sets, P.sets) : '')}</div>
      ${prev ? `<div class="dim small mt">Сравнение с неделей от ${fmtDate(prev.start)}</div>` : ''}
      <div class="section-t" style="margin-top:16px">Тоннаж по неделям, кг</div>
      ${barChart('wk', wks.map(w => { const v = weekTotals(w.id).ton; return { x: fmtShort(w.start), y: v, tip: `Неделя от ${fmtDate(w.start)}: ${fmtKg(v)} кг` }; }), idx)}</div>
      <div class="section-t">По упражнениям · график: ${mName}</div>${metricSeg()}`;
    const cur = weekAgg(sel.id);
    const aggs = wks.map(w => weekAgg(w.id));
    let ci = 0;
    cur.forEach((a, name) => {
      let pa = null, pw = null;
      for (let i = idx - 1; i >= 0; i--) if (aggs[i].has(name)) { pa = aggs[i].get(name); pw = wks[i]; break; }
      const rows = [['Макс вес', a.top, pa?.top, 'кг'], ['Тоннаж', a.ton, pa?.ton, 'кг'], ['Повторы', a.reps, pa?.reps, ''], ['Подходы', a.sets, pa?.sets, ''], ['1ПМ (расчёт)', a.e1, pa?.e1, 'кг']]
        .filter(r => !(r[3] === 'кг' && !r[1] && !r[2]));
      const pts = [], hl = { i: -1 };
      wks.forEach((w, i) => { if (aggs[i].has(name)) { if (i === idx) hl.i = pts.length; const v = aggs[i].get(name)[m]; pts.push({ x: fmtShort(w.start), y: v, tip: `Неделя от ${fmtDate(w.start)}: ${fmtNum(v)}${mUnit ? ' ' + mUnit : ''}` }); } });
      h += `<div class="card"><h3>${esc(name)}</h3>
        <table class="t mt"><tr><th></th><th>${pw ? 'Прошлая' : '—'}</th><th>Эта</th><th>Разница</th></tr>
        ${rows.map(r => `<tr><td>${r[0]}</td><td class="muted">${r[2] != null ? fmtNum(r[2]) : '—'}</td><td><b>${fmtNum(r[1])}</b></td><td>${delta(r[1], r[2])}</td></tr>`).join('')}</table>
        ${pts.some(p => p.y) ? lineChart('ex' + (ci++), pts, hl.i) : `<div class="dim small mt">По «${mName}» нет данных (упражнение с собственным весом) — выбери «Повторы».</div>`}</div>`;
    });
    return ['Прогресс', h];
  }

  // по упражнению
  const names = [];
  S.bank.forEach(b => names.push(b.name));
  byTsDesc().forEach(t => t.exercises.forEach(e => { if (!names.includes(e.name)) names.push(e.name); }));
  const used = names.filter(n => S.workouts.some(t => t.exercises.some(e => e.name === n)));
  if (!used.includes(statsUI.ex)) statsUI.ex = used[0];
  const ex = statsUI.ex;
  const occ = [...S.workouts].sort((a, b) => a.ts - b.ts).map(t => ({ t, e: t.exercises.filter(x => x.name === ex) })).filter(o => o.e.length);
  const pts = occ.map(o => { const v = agg(o.e)[m]; return { x: o.t.dateUnknown ? '?' + fmtShort(o.t.date) : fmtShort(o.t.date), y: v, tip: `${wDate(o.t)} · ${o.t.dayName}: ${fmtNum(v)}${mUnit ? ' ' + mUnit : ''}` }; });
  h += `<select class="mb" onchange="A.statsEx(this.value)">${used.map(n => `<option ${n === ex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${metricSeg()}
    <div class="card"><h3>${esc(ex)} · ${mName}</h3>${pts.some(p => p.y) ? lineChart('exs', pts) : '<div class="dim small mt">Нет данных по этому показателю</div>'}</div>
    <div class="section-t">Все тренировки с этим упражнением</div>`;
  occ.slice().reverse().forEach(o => {
    h += `<div class="card tap" onclick="A.openWorkout('${o.t.id}')"><div class="row"><b class="grow">${wDate(o.t)}</b><span class="muted small">${esc(o.t.dayName)}</span></div>
      ${o.e.map(e => `<div class="mt" style="font-variant-numeric:tabular-nums">${e.sets.map(setStr).join(' · ')}</div>
        ${e.sets.some(s => s.note) ? `<div class="small muted">${e.sets.map((s, k) => s.note ? `${k + 1}: ${esc(s.note)}` : '').filter(Boolean).join('; ')}</div>` : ''}
        ${e.note ? `<div class="small muted"><i>${esc(e.note)}</i></div>` : ''}`).join('')}</div>`;
  });
  return ['Прогресс', h];
}

function bankListHTML() {
  const q = bankQuery.trim().toLowerCase();
  const items = S.bank.filter(b => !q || b.name.toLowerCase().includes(q));
  if (!items.length) return `<div class="empty">Ничего не найдено</div>`;
  let h = '';
  GROUPS.forEach(g => {
    const list = items.filter(b => (b.group || 'Другое') === g).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (!list.length) return;
    h += `<div class="section-t">${g}</div><div class="card" style="padding:4px 14px">`;
    list.forEach(b => {
      const n = S.workouts.filter(t => t.exercises.some(e => e.name === b.name)).length;
      h += `<div class="li"><div class="grow"><div>${esc(b.name)}</div><div class="dim small">${n ? `выполнено ${n} ${plural(n, 'раз', 'раза', 'раз')}` : 'ещё не выполнялось'}</div></div>
        <button class="sm icon" onclick="A.bankEdit('${b.id}')">${I.edit}</button><button class="sm icon" onclick="A.bankDel('${b.id}')">${I.trash}</button></div>`;
    });
    h += `</div>`;
  });
  return h;
}
function vBank() {
  return ['Банк упражнений', `<div class="row mb"><input placeholder="Поиск" value="${esc(bankQuery)}" oninput="A.bankFilter(this.value)"><button class="pri" onclick="A.bankEdit('')">+ Новое</button></div>
    <div id="bankWrap">${bankListHTML()}</div>`];
}

function vSettings() {
  const st = S.settings;
  const tg = (k, label) => `<label class="li" style="cursor:pointer"><span class="grow">${label}</span><input type="checkbox" class="switch" ${st[k] ? 'checked' : ''} onchange="A.setOpt('${k}',this.checked)"></label>`;
  return ['Настройки', `<div class="card"><h3 class="mb">Таймер отдыха</h3>
      <label class="lbl">Отдых по умолчанию (для новых упражнений)</label><select onchange="A.setOpt('rest',+this.value)">${restOptions(st.rest)}</select>
      ${tg('sound', 'Звук в конце отдыха')}${tg('vibro', 'Вибрация (Android)')}${tg('wake', 'Не гасить экран во время тренировки')}
      <button class="sm mt" onclick="A.testSound()">Проверить звук</button></div>
    <div class="card"><h3>Данные</h3><div class="muted small mb">Все данные хранятся локально в этом браузере на этом устройстве. Делай экспорт время от времени.</div>
      <button class="pri big mb" onclick="A.exportData()">Экспорт данных (JSON)</button>
      <button class="big mb" onclick="document.getElementById('imp').click()">Импорт данных (JSON)</button>
      <input type="file" id="imp" accept=".json,application/json" style="display:none" onchange="A.importData(this)">
      <button class="ghost big mb" onclick="A.restoreSeed()">Восстановить мою программу из бэкапа 09.11</button>
      <button class="danger big" onclick="A.resetAll()">Сбросить все данные</button></div>
    <div class="card"><h3>О приложении</h3><div class="muted small">Gym Tracker 2.0 — локальный PWA-трекер тренировок.<br>На iPhone: Safari → «Поделиться» → «На экран „Домой“».<br>Когда экран заблокирован, таймер продолжает считать, но звук может не прозвучать.</div></div>`];
}

/* ---------- render ---------- */
function render() {
  document.body.classList.toggle('in-session', ui.view === 'session');
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  let r;
  if (ui.view === 'day') r = vDay();
  else if (ui.view === 'session') r = vSession();
  else if (ui.view === 'summary') r = vSummary();
  else if (ui.view === 'workout') r = vWorkout();
  else r = ({ week: vWeek, history: vHistory, stats: vStats, bank: vBank, settings: vSettings })[ui.tab]();
  if (!r) return;
  $('#title').textContent = r[0];
  $('#app').innerHTML = r[1];
}
function go(view, p = {}) { ui.view = view; ui.p = p; render(); window.scrollTo(0, 0); }

let lastRestSt = '';
function tick() {
  const a = S.active;
  if (!a) return;
  const now = Date.now();
  if (a.rest && now >= a.rest.end) { a.rest = null; a.restEndedAt = now; save(); alarm(); }
  if (a.restEndedAt && now - a.restEndedAt >= 15000) { a.restEndedAt = null; save(); }
  const sw = $('#sw'); if (sw) sw.textContent = fmtDur((now - a.start) / 1000);
  const bt = $('#bannerT'); if (bt) bt.textContent = fmtDur((now - a.start) / 1000);
  const box = $('#restbox');
  if (box) {
    const st = a.rest ? 'on' : (a.restEndedAt ? 'end' : 'idle');
    if (st !== lastRestSt || !box.firstElementChild || box.firstElementChild.dataset.st !== st) { box.innerHTML = restBoxHTML(); lastRestSt = st; }
    else if (st === 'on') {
      const left = (a.rest.end - now) / 1000;
      const t = $('#restT'); if (t) t.textContent = fmtDur(Math.ceil(left));
      const b = $('#restBar'); if (b) b.style.width = Math.max(0, 100 * left / a.rest.total) + '%';
    }
  }
}
setInterval(tick, 500);

/* ---------- actions ---------- */
const newPlanEx = (name) => {
  const last = lastOcc(name)[0];
  return { id: uid(), name, target: last?.e.target || '10-12', rest: S.settings.rest, note: '',
    sets: last ? last.e.sets.map(s => ({ w: s.w, r: s.r, note: '' })) : [1, 2, 3].map(() => ({ w: 0, r: 10, note: '' })) };
};
function readSheetSets() {
  return [...document.querySelectorAll('#sheetBox .fs')].map(r => ({ w: num(r.querySelector('.fw').value), r: num(r.querySelector('.fr').value), note: r.querySelector('.fn').value.trim() }));
}
function exFormHTML(e, title) {
  return `${sheetHead(title)}
    <label class="lbl">Название</label><input id="f_name" list="bankNames" value="${esc(e.name)}" placeholder="Например: Жим лёжа">
    <datalist id="bankNames">${S.bank.map(b => `<option value="${esc(b.name)}">`).join('')}</datalist>
    <div class="col2"><div><label class="lbl">Цель (повт.)</label><input id="f_target" value="${esc(e.target)}" placeholder="10-12"></div>
    <div><label class="lbl">Отдых</label><select id="f_rest">${restOptions(e.rest || S.settings.rest)}</select></div></div>
    <label class="lbl">Подходы (кг · повторы · комментарий). Пустой вес = собственный вес</label>
    <div id="f_sets">${e.sets.map((s, i) => `<div class="fs row mb"><span class="dim" style="width:18px">${i + 1}</span><input class="fw" inputmode="decimal" style="width:70px" value="${num(s.w) ? s.w : ''}" placeholder="кг"><input class="fr" inputmode="numeric" style="width:60px" value="${num(s.r) ? s.r : ''}" placeholder="повт"><input class="fn grow" value="${esc(s.note)}" placeholder="коммент."></div>`).join('')}</div>
    <div class="row mb"><button class="sm" onclick="A.formSet(1)">+ Подход</button><button class="sm ghost" onclick="A.formSet(-1)">− Подход</button></div>
    <label class="lbl">Комментарий к упражнению</label><input id="f_note" value="${esc(e.note)}">
    <button class="pri big mt" onclick="A.saveEx()">Сохранить</button>`;
}
let editing = null; // {j, ex}

window.A = {
  closeSheet,
  tab(t) { ui.tab = t; go(null); },
  back() { go(null); },
  tip(id, i) { const el = $('#tip-' + id); if (el) { el.textContent = chartTips[id][i]; el.classList.remove('dim'); } },

  /* week & days */
  openDay(i) { go('day', { i }); },
  addDay() {
    const name = prompt('Название дня', `День ${S.week.days.length + 1}`); if (!name) return;
    const used = new Set(S.week.days.map(d => d.id)); let k = 1; while (used.has('d' + k)) k++;
    S.week.days.push({ id: 'd' + k, name: name.trim(), exercises: [] }); save(); render();
  },
  renameDay(i) { const d = S.week.days[i]; const n = prompt('Новое название дня', d.name); if (!n) return; d.name = n.trim(); save(); render(); },
  delDay(i) { if (!confirm('Удалить день из программы? История тренировок сохранится.')) return; S.week.days.splice(i, 1); save(); go(null); },
  moveEx(j, dir) { const ex = S.week.days[ui.p.i].exercises, k = j + dir; if (k < 0 || k >= ex.length) return; [ex[j], ex[k]] = [ex[k], ex[j]]; save(); render(); },
  delEx(j) { const ex = S.week.days[ui.p.i].exercises; if (!confirm(`Убрать «${ex[j].name}» из этого дня?`)) return; ex.splice(j, 1); save(); render(); },
  editEx(j) {
    const ex = j >= 0 ? clone(S.week.days[ui.p.i].exercises[j]) : { id: uid(), name: '', target: '10-12', rest: S.settings.rest, note: '', sets: [1, 2, 3].map(() => ({ w: 0, r: 10, note: '' })) };
    editing = { j, ex }; openSheet(exFormHTML(ex, j >= 0 ? 'Упражнение' : 'Новое упражнение'));
  },
  formSet(dir) {
    const e = editing.ex; e.sets = readSheetSets(); e.name = $('#f_name').value; e.target = $('#f_target').value; e.rest = +$('#f_rest').value; e.note = $('#f_note').value;
    if (dir > 0) e.sets.push(e.sets.length ? { ...e.sets[e.sets.length - 1], note: '' } : { w: 0, r: 10, note: '' }); else e.sets.pop();
    openSheet(exFormHTML(e, editing.j >= 0 ? 'Упражнение' : 'Новое упражнение'));
  },
  saveEx() {
    const e = editing.ex; e.name = $('#f_name').value.trim(); if (!e.name) { alert('Введи название'); return; }
    e.target = $('#f_target').value.trim(); e.rest = +$('#f_rest').value; e.note = $('#f_note').value.trim(); e.sets = readSheetSets();
    if (!S.bank.some(b => b.name === e.name)) { S.bank.push({ id: uid(), name: e.name, group: 'Другое' }); toast('Упражнение добавлено и в банк'); }
    const list = S.week.days[ui.p.i].exercises;
    if (editing.j >= 0) list[editing.j] = e; else list.push(e);
    save(); closeSheet(); render();
  },

  /* bank picker */
  pickBank(mode) {
    A._pickMode = mode;
    openSheet(`${sheetHead('Банк упражнений')}<input id="pq" placeholder="Поиск или новое название" oninput="A.pickFilter()"><div id="pickList" class="mt"></div>`);
    A.pickFilter();
  },
  pickFilter() {
    const q = ($('#pq')?.value || '').trim(), ql = q.toLowerCase();
    const items = S.bank.filter(b => !ql || b.name.toLowerCase().includes(ql)).sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name, 'ru'));
    let h = '';
    if (q && !S.bank.some(b => b.name.toLowerCase() === ql)) h += `<button class="pri" style="width:100%;margin-bottom:8px" onclick="A.pickNew()">+ Создать «${esc(q)}»</button>`;
    h += items.map(b => `<div class="li" style="cursor:pointer" onclick="A.pickItem('${b.id}')"><div class="grow">${esc(b.name)}</div><span class="badge">${esc(b.group)}</span></div>`).join('') || '<div class="empty">Нет упражнений</div>';
    $('#pickList').innerHTML = h;
  },
  pickNew() {
    const name = $('#pq').value.trim(); if (!name) return;
    const b = { id: uid(), name, group: 'Другое' }; S.bank.push(b); A.pickItem(b.id);
  },
  pickItem(id) {
    const b = S.bank.find(x => x.id === id); if (!b) return;
    const e = newPlanEx(b.name);
    if (A._pickMode === 'session') S.active.exercises.push({ ...e, sets: e.sets.map(s => ({ ...s, done: false })) });
    else S.week.days[ui.p.i].exercises.push(e);
    save(); closeSheet(); render(); toast(`Добавлено: ${b.name}`);
  },

  /* session */
  start(i) {
    const d = S.week.days[i]; if (!d) return;
    if (S.active) {
      if (S.active.dayId === d.id && S.active.weekId === S.week.id) return A.resume();
      if (!confirm(`Уже идёт тренировка «${S.active.dayName}». Открыть её?`)) return;
      return A.resume();
    }
    if (dayWorkout(d.id) && !confirm('Этот день уже выполнен на этой неделе. Начать ещё раз? (для следующей недели возьмётся последняя тренировка)')) return;
    unlockAudio();
    S.active = { id: uid(), weekId: S.week.id, dayId: d.id, dayName: d.name, start: Date.now(), note: '', rest: null, restEndedAt: null,
      exercises: d.exercises.map(e => ({ id: uid(), name: e.name, target: e.target, rest: e.rest || S.settings.rest, note: e.note || '', sets: e.sets.map(s => ({ w: s.w, r: s.r, note: s.note || '', done: false })) })) };
    openNotes.clear(); save(); wake(true); go('session');
  },
  resume() { wake(true); go('session'); },
  minimize() { ui.tab = 'week'; go(null); },
  bind(ei, si, f, v) { const s = S.active.exercises[ei].sets[si]; s[f] = f === 'note' ? v : num(v); save(); },
  bindEx(ei, v) { S.active.exercises[ei].note = v; save(); },
  bindNote(v) { S.active.note = v; save(); },
  toggleNote(ei, si) { const k = ei + '-' + si; openNotes.has(k) ? openNotes.delete(k) : openNotes.add(k); render(); },
  check(ei, si) {
    const e = S.active.exercises[ei], s = e.sets[si];
    s.done = !s.done;
    if (s.done) { A.restStart(e.rest || S.settings.rest, true); }
    save(); render();
  },
  restStart(sec, silent) { const a = S.active; a.rest = { end: Date.now() + sec * 1000, total: sec }; a.restEndedAt = null; save(); if (!silent) tick(); },
  restAdd(d) { const a = S.active; if (!a.rest) return; a.rest.end += d * 1000; a.rest.total = Math.max(a.rest.total + d, 1); save(); tick(); },
  restStop() { S.active.rest = null; S.active.restEndedAt = null; save(); tick(); },
  setRest(ei, v) { S.active.exercises[ei].rest = +v; save(); },
  addSet(ei) { const st = S.active.exercises[ei].sets, l = st[st.length - 1]; st.push(l ? { w: l.w, r: l.r, note: '', done: false } : { w: 0, r: 10, note: '', done: false }); save(); render(); },
  delSet(ei) { const st = S.active.exercises[ei].sets; if (!st.length) return; st.pop(); save(); render(); },
  exMenu(ei) {
    const e = S.active.exercises[ei];
    openSheet(`${sheetHead(e.name)}<button class="big mb" onclick="A.sMove(${ei},-1)">Переместить выше</button><button class="big mb" onclick="A.sMove(${ei},1)">Переместить ниже</button><button class="danger big" onclick="A.sDel(${ei})">Удалить из тренировки</button>`);
  },
  sMove(ei, d) { const ex = S.active.exercises, k = ei + d; if (k >= 0 && k < ex.length) [ex[ei], ex[k]] = [ex[k], ex[ei]]; openNotes.clear(); save(); closeSheet(); render(); },
  sDel(ei) { if (!confirm('Удалить упражнение из этой тренировки?')) return; S.active.exercises.splice(ei, 1); openNotes.clear(); save(); closeSheet(); render(); },
  prevEx(ei) {
    const e = S.active.exercises[ei], occ = lastOcc(e.name, Infinity, 3);
    let h = sheetHead(e.name);
    if (!occ.length) h += '<div class="empty">Это упражнение ещё не выполнялось</div>';
    occ.forEach((o, k) => {
      h += `<div class="card"><div class="row"><b class="grow">${wDate(o.t)}</b><span class="muted small">${esc(o.t.dayName)}</span></div>
        <table class="t mt">${o.e.sets.map((s, i) => `<tr><td>${i + 1}</td><td>${num(s.w) ? fmtNum(num(s.w)) + ' кг' : 'СВ'}</td><td>× ${num(s.r) || '—'}</td><td style="text-align:left;padding-left:10px" class="muted">${esc(s.note)}</td></tr>`).join('')}</table>
        ${o.e.note ? `<div class="small muted mt"><i>${esc(o.e.note)}</i></div>` : ''}
        <div class="dim small mt">Тоннаж ${fmtKg(tonnage(o.e.sets))} кг</div>
        ${k === 0 ? `<button class="sm mt" onclick="A.applyPrev(${ei})">Подставить эти веса и повторы</button>` : ''}</div>`;
    });
    openSheet(h);
  },
  applyPrev(ei) {
    const e = S.active.exercises[ei], o = lastOcc(e.name)[0]; if (!o) return;
    e.sets = o.e.sets.map(s => ({ w: s.w, r: s.r, note: '', done: false })); save(); closeSheet(); render();
  },
  prevWorkoutSheet() {
    const a = S.active;
    const t = byTsDesc().find(x => x.dayId === a.dayId || x.dayName === a.dayName) || byTsDesc()[0];
    openSheet(sheetHead(t ? `${t.dayName}` : 'Прошлая тренировка') + (t ? `<div class="muted mb">${wDate(t)}</div>${workoutBody(t)}` : '<div class="empty">Прошлых тренировок нет</div>'));
  },
  finish() {
    const a = S.active;
    const unchecked = a.exercises.reduce((n, e) => n + e.sets.filter(s => !s.done && num(s.r)).length, 0);
    let includeAll = false;
    if (unchecked) includeAll = confirm(`Неотмеченных подходов: ${unchecked}.\nОК — засчитать их тоже, Отмена — сохранить только отмеченные ✓.`);
    const exercises = a.exercises.map(e => ({ name: e.name, target: e.target, note: (e.note || '').trim(),
      sets: e.sets.filter(s => s.done || (includeAll && num(s.r))).map(s => ({ w: num(s.w), r: num(s.r), note: (s.note || '').trim() })) })).filter(e => e.sets.length);
    if (!exercises.length && !confirm('Нет ни одного выполненного подхода. Всё равно завершить?')) return;
    const end = Date.now();
    const t = { id: uid(), weekId: a.weekId, dayId: a.dayId, dayName: a.dayName, date: todayISO(), dateUnknown: false,
      start: a.start, end, duration: Math.round((end - a.start) / 1000), note: (a.note || '').trim(), ts: end, exercises };
    S.workouts.push(t); S.active = null; save(); wake(false); ui.tab = 'week'; go('summary', { id: t.id });
  },
  cancel() { if (!confirm('Отменить тренировку? Записанные подходы не сохранятся.')) return; S.active = null; save(); wake(false); ui.tab = 'week'; go(null); },

  /* week transition & stats */
  nextWeek() {
    if (S.active) { alert('Сначала заверши текущую тренировку.'); return; }
    const w = S.week, n = w.days.length, done = w.days.filter(d => dayWorkout(d.id)).length;
    const msg = done < n ? `Выполнено ${done} из ${n}. Невыполненные дни перейдут в новую неделю по плану.\n\nСохранить неделю и перейти к следующей?`
      : 'Сохранить неделю и перейти к следующей?\nВеса, повторы и комментарии скопируются в новую неделю.';
    if (!confirm(msg)) return;
    const days = w.days.map(d => {
      const t = dayWorkout(d.id);
      if (!t) return { id: d.id, name: d.name, exercises: d.exercises.map(e => ({ ...clone(e), id: uid() })) };
      return { id: d.id, name: d.name, exercises: t.exercises.map(te => {
        const pe = d.exercises.find(e => e.name === te.name);
        return { id: uid(), name: te.name, target: pe?.target ?? te.target, rest: pe?.rest ?? S.settings.rest, note: te.note || '', sets: te.sets.map(s => ({ w: s.w, r: s.r, note: s.note || '' })) };
      }) };
    });
    w.end = todayISO(); S.weeks.push(w);
    S.week = { id: uid(), start: todayISO(), end: null, days };
    save();
    if (confirm('Неделя сохранена ✅ Новая неделя создана.\n\nПосмотреть статистику прошедшей недели?')) A.weekStats(w.id); else go(null);
  },
  weekStats(wid) { statsUI.mode = 'week'; statsUI.weekId = wid || S.week.id; ui.tab = 'stats'; go(null); },
  statsMode(m) { statsUI.mode = m; render(); },
  statsWeek(id) { statsUI.weekId = id; render(); },
  statsEx(n) { statsUI.ex = n; render(); },
  metric(m) { statsUI.metric = m; render(); },
  openWorkout(id) { go('workout', { id }); },
  delWorkout(id) { if (!confirm('Удалить эту тренировку из истории?')) return; S.workouts = S.workouts.filter(t => t.id !== id); save(); go(null); },

  /* bank */
  bankFilter(v) { bankQuery = v; $('#bankWrap').innerHTML = bankListHTML(); },
  bankEdit(id) {
    const b = S.bank.find(x => x.id === id) || { id: '', name: '', group: 'Другое' };
    openSheet(`${sheetHead(id ? 'Изменить упражнение' : 'Новое упражнение')}
      <label class="lbl">Название</label><input id="b_name" value="${esc(b.name)}" placeholder="Например: Жим лёжа">
      <label class="lbl">Группа мышц</label><select id="b_group">${GROUPS.map(g => `<option ${g === b.group ? 'selected' : ''}>${g}</option>`).join('')}</select>
      ${id ? '<div class="dim small mt">Если поменяешь название — оно обновится и в программе, и в истории (чтобы не потерялся прогресс).</div>' : ''}
      <button class="pri big mt" onclick="A.bankSave('${b.id}')">Сохранить</button>`);
  },
  bankSave(id) {
    const name = $('#b_name').value.trim(), group = $('#b_group').value; if (!name) { alert('Введи название'); return; }
    if (S.bank.some(b => b.name.toLowerCase() === name.toLowerCase() && b.id !== id)) { alert('Такое упражнение уже есть в банке'); return; }
    if (id) {
      const b = S.bank.find(x => x.id === id), old = b.name; b.name = name; b.group = group;
      if (old !== name) {
        const ren = e => { if (e.name === old) e.name = name; };
        allWeeks().forEach(w => w.days.forEach(d => d.exercises.forEach(ren)));
        S.workouts.forEach(t => t.exercises.forEach(ren));
        if (S.active) S.active.exercises.forEach(ren);
      }
    } else S.bank.push({ id: uid(), name, group });
    save(); closeSheet(); render();
  },
  bankDel(id) { const b = S.bank.find(x => x.id === id); if (!confirm(`Удалить «${b.name}» из банка? Программа и история не изменятся.`)) return; S.bank = S.bank.filter(x => x.id !== id); save(); render(); },

  /* settings */
  setOpt(k, v) { S.settings[k] = v; save(); if (k === 'wake' && S.active) wake(v); },
  testSound() { unlockAudio(); setTimeout(alarm, 100); },
  exportData() {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gym-tracker-v2-backup-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
  importData(inp) {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result);
        if (o.v === 2 && o.week) {
          if (!confirm('Заменить текущие данные данными из файла?')) return;
          S = migrate(o); save(); toast('Данные импортированы'); go(null);
        } else if (o.currentWeek) alert('Это бэкап старой версии трекера. Программа из бэкапа 09.11 уже перенесена — нажми «Восстановить мою программу», если нужно.');
        else alert('Файл не похож на бэкап Gym Tracker.');
      } catch (e) { alert('Не удалось прочитать файл: ' + e.message); }
      inp.value = '';
    };
    r.readAsText(f);
  },
  restoreSeed() { if (!window.SEED || !confirm('Заменить все текущие данные программой и историей из бэкапа 09.11.2026?')) return; S = migrate(clone(window.SEED)); save(); toast('Программа восстановлена'); ui.tab = 'week'; go(null); },
  resetAll() { if (!confirm('Удалить ВСЕ данные? Это нельзя отменить. Сначала сделай экспорт.')) return; S = emptyState(); save(); ui.tab = 'week'; go(null); },
};

document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => A.tab(b.dataset.tab)));
if (S.active) { ui.view = 'session'; wake(true); }
save();
render();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
