/* ==========================================================================
   views/today.js — Today tab: big Start button, stats strip, day picker,
   active-gym pill, crossfading muscle map with tap-to-filter, and the day's
   exercise list resolved against the active gym (swaps / unavailable).
   ========================================================================== */

import { db } from '../db.js';
import { MUSCLE_NAME } from '../data.js';
import { el, append, clear, fmtDate, fmtTime, relativeDay, dayStart, emptyState, reducedMotion } from '../ui.js';
import { confirmSheet, openSheet } from '../sheet.js';
import { getExercise, muscleNames } from '../exercises.js';
import { createMuscleMap, highlight, combineMuscles, onMuscleTap, select } from '../muscles.js';
import { activeGym, resolveDay, equipmentNames, usedEquipment } from '../engine.js';
import { equipmentIconEl } from '../icons.js';
import { activeSplit } from './splits.js';
import { startWorkout, openWorkout, discardWorkout } from './workout.js';
import { gymPill } from './gyms.js';

let selectedDayId = null;
let lastSeenWorkoutId = null;
let filterMuscle = null;

export function suggestedDayIndex(split) {
  if (!split || !split.days.length) return 0;
  const last = db.workouts.find((w) => w.splitId === split.id);
  if (!last) return 0;
  const idx = split.days.findIndex((d) => d.id === last.dayId);
  if (idx < 0) return 0;
  return (idx + 1) % split.days.length;
}

export function weekStreak() {
  const weeks = new Set(db.workouts.map((w) => Math.floor((dayStart() - dayStart(w.finishedAt)) / (7 * 86400000))));
  let k = weeks.has(0) ? 0 : weeks.has(1) ? 1 : -1;
  if (k < 0) return 0;
  let n = 0;
  while (weeks.has(k)) { n++; k++; }
  return n;
}

export function setsThisWeek() {
  const since = Date.now() - 7 * 86400000;
  return db.workouts.filter((w) => w.finishedAt >= since)
    .reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.filter((s) => !s.warmup).length, 0), 0);
}

function swapInfoSheet(entry, gym) {
  const ex = getExercise(entry.exerciseId);
  const orig = entry.originalId ? getExercise(entry.originalId) : null;
  openSheet({
    title: entry.status === 'swapped' ? 'Swapped' : 'Unavailable here',
    text: entry.reason,
    render(body) {
      if (orig) body.append(el('p.small', {}, `${orig.name} → ${ex.name}`));
      if (entry.missing.length) body.append(el('div.row', {}, el('span.eq-icons', {}, entry.missing.map((id) => equipmentIconEl(id, 20))), el('span.muted.small', {}, `${gym.name} is missing: ${equipmentNames(entry.missing)}`)));
    },
    actions: [{ label: 'OK' }],
  });
}

