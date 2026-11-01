/* ==========================================================================
   views/history.js — History tab: 12-week contribution calendar, continuous
   muscle heatmap, workout list and detail. Exports the line chart and
   sparkline used by the exercise detail page.
   ========================================================================== */

import { db } from '../db.js';
import { MUSCLE_NAME } from '../data.js';
import { el, clear, svgEl, pushPanel, popPanel, toast, fmtDate, fmtTime, fmtDuration, fmtWeight, est1RM, dayStart, emptyState } from '../ui.js';
import { confirmSheet } from '../sheet.js';
import { getExercise, bestSet } from '../exercises.js';
import { createMuscleMap, heatContinuous } from '../muscles.js';
import { openExerciseDetail } from './library.js';
import { openExerciseSheet } from './exercise-sheet.js';

/* ---------- Weekly muscle load ---------- */

/** Set-equivalents per muscle over the last 7 days (primary 1, secondary 0.5). */
export function weeklyMuscleLoad() {
  const since = Date.now() - 7 * 86400000;
  const load = {};
  for (const w of db.workouts) {
    if ((w.finishedAt || w.startedAt) < since) continue;
    for (const e of w.exercises) {
      const def = getExercise(e.exerciseId);
      if (!def) continue;
      const n = e.sets.filter((s) => !s.warmup).length;
      def.primary.forEach((m) => (load[m] = (load[m] || 0) + n));
      def.secondary.forEach((m) => (load[m] = (load[m] || 0) + n * 0.5));
    }
  }
  return load;
}

function heatmapCard() {
  const load = weeklyMuscleLoad();
  const map = heatContinuous(createMuscleMap(), load);
  const top = Object.entries(load).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return el('div.card', {},
    el('div.card-title', {}, 'Muscles · last 7 days'),
    map,
    el('div.legend', {}, el('span.l-grad', {}, 'fewer → more sets')),
    top.length
      ? el('div.chips', { style: { marginTop: '12px', justifyContent: 'center' } },
          top.map(([m, s]) => el('span.chip', {}, `${MUSCLE_NAME[m] || m} ${Math.round(s)}`)))
      : el('p.muted.small.center', { style: { marginTop: '10px' } }, 'No sets logged in the last 7 days.'),
  );
}

/* ---------- Contribution calendar (12 weeks) ---------- */

function calendarCard() {
  const today = dayStart();
  const DAY = 86400000;
  // Columns are weeks starting Monday; the last column holds today.
  const dow = (new Date(today).getDay() + 6) % 7; // 0 = Monday
  const start = today - dow * DAY - 11 * 7 * DAY;
  const byDay = new Map();
  for (const w of db.workouts) {
    const k = dayStart(w.finishedAt);
    if (k < start) continue;
    const sets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.warmup).length, 0);
    const cur = byDay.get(k) || { sets: 0, ids: [] };
    cur.sets += sets; cur.ids.push(w.id);
    byDay.set(k, cur);
  }
  const level = (s) => (s >= 30 ? 4 : s >= 20 ? 3 : s >= 10 ? 2 : s >= 1 ? 1 : 0);

  const months = el('div.cal-months');
  const grid = el('div.cal');
  let lastMonth = -1;
  for (let c = 0; c < 12; c++) {
    const col = el('div.cal-col');
    const first = new Date(start + c * 7 * DAY);
    const m = first.getMonth();
    months.append(el('span', {}, m !== lastMonth ? first.toLocaleDateString(undefined, { month: 'short' }) : ''));
    lastMonth = m;
    for (let r = 0; r < 7; r++) {
      const ts = start + (c * 7 + r) * DAY;
      const d = byDay.get(ts);
      const future = ts > today;
      col.append(el('button.cal-day', {
        class: [ts === today && 'today', future && 'future'].filter(Boolean).join(' '),
        dataset: { l: String(d ? level(d.sets) : 0) },
        title: `${fmtDate(ts)}${d ? ` · ${d.sets} sets` : ''}`,
        'aria-label': `${fmtDate(ts)}${d ? `, ${d.sets} sets` : ', rest day'}`,
        onclick: () => { if (d) openWorkoutDetail(d.ids[0]); },
      }));
    }
    grid.append(col);
  }
  const days = byDay.size;
  return el('div.card', {},
    el('div.card-title', {}, `Last 12 weeks · ${days} workout day${days === 1 ? '' : 's'}`),
    months, grid,
    el('div.cal-legend', {}, 'Less', el('i'), el('i', { dataset: { l: '1' }, class: 'cal-day', style: { width: '10px', height: '10px' } }), el('i', { class: 'cal-day', dataset: { l: '2' }, style: { width: '10px', height: '10px' } }), el('i', { class: 'cal-day', dataset: { l: '3' }, style: { width: '10px', height: '10px' } }), el('i', { class: 'cal-day', dataset: { l: '4' }, style: { width: '10px', height: '10px' } }), 'More'),
  );
}

/* ---------- Tab view ---------- */

export function render(view) {
  clear(view);
  view.append(calendarCard(), heatmapCard());

  if (!db.workouts.length) {
    view.append(el('div.card', {}, emptyState({
      icon: 'calendar', title: 'No workouts yet',
      text: 'Finish a session from the Today tab and it will show up here with PRs and progress.',
      action: { label: 'Go to Today', onclick: () => document.dispatchEvent(new CustomEvent('app:tab', { detail: 'today' })) },
    })));
    return;
  }

  let currentMonth = '';
  let list = null;
  for (const w of db.workouts) {
    const month = new Date(w.finishedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (month !== currentMonth) {
      currentMonth = month;
      view.append(el('div.month-label', {}, month));
      list = el('div.list');
      view.append(list);
    }
    const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
    const prs = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.pr).length, 0);
    list.append(el('button.list-item', { onclick: () => openWorkoutDetail(w.id) },
      el('div.grow', {},
        el('div.title', {}, w.dayName, el('span.muted.small', { style: { fontWeight: 400, marginLeft: '6px' } }, w.splitName || ''), prs > 0 && el('span.badge.pr', { style: { marginLeft: '8px' } }, `${prs} PR`)),
        el('div.sub', {}, `${fmtDate(w.finishedAt)} · ${fmtDuration(w.durationSec)} · ${w.exercises.length} exercises · ${sets} sets`),
      ),
      el('span.chev', {}, '›'),
    ));
  }
}