export function render(view) {
  clear(view);

  if (db.active) {
    const a = db.active;
    const done = a.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    view.append(el('div.card.in-progress', {},
      el('div.card-title', {}, 'Workout in progress'),
      el('div', { style: { fontSize: '24px', fontWeight: '800' } }, a.dayName),
      el('p.muted', {}, `Started ${fmtTime(a.startedAt)} · ${done} set${done === 1 ? '' : 's'} done`),
      el('div.btn-row', { style: { marginTop: '12px' } },
        el('button.btn.primary.big', { onclick: () => openWorkout() }, 'Resume'),
        el('button.btn.danger', { onclick: async () => {
          if (await confirmSheet('Nothing from this session will be saved.', { title: 'Discard workout?', confirmLabel: 'Discard', danger: true })) { discardWorkout(); render(view); }
        } }, 'Discard'),
      ),
    ));
  }

  const split = activeSplit();
  if (!split) {
    view.append(el('div.card', {}, emptyState({ icon: 'list', title: 'No active split', text: 'Add a preset or build your own split, then set it as active.',
      action: { label: 'Open Splits', onclick: () => document.dispatchEvent(new CustomEvent('app:tab', { detail: 'splits' })) } })));
    return;
  }
  if (!split.days.length) {
    view.append(el('div.card', {}, emptyState({ icon: 'list', title: `${split.name} has no days`, text: 'Add a day with some exercises to start logging.',
      action: { label: 'Edit split', onclick: () => document.dispatchEvent(new CustomEvent('app:tab', { detail: 'splits' })) } })));
    return;
  }

  const latestId = db.workouts[0] ? db.workouts[0].id : null;
  if (latestId !== lastSeenWorkoutId) { lastSeenWorkoutId = latestId; selectedDayId = null; }

  const suggestedIdx = suggestedDayIndex(split);
  let day = split.days.find((d) => d.id === selectedDayId) || split.days[suggestedIdx];
  selectedDayId = day.id;
  const gym = activeGym();

  const startBtn = el('button.btn.primary.big.block.start-btn', { class: db.active ? 'hidden' : '', onclick: () => startWorkout(split, day) });
  const dayName = el('div.day-name');
  const lastLine = el('p.muted.small', { style: { marginTop: '10px' } });
  const chips = el('div.chips');
  const stage = el('div.map-stage');
  const hint = el('p.muted.small.center', { style: { marginTop: '8px' } });
  const listTitle = el('div.card-title');
  const list = el('div.ex-preview');
  let map = null;
  let resolved = [];

  const lastWorkout = db.workouts[0];
  view.append(
    startBtn,
    el('div.stats-strip', {},
      el('div.stat', {}, el('div.v', {}, lastWorkout ? relativeDay(lastWorkout.finishedAt) : '—'), el('div.k', {}, 'Last session')),
      el('div.stat', {}, el('div.v', {}, `${weekStreak()} wk`), el('div.k', {}, 'Streak')),
      el('div.stat', {}, el('div.v', {}, String(setsThisWeek())), el('div.k', {}, 'Sets this week')),
    ),
    el('div.card.today-hero', {}, el('div.split-name', {}, split.name), dayName, el('div', { style: { margin: '-4px 0 12px' } }, gymPill()), chips, lastLine),
    el('div.card', {}, stage, hint),
    el('div.card', {}, listTitle, list),
  );

  function swapMap(exs) {
    const next = highlight(createMuscleMap(), combineMuscles(exs));
    select(next, filterMuscle);
    onMuscleTap(next, (id) => { filterMuscle = filterMuscle === id ? null : id; select(map, filterMuscle); renderList(); });
    const old = map;
    map = next;
    if (old && !reducedMotion()) {
      next.classList.add('entering'); old.classList.add('leaving');
      stage.append(next);
      requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove('entering')));
      setTimeout(() => old.remove(), 340);
    } else { if (old) old.remove(); stage.append(next); }
  }

  function renderList() {
    clear(list);
    const hits = (ex) => !filterMuscle || ex.primary.includes(filterMuscle) || ex.secondary.includes(filterMuscle);
    const items = resolved.map((r) => ({ r, ex: getExercise(r.exerciseId) })).filter((x) => x.ex);
    const shown = items.filter((x) => hits(x.ex));
    const swaps = resolved.filter((r) => r.status === 'swapped').length;
    const unavailable = resolved.filter((r) => r.status === 'unavailable').length;
    listTitle.textContent = filterMuscle
      ? `${shown.length} of ${items.length} hit ${MUSCLE_NAME[filterMuscle]}`
      : `${items.length} exercise${items.length === 1 ? '' : 's'}${swaps ? ` · ${swaps} swapped for ${gym.name}` : ''}${unavailable ? ` · ${unavailable} unavailable` : ''}`;
    hint.textContent = filterMuscle ? 'Tap the muscle again to clear the filter' : 'Tap a muscle to filter exercises';
    if (!items.length) { list.append(emptyState({ icon: 'list', title: 'No exercises yet', text: 'You can still start and add exercises as you go, or edit the day in Splits.' })); return; }
    for (const { r, ex } of items) {
      const row = el('div.ex-line', { class: [!hits(ex) && 'dim', r.status === 'unavailable' && 'unavail'].filter(Boolean).join(' ') },
        el('div.grow', {},
          el('div', { style: { fontWeight: 600 } }, ex.name, ' ',
            r.status === 'swapped' && el('button.chip.swapped', { onclick: () => swapInfoSheet(r, gym) }, 'Swapped'),
            r.status === 'unavailable' && el('button.chip.swapped.unavail', { onclick: () => swapInfoSheet(r, gym) }, 'Unavailable here')),
          r.status === 'unavailable' && el('div.why', {}, r.reason),
        ),
        el('span', {}, muscleNames(ex.primary)),
      );
      list.append(row);
    }
  }

  function update() {
    const isSuggested = day.id === split.days[suggestedIdx].id;
    resolved = resolveDay(day, gym);
    clear(startBtn);
    append(startBtn, [`Start ${day.name}`, isSuggested && el('span.sub', {}, '· up next')]);
    clear(dayName);
    append(dayName, [day.name, isSuggested && el('span.badge.fill', {}, 'Up next')]);
    clear(chips);
    append(chips, split.days.map((d) => el('button.chip', { class: d.id === day.id ? 'active' : '', onclick: () => { day = d; selectedDayId = d.id; update(); } }, d.name)));
    const lastOfDay = db.workouts.find((w) => w.splitId === split.id && w.dayId === day.id);
    lastLine.textContent = lastOfDay ? `Last done ${fmtDate(lastOfDay.finishedAt)}` : 'Not logged yet';
    swapMap(resolved.filter((r) => r.status !== 'unavailable').map((r) => getExercise(r.exerciseId)).filter(Boolean));
    renderList();
  }
  update();
}