/* ---------- Workout detail ---------- */

export function openWorkoutDetail(id) {
  pushPanel({
    title: 'Workout',
    render(body, p) {
      const w = db.workouts.find((x) => x.id === id);
      if (!w) { body.append(el('div.empty', {}, 'Workout not found.')); return; }
      p.setTitle(w.dayName);
      const volume = w.exercises.reduce((v, e) => v + e.sets.reduce((s, x) => s + (x.weightKg || 0) * x.reps, 0), 0);
      body.append(
        el('div.card', {},
          el('div', { style: { fontWeight: 700 } }, fmtDate(w.finishedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
          el('p.muted.small', {}, `${w.splitName || ''} · ${fmtTime(w.startedAt)} – ${fmtTime(w.finishedAt)}`),
          el('div.stats', { style: { marginTop: '12px' } },
            el('div.stat', {}, el('div.v', {}, fmtDuration(w.durationSec)), el('div.k', {}, 'Duration')),
            el('div.stat', {}, el('div.v', {}, String(w.exercises.reduce((n, e) => n + e.sets.length, 0))), el('div.k', {}, 'Sets')),
            el('div.stat', {}, el('div.v', {}, volume ? fmtWeight(volume) : '—'), el('div.k', {}, 'Volume')),
          ),
        ),
      );
      for (const e of w.exercises) {
        const best = bestSet(e.sets);
        const table = el('table.sets-table', {},
          e.sets.map((s, i) => el('tr', {},
            el('td', {}, s.warmup ? 'W' : String(i + 1)),
            el('td', {}, `${s.reps} reps`),
            el('td', {}, s.weightKg != null ? fmtWeight(s.weightKg) : 'Bodyweight'),
            el('td', { style: { textAlign: 'right' } },
              s.pr && el('span.badge.pr', { style: { marginRight: '6px' } }, 'PR'),
              s.weightKg != null && !s.warmup && el('span.muted.small', {}, `1RM ${fmtWeight(est1RM(s.weightKg, s.reps))}`)),
          )),
        );
        body.append(el('div.card', {},
          el('div.row.between', {},
            el('button', { style: { fontWeight: 700, fontSize: '17px', textAlign: 'left', minHeight: '32px' }, onclick: () => openExerciseSheet(e.exerciseId, { onDetails: openExerciseDetail }) }, e.name, ' ›'),
            best && el('span.badge.soft', {}, `best ${best.reps}×${best.weightKg != null ? fmtWeight(best.weightKg, false) : 'BW'}`),
          ),
          table,
        ));
      }
      body.append(el('button.btn.danger.block', { onclick: async () => {
        if (!(await confirmSheet('This removes the workout and its sets from history.', { title: 'Delete workout?', confirmLabel: 'Delete', danger: true }))) return;
        db.workouts = db.workouts.filter((x) => x.id !== id); db.save('workouts');
        toast('Workout deleted'); popPanel();
      } }, 'Delete workout'));
    },
  });
}

/* ---------- Charts ---------- */

/** series: [{ date, kg }] oldest first. Returns an <svg>. */
export function lineChart(series) {
  const W = 320, H = 150, L = 36, R = 10, T = 12, B = 26;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
  const ys = series.map((p) => p.kg);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 5; max += 5; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;
  const x = (i) => L + (i / Math.max(1, series.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  for (let g = 0; g < 3; g++) {
    const v = min + ((max - min) * g) / 2;
    svg.append(svgEl('line', { class: 'axis', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    svg.append(svgEl('text', { x: L - 4, y: y(v) + 3, 'text-anchor': 'end' }, fmtWeight(v, false)));
  }
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  svg.append(svgEl('path', { class: 'line', d: line }));
  series.forEach((p, i) => svg.append(svgEl('circle', { class: i === series.length - 1 ? 'dot last' : 'dot', cx: x(i), cy: y(p.kg), r: 3.5 })));
  svg.append(svgEl('text', { x: L, y: H - 8 }, fmtDate(series[0].date, { day: 'numeric', month: 'short' })));
  svg.append(svgEl('text', { x: W - R, y: H - 8, 'text-anchor': 'end' }, fmtDate(series[series.length - 1].date, { day: 'numeric', month: 'short' })));
  return svg;
}

/** Tiny sparkline, no axes. series: [{ kg }] oldest first. */
export function sparkline(series) {
  const W = 120, H = 36, P = 4;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sparkline', preserveAspectRatio: 'none' });
  if (series.length < 2) return svg;
  const ys = series.map((p) => p.kg);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => P + (i / (series.length - 1)) * (W - 2 * P);
  const y = (v) => P + (1 - (v - min) / (max - min)) * (H - 2 * P);
  svg.append(svgEl('path', { d: series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' '), 'vector-effect': 'non-scaling-stroke' }));
  const lastP = series[series.length - 1];
  svg.append(svgEl('circle', { cx: x(series.length - 1), cy: y(lastP.kg), r: 2.5 }));
  return svg;
}
